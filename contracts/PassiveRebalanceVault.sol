// SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3MintCallback.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";

import "../interfaces/IVault.sol";

/**
 * @title   Passive Rebalance Vault
 * @notice  A vault that provides liquidity on Uniswap V3 on behalf of users
 */
contract PassiveRebalanceVault is IVault, IUniswapV3MintCallback, ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    uint256 public constant MIN_TOTAL_SUPPLY = 1000;
    uint256 public constant DUST_THRESHOLD = 1000;

    IUniswapV3Pool public pool;
    IERC20 public token0;
    IERC20 public token1;
    uint24 public fee;
    int24 public tickSpacing;

    int24 public baseThreshold;
    int24 public limitThreshold;
    int24 public maxTwapDeviation;
    uint32 public twapDuration;
    uint256 public rebalanceCooldown;
    uint256 public maxTotalSupply;

    int24 public baseLower;
    int24 public baseUpper;
    int24 public limitLower;
    int24 public limitUpper;

    address public governance;
    address public pendingGovernance;
    bool public finalized;
    address public keeper;
    uint256 public lastUpdate;

    /**
     * @param _pool Underlying Uniswap V3 pool
     * @param _baseThreshold Half the width of base range order in ticks
     * @param _limitThreshold Width of limit range order in ticks
     * @param _maxTwapDeviation How much current price can deviate from TWAP
     * during rebalance
     * @param _twapDuration Duration of TWAP in seconds used for max TWAP
     * deviation check
     * @param _rebalanceCooldown How much time needs to pass between rebalance()
     * calls in seconds
     * @param _maxTotalSupply Users can't deposit if total supply would exceed
     * this limit. Value of 0 means no cap.
     */
    constructor(
        address _pool,
        int24 _baseThreshold,
        int24 _limitThreshold,
        int24 _maxTwapDeviation,
        uint32 _twapDuration,
        uint256 _rebalanceCooldown,
        uint256 _maxTotalSupply
    ) ERC20("Alpha Vault", "AV") {
        require(_pool != address(0));
        pool = IUniswapV3Pool(_pool);
        token0 = IERC20(pool.token0());
        token1 = IERC20(pool.token1());
        fee = pool.fee();
        tickSpacing = pool.tickSpacing();

        baseThreshold = _baseThreshold;
        limitThreshold = _limitThreshold;
        maxTwapDeviation = _maxTwapDeviation;
        twapDuration = _twapDuration;
        rebalanceCooldown = _rebalanceCooldown;
        maxTotalSupply = _maxTotalSupply;
        governance = msg.sender;

        require(_baseThreshold % tickSpacing == 0, "baseThreshold");
        require(_limitThreshold % tickSpacing == 0, "limitThreshold");
        require(_baseThreshold > 0, "baseThreshold");
        require(_limitThreshold > 0, "limitThreshold");
        require(_maxTwapDeviation >= 0, "maxTwapDeviation");
        _checkMidAndTwap();

        (baseLower, baseUpper) = _baseRange();
        (limitLower, limitUpper) = _limitRange();
    }

    /**
     * @notice Deposit tokens in proportion to the vault's holdings.
     * @param shares Number of vault shares to receive
     * @param amount0Max Revert if amount0 is larger than this
     * @param amount1Max Revert if amount1 is larger than this
     * @param to Recipient of vault shares
     * @return amount0 Amount of token0 paid by sender
     * @return amount1 Amount of token1 paid by sender
     */
    function deposit(
        uint256 shares,
        uint256 amount0Max,
        uint256 amount1Max,
        address to
    ) external override nonReentrant returns (uint256 amount0, uint256 amount1) {
        require(shares > 0, "shares");
        require(to != address(0), "to");

        if (totalSupply() == 0) {
            // For initial deposit, just place just base order and ignore limit order
            require(shares < type(uint128).max, "shares overflow");
            (amount0, amount1) = _mintLiquidity(
                baseLower,
                baseUpper,
                uint128(shares),
                msg.sender
            );

            // Lock the first MIN_TOTAL_SUPPLY shares
            require(shares > MIN_TOTAL_SUPPLY, "MIN_TOTAL_SUPPLY");
            shares = shares.sub(MIN_TOTAL_SUPPLY);
            _mint(address(this), MIN_TOTAL_SUPPLY);
        } else {
            // Calculate proportional liquidity
            uint128 baseLiquidity = _liquidityForShares(baseLower, baseUpper, shares);
            uint128 limitLiquidity = _liquidityForShares(limitLower, limitUpper, shares);

            // Round up to ensure sender is not underpaying
            baseLiquidity += baseLiquidity > 0 ? 2 : 0;
            limitLiquidity += limitLiquidity > 0 ? 2 : 0;

            // Deposit liquidity into Uniswap
            (uint256 base0, uint256 base1) =
                _mintLiquidity(baseLower, baseUpper, baseLiquidity, msg.sender);
            (uint256 limit0, uint256 limit1) =
                _mintLiquidity(limitLower, limitUpper, limitLiquidity, msg.sender);

            // Deposit tokens proportional to unused balances
            uint256 unused0 = _depositUnused(token0, shares);
            uint256 unused1 = _depositUnused(token1, shares);

            amount0 = base0.add(limit0).add(unused0);
            amount1 = base1.add(limit1).add(unused1);
        }

        require(amount0 <= amount0Max, "amount0Max");
        require(amount1 <= amount1Max, "amount1Max");

        // Mint shares
        _mint(to, shares);
        require(maxTotalSupply == 0 || totalSupply() <= maxTotalSupply, "maxTotalSupply");

        emit Deposit(msg.sender, to, shares, amount0, amount1);
    }

    /**
     * @notice Withdraw tokens in proportion to the vault's holdings.
     * @param shares Number of vault shares redeemed by sender
     * @param amount0Min Revert if amount0 is smaller than this
     * @param amount1Min Revert if amount1 is smaller than this
     * @param to Recipient of tokens
     * @return amount0 Amount of token0 returned to recipient
     * @return amount1 Amount of token1 returned to recipient
     */
    function withdraw(
        uint256 shares,
        uint256 amount0Min,
        uint256 amount1Min,
        address to
    ) external override nonReentrant returns (uint256 amount0, uint256 amount1) {
        require(shares > 0, "shares");
        require(to != address(0), "to");

        {
            // Calculate proportional liquidity
            uint128 baseLiquidity = _liquidityForShares(baseLower, baseUpper, shares);
            uint128 limitLiquidity = _liquidityForShares(limitLower, limitUpper, shares);

            // Burn shares
            _burn(msg.sender, shares);

            // Withdraw liquidity from Uniswap
            (uint256 base0, uint256 base1) =
                _burnLiquidity(baseLower, baseUpper, baseLiquidity, to, false);
            (uint256 limit0, uint256 limit1) =
                _burnLiquidity(limitLower, limitUpper, limitLiquidity, to, false);

            // Withdraw tokens proportional to unused balances
            uint256 unused0 = _withdrawUnused(token0, shares, to);
            uint256 unused1 = _withdrawUnused(token1, shares, to);

            amount0 = base0.add(limit0).add(unused0);
            amount1 = base1.add(limit1).add(unused1);
        }

        require(amount0 >= amount0Min, "amount0Min");
        require(amount1 >= amount1Min, "amount1Min");
        emit Withdraw(msg.sender, to, shares, amount0, amount1);
    }

    function rebalance() external override nonReentrant {
        require(keeper == address(0) || msg.sender == keeper, "keeper");
        require(block.timestamp >= lastUpdate.add(rebalanceCooldown), "cooldown");
        lastUpdate = block.timestamp;

        _checkMidAndTwap();

        // Withdraw all liquidity from Uniswap
        uint128 basePosition = _position(baseLower, baseUpper);
        uint128 limitPosition = _position(limitLower, limitUpper);
        _burnLiquidity(baseLower, baseUpper, basePosition, address(this), true);
        _burnLiquidity(limitLower, limitUpper, limitPosition, address(this), true);

        // Emit event with useful info
        (, int24 mid, , , , , ) = pool.slot0();
        uint256 balance0 = token0.balanceOf(address(this));
        uint256 balance1 = token1.balanceOf(address(this));
        emit Rebalance(mid, balance0, balance1, totalSupply());

        // Update base range and place order
        (baseLower, baseUpper) = _baseRange();
        uint128 baseLiquidity = _maxDepositable(baseLower, baseUpper);
        _mintLiquidity(baseLower, baseUpper, baseLiquidity, address(this));

        // Update limit range and place order
        (limitLower, limitUpper) = _limitRange();
        uint128 limitLiquidity = _maxDepositable(limitLower, limitUpper);
        _mintLiquidity(limitLower, limitUpper, limitLiquidity, address(this));

        // Check base and limit ranges aren't the same, otherwise calculations
        // would fail elsewhere
        assert(baseLower != limitLower || baseUpper != limitUpper);
    }

    /// @dev Callback for Uniswap V3 pool.
    function uniswapV3MintCallback(
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external override {
        require(msg.sender == address(pool));
        address payer = abi.decode(data, (address));

        if (payer == address(this)) {
            if (amount0 > 0) token0.safeTransfer(msg.sender, amount0);
            if (amount1 > 0) token1.safeTransfer(msg.sender, amount1);
        } else {
            if (amount0 > 0) token0.safeTransferFrom(payer, msg.sender, amount0);
            if (amount1 > 0) token1.safeTransferFrom(payer, msg.sender, amount1);
        }
    }

    /**
     * @notice Calculates total holdings of token0 and token1, i.e. how
     * much this vault would hold if it withdrew all its liquidity.
     */
    function getTotalAmounts() external view override returns (uint256 total0, uint256 total1) {
        (, uint256 base0, uint256 base1) = getBasePosition();
        (, uint256 limit0, uint256 limit1) = getLimitPosition();
        total0 = token0.balanceOf(address(this)).add(base0).add(limit0);
        total1 = token1.balanceOf(address(this)).add(base1).add(limit1);
    }

    function getBasePosition()
        public
        view
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        liquidity = _position(baseLower, baseUpper);
        (amount0, amount1) = _amountsForLiquidity(baseLower, baseUpper, liquidity);
    }

    function getLimitPosition()
        public
        view
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        liquidity = _position(limitLower, limitUpper);
        (amount0, amount1) = _amountsForLiquidity(limitLower, limitUpper, liquidity);
    }

    function getTwap() public view returns (int24) {
        uint32[] memory secondsAgo = new uint32[](2);
        secondsAgo[0] = twapDuration;
        secondsAgo[1] = 0;

        (int56[] memory tickCumulatives, ) = pool.observe(secondsAgo);
        return int24((tickCumulatives[1] - tickCumulatives[0]) / twapDuration);
    }

    function _mintLiquidity(
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        address payer
    ) internal returns (uint256 amount0, uint256 amount1) {
        if (liquidity > 0) {
            (amount0, amount1) = pool.mint(
                address(this),
                tickLower,
                tickUpper,
                liquidity,
                abi.encode(payer)
            );
        }
    }

    function _burnLiquidity(
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        address to,
        bool collectAll
    ) internal returns (uint256 amount0, uint256 amount1) {
        if (liquidity > 0) {
            // Burn liquidity
            (uint256 owed0, uint256 owed1) = pool.burn(tickLower, tickUpper, liquidity);

            // Collect amount owed
            uint128 collect0 = collectAll ? type(uint128).max : uint128(owed0);
            uint128 collect1 = collectAll ? type(uint128).max : uint128(owed1);
            if (collect0 > 0 || collect1 > 0) {
                (amount0, amount1) = pool.collect(to, tickLower, tickUpper, collect0, collect1);
            }
        }
    }

    function _depositUnused(IERC20 token, uint256 shares) internal returns (uint256 amount) {
        uint256 balance = token.balanceOf(address(this));
        if (balance > DUST_THRESHOLD) {
            // Add 1 to round up
            amount = balance.mul(shares).div(totalSupply()).add(1);
            token.safeTransferFrom(msg.sender, address(this), amount);
        }
    }

    function _withdrawUnused(
        IERC20 token,
        uint256 shares,
        address to
    ) internal returns (uint256 amount) {
        uint256 balance = token.balanceOf(address(this));
        if (balance > DUST_THRESHOLD) {
            amount = balance.mul(shares).div(totalSupply());
            token.safeTransfer(to, amount);
        }
    }

    /// @dev Revert if current price is too close to min or max ticks allowed
    /// by Uniswap, or if it deviates too much from the TWAP. Should be called
    /// whenever base and limit ranges are updated.
    function _checkMidAndTwap() internal view {
        (, int24 mid, , , , , ) = pool.slot0();
        int24 maxThreshold = baseThreshold > limitThreshold ? baseThreshold : limitThreshold;
        require(mid > TickMath.MIN_TICK + maxThreshold + tickSpacing, "price too low");
        require(mid < TickMath.MAX_TICK - maxThreshold - tickSpacing, "price too high");

        // Check TWAP deviation. This check prevents price manipulation before
        // the rebalance and also avoids rebalancing when price has just spiked.
        int24 twap = getTwap();
        int24 deviation = mid > twap ? mid - twap : twap - mid;
        require(deviation <= maxTwapDeviation, "maxTwapDeviation");
    }

    /// @dev Return lower and upper ticks for the base order. This order is
    /// symmetric around the current mid and its width in ticks is double of
    /// `baseThreshold`.
    function _baseRange() internal view returns (int24, int24) {
        (, int24 mid, , , , , ) = pool.slot0();
        int24 midFloor = _floor(mid);
        int24 midCeil = midFloor + tickSpacing;
        return (midFloor - baseThreshold, midCeil + baseThreshold);
    }

    /// @dev Return lower and upper ticks for the limit order. This order helps
    /// the vault rebalance closer to 50/50 and is either just above or just
    /// below the current mid. Its width in ticks is equal to `limitThreshold`.
    function _limitRange() internal view returns (int24, int24) {
        (, int24 mid, , , , , ) = pool.slot0();
        int24 midFloor = _floor(mid);
        int24 midCeil = midFloor + tickSpacing;
        (int24 bidLower, int24 bidUpper) = (midFloor - limitThreshold, midFloor);
        (int24 askLower, int24 askUpper) = (midCeil, midCeil + limitThreshold);
        return
            (_maxDepositable(bidLower, bidUpper) > _maxDepositable(askLower, askUpper))
                ? (bidLower, bidUpper)
                : (askLower, askUpper);
    }

    /// @dev Convert shares into amount of liquidity. Shouldn't be called
    /// when total supply is 0.
    function _liquidityForShares(
        int24 tickLower,
        int24 tickUpper,
        uint256 shares
    ) internal view returns (uint128) {
        uint256 position = uint256(_position(tickLower, tickUpper));
        uint256 liquidity = position.mul(shares).div(totalSupply());
        require(liquidity < type(uint128).max, "liquidity overflow");
        return uint128(liquidity);
    }

    /// @dev Amount of liquidity deposited by vault into Uniswap V3 pool for a
    /// certain range.
    function _position(int24 tickLower, int24 tickUpper)
        internal
        view
        returns (uint128 liquidity)
    {
        bytes32 positionKey = keccak256(abi.encodePacked(address(this), tickLower, tickUpper));
        (liquidity, , , , ) = pool.positions(positionKey);
    }

    /// @dev Maximum liquidity that can deposited in range by vault given
    /// its balances of token0 and token1.
    function _maxDepositable(int24 tickLower, int24 tickUpper) internal view returns (uint128) {
        uint256 balance0 = token0.balanceOf(address(this));
        uint256 balance1 = token1.balanceOf(address(this));
        return _liquidityForAmounts(tickLower, tickUpper, balance0, balance1);
    }

    /// @dev Round tick down towards negative infinity so that it is a multiple
    /// of tickSpacing.
    function _floor(int24 tick) internal view returns (int24) {
        int24 compressed = tick / tickSpacing;
        if (tick < 0 && tick % tickSpacing != 0) {
            compressed--;
        }
        return compressed * tickSpacing;
    }

    function _amountsForLiquidity(
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity
    ) internal view returns (uint256, uint256) {
        (uint160 sqrtRatioX96, , , , , , ) = pool.slot0();
        return
            LiquidityAmounts.getAmountsForLiquidity(
                sqrtRatioX96,
                TickMath.getSqrtRatioAtTick(tickLower),
                TickMath.getSqrtRatioAtTick(tickUpper),
                liquidity
            );
    }

    function _liquidityForAmounts(
        int24 tickLower,
        int24 tickUpper,
        uint256 amount0,
        uint256 amount1
    ) internal view returns (uint128) {
        (uint160 sqrtRatioX96, , , , , , ) = pool.slot0();
        return
            LiquidityAmounts.getLiquidityForAmounts(
                sqrtRatioX96,
                TickMath.getSqrtRatioAtTick(tickLower),
                TickMath.getSqrtRatioAtTick(tickUpper),
                amount0,
                amount1
            );
    }

    /**
     * @notice Set base threshold B. From the next rebalance, the strategy will
     * move the base order to the range [floor(mid) - B, ceil(mid) + B].
     */
    function setBaseThreshold(int24 _baseThreshold) external onlyGovernance {
        require(_baseThreshold % tickSpacing == 0, "baseThreshold");
        require(_baseThreshold > 0, "baseThreshold");
        baseThreshold = _baseThreshold;
    }

    /**
     * @notice Set limit threshold S. From the next rebalance, the strategy
     * will move the limit order to the range [floor(mid) - S, floor(mid)] or
     * [ceil(mid), ceil(mid) + S] depending on which token it holds more of.
     */
    function setLimitThreshold(int24 _limitThreshold) external onlyGovernance {
        require(_limitThreshold % tickSpacing == 0, "limitThreshold");
        require(_limitThreshold > 0, "limitThreshold");
        limitThreshold = _limitThreshold;
    }

    /**
     * @notice rebalance() will revert if the current price in ticks differs
     * from the TWAP by more than this deviation. This avoids placing orders
     * during a price spike, and mitigates price manipulation.
     */
    function setMaxTwapDeviation(int24 _maxTwapDeviation) external onlyGovernance {
        require(_maxTwapDeviation >= 0, "maxTwapDeviation");
        maxTwapDeviation = _maxTwapDeviation;
    }

    /**
     * @notice Set duration of TWAP in seconds used for max TWAP deviations
     * check.
     */
    function setTwapDuration(uint32 _twapDuration) external onlyGovernance {
        twapDuration = _twapDuration;
    }

    /**
     * @notice Set the number of seconds needed to pass between rebalances.
     */
    function setRebalanceCooldown(uint256 _rebalanceCooldown) external onlyGovernance {
        rebalanceCooldown = _rebalanceCooldown;
    }

    /**
     * @notice Set maximum allowed total supply for a guarded launch. Users
     * can't deposit via mint() if their deposit would cause the total supply
     * to exceed this cap. A value of 0 means no limit.
     */
    function setMaxTotalSupply(uint256 _maxTotalSupply) external onlyGovernance {
        maxTotalSupply = _maxTotalSupply;
    }

    /**
     * @notice Governance address is not updated until the new governance
     * address has called acceptGovernance() to accept this responsibility.
     */
    function setGovernance(address _governance) external onlyGovernance {
        pendingGovernance = _governance;
    }

    /**
     * @notice Set keeper. If set, rebalance() can only be called by the keeper.
     * If equal to address zero, rebalance() can be called by any account.
     */
    function setKeeper(address _keeper) external onlyGovernance {
        keeper = _keeper;
    }

    /**
     * @notice Renounce emergency powers.
     */
    function finalize() external onlyGovernance {
        finalized = true;
    }

    /**
     * @notice Transfer tokens to governance in case of emergency. Cannot be
     * called if already finalized.
     */
    function emergencyWithdraw(IERC20 token, uint256 amount) external onlyGovernance {
        require(!finalized, "finalized");
        token.safeTransfer(msg.sender, amount);
    }

    /**
     * @notice Burn liquidity and transfer tokens to governance in case of
     * emergency. Cannot be called if already finalized.
     */
    function emergencyBurn(
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity
    ) external onlyGovernance {
        require(!finalized, "finalized");
        _burnLiquidity(tickLower, tickUpper, liquidity, msg.sender, true);
    }

    /**
     * @notice setGovernance() should be called by the existing governance
     * address prior to calling this function.
     */
    function acceptGovernance() external {
        require(msg.sender == pendingGovernance, "pendingGovernance");
        governance = msg.sender;
    }

    modifier onlyGovernance {
        require(msg.sender == governance, "governance");
        _;
    }
}
