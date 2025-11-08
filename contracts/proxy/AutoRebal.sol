// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;
pragma abicoder v2;

import "../interfaces/IHypervisor.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";

contract AutoRebal {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  address public admin;
  address public advisor;
  address public feeRecipient;
  IHypervisor public hypervisor;
  int24 public limitWidth = 1;

  event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
  event AdvisorTransferred(address indexed previousAdvisor, address indexed newAdvisor);
  event FeeRecipientSet(address indexed recipient);
  event ClearanceWidthSet(int24 previousWidth, int24 newWidth);

  modifier onlyAdvisor {
    require(msg.sender == advisor, "only advisor");
    _;
  }

  modifier onlyAdmin {
    require(msg.sender == admin, "only admin");
    _;
  }

  constructor(address _admin, address _advisor, address _hypervisor) {
    require(_admin != address(0), "_admin should be non-zero");
    require(_advisor != address(0), "_advisor should be non-zero");
    require(_hypervisor != address(0), "_hypervisor should be non-zero");
    admin = _admin;
    advisor = _advisor;
    hypervisor = IHypervisor(_hypervisor);
  }

  /// @notice Helper to assess whether we have excess token0 or token1 outside the base range
  /// @return token0Limit true if token0 excess should be placed in an upper limit; false if token1 excess (lower limit)
  /// @return currentTick current pool tick pulled from the hypervisor's pool
  function liquidityOptions() public view returns (bool token0Limit, int24 currentTick) {
    (uint256 total0, uint256 total1) = hypervisor.getTotalAmounts();

    uint160 sqrtRatioX96;
    (sqrtRatioX96, currentTick, , , , , ) = hypervisor.pool().slot0();

    uint128 liqInBase = LiquidityAmounts.getLiquidityForAmounts(
      sqrtRatioX96,
      TickMath.getSqrtRatioAtTick(hypervisor.baseLower()),
      TickMath.getSqrtRatioAtTick(hypervisor.baseUpper()),
      total0,
      total1
    );

    (uint256 amt0InBase, uint256 amt1InBase) = LiquidityAmounts.getAmountsForLiquidity(
      sqrtRatioX96,
      TickMath.getSqrtRatioAtTick(hypervisor.baseLower()),
      TickMath.getSqrtRatioAtTick(hypervisor.baseUpper()),
      liqInBase
    );

    // Guard against underflow (should not happen, but safer)
    if (total0 < amt0InBase || total1 < amt1InBase) {
      return (false, currentTick);
    }

    // price = (sqrtP^2) / 2^192
    uint256 price = FullMath.mulDiv(uint256(sqrtRatioX96), uint256(sqrtRatioX96), (uint256(1) << 192));

    // If (excess0 * price) > excess1 => token0 excess dominates -> place limit ABOVE current range
    token0Limit = (total0 - amt0InBase).mul(price) > (total1 - amt1InBase);
  }

  /// @notice Rebalance to base range plus a one-sided limit range chosen from inventory
  /// @param outMin Minimum amounts expected out of the rebalance call (hypervisor-specific semantics)
  /// @return limitLower lower tick of the new limit position
  /// @return limitUpper upper tick of the new limit position
  function autoRebalance(
    uint256[4] memory outMin
  ) external onlyAdvisor returns (int24 limitLower, int24 limitUpper) {
    (bool token0Limit, int24 currentTick) = liquidityOptions();

    int24 spacing = hypervisor.tickSpacing();
    // Align to spacing grid around current tick
    if (!token0Limit) {
      // Extra token1 -> put limit BELOW current price
      limitUpper = (currentTick / spacing) * spacing - spacing;
      if (limitUpper == currentTick) limitUpper = limitUpper - spacing;
      limitLower = limitUpper - spacing * limitWidth;
    } else {
      // Extra token0 -> put limit ABOVE current price
      limitLower = (currentTick / spacing) * spacing + spacing;
      if (limitLower == currentTick) limitLower = limitLower + spacing;
      limitUpper = limitLower + spacing * limitWidth;
    }

    uint256[4] memory inMin; // empty inMin; adapter/hypervisor may treat zeros as "accept"
    hypervisor.rebalance(
      hypervisor.baseLower(),
      hypervisor.baseUpper(),
      limitLower,
      limitUpper,
      feeRecipient,
      inMin,
      outMin
    );
  }

  /// @notice Compound pending fees back into positions
  /// @return baseToken0Owed amount of token0 fees from base range
  /// @return baseToken1Owed amount of token1 fees from base range
  /// @return limitToken0Owed amount of token0 fees from limit range
  /// @return limitToken1Owed amount of token1 fees from limit range
  function compound()
    external
    onlyAdvisor
    returns (
      uint128 baseToken0Owed,
      uint128 baseToken1Owed,
      uint128 limitToken0Owed,
      uint128 limitToken1Owed
    )
  {
    return hypervisor.compound();
  }

  /// @notice Transfer admin role
  function transferAdmin(address newAdmin) external onlyAdmin {
    require(newAdmin != address(0), "newAdmin should be non-zero");
    emit AdminTransferred(admin, newAdmin);
    admin = newAdmin;
  }

  /// @notice Transfer advisor role
  function transferAdvisor(address newAdvisor) external onlyAdmin {
    require(newAdvisor != address(0), "newAdvisor should be non-zero");
    emit AdvisorTransferred(advisor, newAdvisor);
    advisor = newAdvisor;
  }

  /// @notice Transfer tokens to recipient from the contract
  function rescueERC20(IERC20 token, address recipient) external onlyAdmin {
    require(recipient != address(0), "recipient should be non-zero");
    uint256 bal = token.balanceOf(address(this));
    token.safeTransfer(recipient, bal);
  }

  /// @notice Set fee recipient (can only be set once)
  function setRecipient(address _recipient) external onlyAdmin {
    require(_recipient != address(0), "recipient should be non-zero");
    require(feeRecipient == address(0), "fee recipient already set");
    feeRecipient = _recipient;
    emit FeeRecipientSet(_recipient);
  }

  /// @notice Adjust the width (in ticks*spacing) of the limit range
  function setLimitWidth(int24 _width) external onlyAdmin {
    require(_width > 0, "width must be > 0");
    emit ClearanceWidthSet(limitWidth, _width);
    limitWidth = _width;
  }
}
