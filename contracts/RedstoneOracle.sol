/// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.4;

import "@redstone-finance/evm-connector/contracts/mocks/RedstoneConsumerNumericMock.sol";

contract RedstoneOracle is RedstoneConsumerNumericMock {

    function extractPrice() public view returns(uint256) {
        return getOracleNumericValueFromTxMsg(bytes32("LP"));
    }
}
