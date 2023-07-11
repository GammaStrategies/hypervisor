/// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.4;

import "@redstone-finance/evm-connector/contracts/mocks/RedstoneConsumerNumericMock.sol";

contract RedstoneOracle is RedstoneConsumerNumericMock {

    function extractPrice(address token0, address token1) public view returns(uint256) {
        bytes32 priceFeedId = getPriceFeedId(token0, token1);
        return getOracleNumericValueFromTxMsg(priceFeedId);
    }

    //It's best to hardcode addresses in this function instead of mappings
    //to reduce the costs of storage access
    function getPriceFeedId(address token0, address token1) public view returns(bytes32) {
        if ( token0 == 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
          && token1 == 0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063) {
            return bytes32("usdc.dai"); 
        } else {
            //For testing purpose when the addresses of tokens are generated dynamically 
            return bytes32("LP");
        }
    }
}
