pragma abicoder v2;

import "./interfaces/IHypervisor.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";

contract UniProxy is ReentrancyGuard {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;
  using SignedSafeMath for int256;

  mapping(address => Position) public positions;

  address public owner;
  bool public freeDeposit = false;
  bool public twapCheck = false;
  uint32 public twapInterval = 1 hours;
  uint256 public depositDelta = 1010;
  uint256 public deltaScale = 1000; // must be a power of 10
  uint256 public priceThreshold = 100;

  uint256 MAX_INT = 2**256 - 1;

  struct Position {
    uint8 version; // 1->3 proxy 3 transfers, 2-> proxy two transfers, 3-> proxy no transfers
    mapping(address=>bool) list; // whitelist certain accounts for freedeposit
    bool twapOverride; // force twap check for hypervisor instance
    uint32 twapInterval; // override global twap
    uint256 priceThreshold; // custom price threshold
    bool depositOverride; // force custom deposit constraints
    uint256 deposit0Max;
    uint256 deposit1Max;
    uint256 maxTotalSupply;
    bool freeDeposit; // override global freeDepsoit
  }

  event PositionAdded(address, uint8);
  event CustomDeposit(address, uint256, uint256, uint256);
  event PriceThresholdSet(uint256 _priceThreshold);
  event DepositDeltaSet(uint256 _depositDelta);
  event DeltaScaleSet(uint256 _deltaScale);
  event TwapIntervalSet(uint32 _twapInterval);
  event TwapOverrideSet(address pos, bool twapOverride, uint32 _twapInterval);
  event DepositFreeToggled();
  event DepositOverrideToggled(address pos);
  event DepositFreeOverrideToggled(address pos);
  event TwapToggled();
  event ListAppended(address pos, address[] listed);
  event ListRemoved(address pos, address listed);

  constructor() {
    owner = msg.sender;
  }

  function addPosition(address pos, uint8 version) external onlyOwner {
    require(positions[pos].version == 0, 'already added');
    require(version > 0, 'version < 1');
    Position storage p = positions[pos];
    p.version = version;
    IHypervisor(pos).token0().approve(pos, MAX_INT);
    IHypervisor(pos).token1().approve(pos, MAX_INT);
    emit PositionAdded(pos, version);
  }

  function deposit(
    uint256 deposit0,
    uint256 deposit1,
    address to,
    address pos
  ) nonReentrant external returns (uint256 shares) {
    require(positions[pos].version != 0, 'not added');

    if (twapCheck || positions[pos].twapOverride) {
      // check twap
      checkPriceChange(
        pos,
        (positions[pos].twapOverride ? positions[pos].twapInterval : twapInterval),
        (positions[pos].twapOverride ? positions[pos].priceThreshold : priceThreshold)
      );
    }

    if (!freeDeposit && !positions[pos].list[msg.sender] && !positions[pos].freeDeposit) {      
      // freeDeposit off and hypervisor msg.sender not on list
      uint256 testMin;
      uint256 testMax; 
      (testMin, testMax) = getDepositAmount(pos, address(IHypervisor(pos).token0()), deposit0);

      require(deposit1 >= testMin && deposit1 <= testMax, "Improper ratio"); 
    }

    if (positions[pos].depositOverride) {
      if (positions[pos].deposit0Max > 0) {
        require(deposit0 <= positions[pos].deposit0Max, "token0 exceeds");
      }
      if (positions[pos].deposit1Max > 0) {
        require(deposit1 <= positions[pos].deposit1Max, "token1 exceeds");
      }
    }

    if (positions[pos].version < 3) {
      // requires asset transfer to proxy
      if (deposit0 != 0) {
        IHypervisor(pos).token0().transferFrom(msg.sender, address(this), deposit0);
      }
      if (deposit1 != 0) {
        IHypervisor(pos).token1().transferFrom(msg.sender, address(this), deposit1);
      }
      if (positions[pos].version < 2) {
        // requires lp token transfer from proxy to msg.sender
        shares = IHypervisor(pos).deposit(deposit0, deposit1, address(this));
        IHypervisor(pos).transfer(to, shares);
      }
      else{
        // transfer lp tokens direct to msg.sender
        shares = IHypervisor(pos).deposit(deposit0, deposit1, msg.sender);
      }
    }
    else {
      // transfer lp tokens direct to msg.sender
      shares = IHypervisor(pos).deposit(deposit0, deposit1, msg.sender, msg.sender);
    }

    if (positions[pos].depositOverride) {
      require(IHypervisor(pos).totalSupply() <= positions[pos].maxTotalSupply, "supply exceeds");
    }

  }

  function getDepositAmount(
    address pos,
    address token,
    uint256 deposit
  ) public view returns (uint256 amountStart, uint256 amountEnd) {
    require(token == address(IHypervisor(pos).token0()) || token == address(IHypervisor(pos).token1()), "token mistmatch");
    require(deposit > 0, "deposits can't be zero");
    (uint256 total0, uint256 total1) = IHypervisor(pos).getTotalAmounts();
    if (IHypervisor(pos).totalSupply() == 0 || total0 == 0 || total1 == 0) {
      amountStart = 0;
      amountEnd = 0;
    }

    uint256 ratioStart = total0.mul(1e18).div(total1).mul(depositDelta).div(deltaScale);
    uint256 ratioEnd = total0.mul(1e18).div(total1).div(depositDelta).mul(deltaScale);

    if (token == address(IHypervisor(pos).token0())) {
      amountStart = deposit.mul(1e18).div(ratioStart);
      amountEnd = deposit.mul(1e18).div(ratioEnd);
    } else {
      amountStart = deposit.mul(ratioStart).div(1e18);
      amountEnd = deposit.mul(ratioEnd).div(1e18);
    }
  }

  function checkPriceChange(
    address pos,
    uint32 _twapInterval,
    uint256 _priceThreshold
  ) public view returns (uint256 price) {
    uint160 sqrtPrice = TickMath.getSqrtRatioAtTick(IHypervisor(pos).currentTick());
    price = FullMath.mulDiv(uint256(sqrtPrice).mul(uint256(sqrtPrice)), 1e18, 2**(96 * 2));

    uint160 sqrtPriceBefore = getSqrtTwapX96(pos, _twapInterval);
    uint256 priceBefore = FullMath.mulDiv(uint256(sqrtPriceBefore).mul(uint256(sqrtPriceBefore)), 1e18, 2**(96 * 2));
    if (price.mul(100).div(priceBefore) > _priceThreshold || priceBefore.mul(100).div(price) > _priceThreshold)
      revert("Price change Overflow");
  }

  function getSqrtTwapX96(address pos, uint32 _twapInterval) public view returns (uint160 sqrtPriceX96) {
    if (_twapInterval == 0) {
      // return the current price if _twapInterval == 0
      (sqrtPriceX96, , , , , , ) = IHypervisor(pos).pool().slot0();
    } 
    else {
      uint32[] memory secondsAgos = new uint32[](2);
      secondsAgos[0] = _twapInterval; // from (before)
      secondsAgos[1] = 0; // to (now)

      (int56[] memory tickCumulatives, ) = IHypervisor(pos).pool().observe(secondsAgos);

      // tick(imprecise as it's an integer) to price
      sqrtPriceX96 = TickMath.getSqrtRatioAtTick(
      int24((tickCumulatives[1] - tickCumulatives[0]) / _twapInterval)
      );
    }
  }

  function setPriceThreshold(uint256 _priceThreshold) external onlyOwner {
    priceThreshold = _priceThreshold;
    emit PriceThresholdSet(_priceThreshold);
  }

  function setDepositDelta(uint256 _depositDelta) external onlyOwner {
    depositDelta = _depositDelta;
    emit DepositDeltaSet(_depositDelta);
  }

  function setDeltaScale(uint256 _deltaScale) external onlyOwner {
    deltaScale = _deltaScale;
    emit DeltaScaleSet(_deltaScale);
  }

  function customDeposit(
    address pos,
    uint256 deposit0Max,
    uint256 deposit1Max,
    uint256 maxTotalSupply
  ) external onlyOwner {
    positions[pos].deposit0Max = deposit0Max;
    positions[pos].deposit1Max = deposit1Max;
    positions[pos].maxTotalSupply = maxTotalSupply;
    emit CustomDeposit(pos, deposit0Max, deposit1Max, maxTotalSupply);
  }

  function toggleDepositFree() external onlyOwner {
    freeDeposit = !freeDeposit;
    emit DepositFreeToggled();
  }

  function toggleDepositOverride(address pos) external onlyOwner {
    positions[pos].depositOverride = !positions[pos].depositOverride;
    emit DepositOverrideToggled(pos);
  }

  function toggleDepositFreeOverride(address pos) external onlyOwner {
    positions[pos].freeDeposit = !positions[pos].freeDeposit;
    emit DepositFreeOverrideToggled(pos);
  }

  function setTwapInterval(uint32 _twapInterval) external onlyOwner {
    twapInterval = _twapInterval;
    emit TwapIntervalSet(_twapInterval);
  }

  function setTwapOverride(address pos, bool twapOverride, uint32 _twapInterval) external onlyOwner {
    positions[pos].twapOverride = twapOverride;
    positions[pos].twapInterval = _twapInterval;
    emit TwapOverrideSet(pos, twapOverride, _twapInterval);
  }

  function toggleTwap() external onlyOwner {
    twapCheck = !twapCheck;
    emit TwapToggled();
  }

  function appendList(address pos, address[] memory listed) external onlyOwner {
    for (uint8 i; i < listed.length; i++) {
      positions[pos].list[listed[i]] = true;
    }
    emit ListAppended(pos, listed);
  }

  function removeListed(address pos, address listed) external onlyOwner {
    positions[pos].list[listed] = false;
    emit ListRemoved(pos, listed);
  }

  function transferOwnership(address newOwner) external onlyOwner {
    owner = newOwner;
  }

  modifier onlyOwner {
    require(msg.sender == owner, "only owner");
    _;
  }
}
