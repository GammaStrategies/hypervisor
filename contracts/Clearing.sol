/// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;
pragma abicoder v2;

import "./interfaces/IHypervisor.sol";
import "./interfaces/IRedstoneOracle.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";

interface IERC20Metadata is IERC20 {
  function decimals() external view returns (uint8);
}

/// @title Clearing v1.2.3
/// @notice Proxy contract for hypervisor positions management
contract Clearing is ReentrancyGuard {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;
  using SignedSafeMath for int256;

  string constant VERSION = '1.2.3';
  address public owner;
  mapping(address => Position) public positions;

  IRedstoneOracle public redstoneOracle;
  uint32 public twapInterval = 120;
  uint256 public depositDelta = 1003;
  uint256 public deltaScale = 1000; /// must be a power of 10
  uint256 public priceThreshold = 1010;
  uint256 public oraclePriceThreshold = 1010;
  uint256 constant MAX_UINT = 2**256 - 1;
  uint256 public constant PRECISION = 1e36;

  struct Position {
    bool zeroDeposit;
    bool customRatio;
    bool ratioRemoved;
    bool depositOverride; // force custom deposit constraints
    bool oracleCheckEnabled;    // if true, force oracle price check
    bool twapCheckEnabled;      // if true, force twap check
    uint8 version; 
    uint32 twapInterval; // override global twap
    uint256 priceThreshold; // custom price threshold
    uint256 oraclePriceThreshold; // custom oracle price threshold
    uint256 deposit0Max;
    uint256 deposit1Max;
    uint256 maxTotalSupply;
    mapping(uint8 => uint256) fauxTotal;
    mapping(address=>bool) list; // whitelist certain accounts for freedeposit
  }

  event PositionAdded(address, uint8);
  event CustomDeposit(address, uint256, uint256, uint256);
  event PriceThresholdSet(uint256 _priceThreshold);
  event DepositDeltaSet(uint256 _depositDelta);
  event DeltaScaleSet(uint256 _deltaScale);
  event TwapIntervalSet(uint32 _twapInterval);
  event TwapOverrideSet(address pos, uint32 _twapInterval, uint256 _priceThreshold);
  event OracleOverrideSet(address pos, uint256 _oraclePriceThreshold);
  event PriceThresholdPosSet(address pos, uint256 _priceThreshold);
  event DepositZeroToggled();
  event DepositOverrideSet(address pos, bool enabled);
  event DepositZeroOverrideSet(address pos, bool enabled);
  event TwapCheckEnabledSet(address pos, bool enabled);
  event OracleCheckEnabledSet(address pos, bool enabled);
  event ListAppended(address pos, address[] listed);
  event ListRemoved(address pos, address listed);
  event CustomRatio(address pos, uint256 fauxTotal0, uint256 fauxTotal1);
  event RatioRemoved(address pos);

  constructor(IRedstoneOracle redstoneOracle_) {
    owner = msg.sender;
    redstoneOracle = redstoneOracle_;
  }

  modifier onlyAddedPosition(address pos) {
    Position storage p = positions[pos];
    require(p.version != 0, "not added");
    _;
  }

  /// @notice Add the hypervisor position
  /// @param pos Address of the hypervisor
  /// @param version Type of hypervisor
  function addPosition(address pos, uint8 version) external onlyOwner {
    Position storage p = positions[pos];
    require(p.version == 0, 'already added');
    require(version > 0, 'version < 1');
    p.version = version;
    p.twapCheckEnabled = true;
    IHypervisor(pos).token0().safeApprove(pos, MAX_UINT);
    IHypervisor(pos).token1().safeApprove(pos, MAX_UINT);
    emit PositionAdded(pos, version);
  }

  /// @notice apply configuration constraints to shares minted 
  /// @param pos Address of the hypervisor
  /// @param shares Amount of shares minted (included for upgrades)
  /// @return cleared whether shares are cleared 
  function clearShares(
    address pos,
    uint256 shares 
  ) public view onlyAddedPosition(pos) returns (bool cleared) {
    if(positions[pos].maxTotalSupply != 0) {
      require(IHypervisor(pos).totalSupply() <= positions[pos].maxTotalSupply, "exceeds max supply");
    }
    return true;
  }

  /// @notice apply configuration constraints to deposit 
  /// @param pos Address of the hypervisor
  /// @param deposit0 Amount of token0 to deposit
  /// @param deposit1 Amount of token1 to deposit
  /// @param to Address to receive liquidity tokens
  /// @param pos Hypervisor Address
  /// @param redstonePayload payload inputted by depositor
  /// @return cleared whether deposit is cleared 
  function clearDeposit(
    uint256 deposit0,
    uint256 deposit1,
    address from,
    address to,
    address pos,
    bytes calldata redstonePayload
  ) public view onlyAddedPosition(pos) returns (bool cleared) {
    require(to != address(0), "to should be non-zero");
    Position storage p = positions[pos];
    if(!positions[pos].list[from]) {
      if(!p.zeroDeposit) require(deposit0 > 0 && deposit1 > 0, "must deposit to both sides");
      if (deposit0 > 0 && !p.zeroDeposit) {
        (uint256 test1Min, uint256 test1Max) = getDepositAmount(pos, address(IHypervisor(pos).token0()), deposit0);
        require(deposit1 >= test1Min && deposit1 <= test1Max, "Improper ratio"); 
      }
      if (deposit1 > 0 && !p.zeroDeposit) {
        (uint256 test0Min, uint256 test0Max) = getDepositAmount(pos, address(IHypervisor(pos).token1()), deposit1);
        require(deposit0 >= test0Min && deposit0 <= test0Max, "Improper ratio"); 
      }
    }

    if (p.oracleCheckEnabled) {
      checkPriceAgainstRedstoneOracle(pos, redstonePayload);
    }
    
    if (p.twapCheckEnabled) {
      checkPriceChange(pos);
    }

    if (p.depositOverride && !positions[pos].list[from]) {
      if (p.deposit0Max > 0) {
        require(deposit0 <= p.deposit0Max, "token0 exceeds");
      }
      if (p.deposit1Max > 0) {
        require(deposit1 <= p.deposit1Max, "token1 exceeds");
      }
    }
    return true;
  }

  /// @notice Get the amount of token to deposit for the given amount of pair token
  /// @param pos Hypervisor Address
  /// @param token Address of token to deposit
  /// @param _deposit Amount of token to deposit
  /// @return amountStart Minimum amounts of the pair token to deposit
  /// @return amountEnd Maximum amounts of the pair token to deposit
  function getDepositAmount(
    address pos,
    address token,
    uint256 _deposit
  ) public view returns (uint256 amountStart, uint256 amountEnd) {
    require(token == address(IHypervisor(pos).token0()) || token == address(IHypervisor(pos).token1()), "token mistmatch");
    require(_deposit > 0, "deposits can't be zero");
    (uint256 total0, uint256 total1) = IHypervisor(pos).getTotalAmounts();
    if (IHypervisor(pos).totalSupply() == 0 || total0 == 0 || total1 == 0) {
      amountStart = 0;
      if (token == address(IHypervisor(pos).token0())) {
        amountEnd = IHypervisor(pos).deposit1Max();
      } else {
        amountEnd = IHypervisor(pos).deposit0Max();
      }
    } else {
      (uint256 ratioStart, uint256 ratioEnd) = positions[pos].customRatio ? 
        applyRatio(pos, token, positions[pos].fauxTotal[0], positions[pos].fauxTotal[1]) :
        applyRatio(pos, token, total0, total1);
      amountStart = FullMath.mulDiv(_deposit, PRECISION, ratioStart);
      amountEnd = FullMath.mulDiv(_deposit, PRECISION, ratioEnd);
    }
  }

  /// @notice Get range for deposit based on provided amounts
  /// @param pos Hypervisor Address
  /// @param token Address of token to deposit
  /// @param total0 Amount of token0 in hype 
  /// @param total1 Amount of token1 in hype 
  /// @return ratioStart Minimum amounts of the pair token to deposit
  /// @return ratioEnd Maximum amounts of the pair token to deposit
  function applyRatio(
    address pos,
    address token,
    uint256 total0,
    uint256 total1
  ) public view returns (uint256 ratioStart, uint256 ratioEnd) {
    require(token == address(IHypervisor(pos).token0()) || token == address(IHypervisor(pos).token1()), "token mistmatch");
    if (token == address(IHypervisor(pos).token0())) {
      ratioStart = FullMath.mulDiv(total0.mul(depositDelta), PRECISION, total1.mul(deltaScale));
      ratioEnd = FullMath.mulDiv(total0.mul(deltaScale), PRECISION, total1.mul(depositDelta));
    } else {
      ratioStart = FullMath.mulDiv(total1.mul(depositDelta), PRECISION, total0.mul(deltaScale));
      ratioEnd = FullMath.mulDiv(total1.mul(deltaScale), PRECISION, total0.mul(depositDelta));
    }
  }

  /// @notice Check if the price change overflows or not based on given twap and threshold in the hypervisor
  /// @param pos Hypervisor Address
  /// @return price Current price
  function checkPriceChange(
    address pos
  ) public view returns (uint256 price) {

    (uint160 sqrtPrice, , , , , , ) = IHypervisor(pos).pool().slot0();
    price = FullMath.mulDiv(uint256(sqrtPrice).mul(uint256(sqrtPrice)), PRECISION, 2**(96 * 2));

    uint32 _twapInterval;
    uint256 _priceThreshold;
    if (positions[pos].twapInterval == 0) {
      _twapInterval = twapInterval;
      _priceThreshold = priceThreshold;
    } else {
      _twapInterval = positions[pos].twapInterval;
      _priceThreshold = positions[pos].priceThreshold;
    }
    uint160 sqrtPriceBefore = getSqrtTwapX96(pos, _twapInterval);
    uint256 priceBefore = FullMath.mulDiv(uint256(sqrtPriceBefore).mul(uint256(sqrtPriceBefore)), PRECISION, 2**(96 * 2));
    if (price.mul(1000).div(priceBefore) > _priceThreshold || priceBefore.mul(1000).div(price) > _priceThreshold)
      revert("Price change Overflow");
  }

  /// @notice Check if the price change overflows or not based on given twap and threshold in the hypervisor
  /// @param pos Hypervisor Address
  /// @param redstonePayload payload inputted by depositor
  function checkPriceAgainstRedstoneOracle(
    address pos,
    bytes calldata redstonePayload
  ) internal view {
    (uint160 sqrtPrice, , , , , , ) = IHypervisor(pos).pool().slot0();
    uint8 token0Decimals = IERC20Metadata(address(IHypervisor(pos).token0())).decimals();
    uint8 token1Decimals = IERC20Metadata(address(IHypervisor(pos).token1())).decimals();
    uint256 decimalsMuliplier;
    uint256 price;
    if (token0Decimals > token1Decimals) {
      decimalsMuliplier = 10**(token0Decimals - token1Decimals);
      price = FullMath.mulDiv(uint256(sqrtPrice).mul(uint256(sqrtPrice)).mul(decimalsMuliplier), PRECISION, 2**(96 * 2));
    } else {
      decimalsMuliplier = 10**(token1Decimals - token0Decimals);
      price = FullMath.mulDiv(uint256(sqrtPrice).mul(uint256(sqrtPrice)).div(decimalsMuliplier), PRECISION, 2**(96 * 2));
    }
    uint256 oraclePrice = getPriceFromRedstoneOracle(pos, redstonePayload).mul(1e18);
    uint256 _oraclePriceThreshold = positions[pos].oraclePriceThreshold != 0 ? positions[pos].oraclePriceThreshold : oraclePriceThreshold;
    if (price.mul(1000).div(oraclePrice) > _oraclePriceThreshold || oraclePrice.mul(1000).div(price) > _oraclePriceThreshold)
     revert("Too large deviation from oracle price");
  }

  /// @notice Get the sqrt price before the given interval
  /// @param pos Hypervisor Address
  /// @param _twapInterval Time intervals
  /// @return sqrtPriceX96 Sqrt price before interval
  function getSqrtTwapX96(address pos, uint32 _twapInterval) public view returns (uint160 sqrtPriceX96) {
    if (_twapInterval == 0) {
      /// return the current price if _twapInterval == 0
      (sqrtPriceX96, , , , , , ) = IHypervisor(pos).pool().slot0();
    } 
    else {
      uint32[] memory secondsAgos = new uint32[](2);
      secondsAgos[0] = _twapInterval; /// from (before)
      secondsAgos[1] = 0; /// to (now)

      (int56[] memory tickCumulatives, ) = IHypervisor(pos).pool().observe(secondsAgos);

      /// tick(imprecise as it's an integer) to price
      sqrtPriceX96 = TickMath.getSqrtRatioAtTick(
        int24((tickCumulatives[1] - tickCumulatives[0]) / _twapInterval)
      );
    }
  }

  /// @param _priceThreshold Price Threshold
  function setPriceThreshold(uint256 _priceThreshold) external onlyOwner {
    priceThreshold = _priceThreshold;
    emit PriceThresholdSet(_priceThreshold);
  }

  /// @param _depositDelta Number to calculate deposit ratio
  function setDepositDelta(uint256 _depositDelta) external onlyOwner {
    depositDelta = _depositDelta;
    emit DepositDeltaSet(_depositDelta);
  }

  /// @param _deltaScale Number to calculate deposit ratio
  function setDeltaScale(uint256 _deltaScale) external onlyOwner {
    deltaScale = _deltaScale;
    emit DeltaScaleSet(_deltaScale);
  }

  /// @param pos Hypervisor address
  /// @param deposit0Max Amount of maximum deposit amounts of token0
  /// @param deposit1Max Amount of maximum deposit amounts of token1
  /// @param maxTotalSupply Maximum total suppoy of hypervisor
  function customDeposit(
    address pos,
    uint256 deposit0Max,
    uint256 deposit1Max,
    uint256 maxTotalSupply
  ) external onlyOwner onlyAddedPosition(pos) {
    Position storage p = positions[pos];
    p.deposit0Max = deposit0Max;
    p.deposit1Max = deposit1Max;
    p.maxTotalSupply = maxTotalSupply;
    emit CustomDeposit(pos, deposit0Max, deposit1Max, maxTotalSupply);
  }

  /// @param pos Hypervisor address
  /// @param customRatio whether to use custom ratio 
  /// @param fauxTotal0 override total0
  /// @param fauxTotal1 override total1 
  function customRatio(
    address pos,
    bool customRatio,
    uint256 fauxTotal0,
    uint256 fauxTotal1
  ) external onlyOwner onlyAddedPosition(pos) {
    require(!positions[pos].ratioRemoved, "custom ratio is no longer available");
    Position storage p = positions[pos];
    p.customRatio = customRatio;
    p.fauxTotal[0] = fauxTotal0;
    p.fauxTotal[1] = fauxTotal1;
    emit CustomRatio(pos, fauxTotal0, fauxTotal1);
  }

  // @note permantently remove ability to apply custom ratio to hype
  function removeRatio(address pos) external onlyOwner onlyAddedPosition(pos) {
    Position storage p = positions[pos];
    p.ratioRemoved = true;
    emit RatioRemoved(pos);
  }

  /// @notice Toggle deposit override
  /// @param pos Hypervisor Address
  /// @param enabled if true, enable custom deposit constraint
  function setDepositOverride(address pos, bool enabled) external onlyOwner onlyAddedPosition(pos) {
    Position storage p = positions[pos];
    p.depositOverride = enabled;
    emit DepositOverrideSet(pos, enabled);
  }

  /// @notice Toggle free deposit of the given hypervisor
  /// @param pos Hypervisor Address
  /// @param enabled if true, enable zero deposit
  function setDepositZeroOverride(address pos, bool enabled) external onlyOwner onlyAddedPosition(pos) {
    Position storage p = positions[pos];
    p.zeroDeposit = enabled;
    emit DepositZeroOverrideSet(pos, enabled);
  }

  /// @param _twapInterval Time intervals
  function setTwapInterval(uint32 _twapInterval) external onlyOwner {
    twapInterval = _twapInterval;
    emit TwapIntervalSet(_twapInterval);
  }

  /// @param pos Hypervisor Address
  /// @param _twapInterval Time Intervals
  /// @param _priceThreshold Price Threshold
  function setTwapOverride(address pos, uint32 _twapInterval, uint256 _priceThreshold) external onlyOwner onlyAddedPosition(pos) {
    Position storage p = positions[pos];
    p.twapInterval = _twapInterval;
    p.priceThreshold = _priceThreshold;
    emit TwapOverrideSet(pos, _twapInterval, _priceThreshold);
  }

  /// @param pos Hypervisor Address
  /// @param _oraclePriceThreshold Oracle Price Threshold
  function setOracleOverride(address pos, uint256 _oraclePriceThreshold) external onlyOwner onlyAddedPosition(pos) {
    Position storage p = positions[pos];
    p.oraclePriceThreshold = _oraclePriceThreshold;
    emit OracleOverrideSet(pos, _oraclePriceThreshold);
  }

  /// @param pos Hypervisor address
  /// @param enabled if true, force to check twap price change
  function setTwapCheckEnabled(address pos, bool enabled) external onlyOwner {
    Position storage p = positions[pos];
    p.twapCheckEnabled = enabled;
    emit TwapCheckEnabledSet(pos, enabled);
  }

  /// @param pos Hypervisor address
  /// @param enabled if true, force to check oracle price change
  function setOracleCheckEnabled(address pos, bool enabled) external onlyOwner {
    Position storage p = positions[pos];
    p.oracleCheckEnabled = enabled;
    emit OracleCheckEnabledSet(pos, enabled);
  }

  // @notice check if an address is whitelisted for hype
  function getListed(address pos, address i) public view returns(bool) {
    Position storage p = positions[pos];
    return p.list[i];
  }

  /// @notice Append whitelist to hypervisor
  /// @param pos Hypervisor Address
  /// @param listed Address array to add in whitelist
  function appendList(address pos, address[] memory listed) external onlyOwner onlyAddedPosition(pos) {
    Position storage p = positions[pos];
    for (uint8 i; i < listed.length; i++) {
      p.list[listed[i]] = true;
    }
    emit ListAppended(pos, listed);
  }

  /// @notice Remove address from whitelist
  /// @param pos Hypervisor Address
  /// @param listed Address to remove from whitelist
  function removeListed(address pos, address listed) external onlyOwner onlyAddedPosition(pos) {
    Position storage p = positions[pos];
    p.list[listed] = false;
    emit ListRemoved(pos, listed);
  }

  function transferOwnership(address newOwner) external onlyOwner {
    require(newOwner != address(0), "newOwner should be non-zero");
    owner = newOwner;
  }

  modifier onlyOwner {
    require(msg.sender == owner, "only owner");
    _;
  }

  /// @param pos Hypervisor address
  /// @param redstonePayload payload of redstone price data
  function getPriceFromRedstoneOracle(address pos, bytes calldata redstonePayload) public view returns(uint256) {
    return redstoneOracle.extractPrice(
      address(IHypervisor(pos).token0()),
      address(IHypervisor(pos).token1()),
      redstonePayload
    );    
  }

}
