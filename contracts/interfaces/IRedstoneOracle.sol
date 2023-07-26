pragma solidity =0.7.6;

interface IRedstoneOracle {

    function extractPrice(address token0, address token1, bytes calldata redstonePayload) external view returns(uint256);
    function isPriceFeedAvailable(address token0, address token1) external view returns(bool);

}