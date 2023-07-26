/// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.4;

import "@redstone-finance/evm-connector/contracts/mocks/RedstoneConsumerNumericMock.sol";
import {Ownable} from '@openzeppelin8/contracts/access/Ownable.sol';

contract RedstoneOracle is RedstoneConsumerNumericMock, Ownable {

    mapping (bytes32 => bytes32) priceFeedIdMapping;

    function extractPrice(address token0, address token1, bytes calldata redstonePayload) external view returns(uint256) {
        bytes32 hash = keccak256(abi.encodePacked(token0, token1));
        bytes32 priceFeedId = priceFeedIdMapping[hash];
        return getOracleNumericValueFromTxMsg(priceFeedId);
    }

    function setPriceFeedId(address token0, address token1, bytes32 feedId) external onlyOwner {
        bytes32 hash = keccak256(abi.encodePacked(token0, token1));
        priceFeedIdMapping[hash] = feedId;
    }
}
