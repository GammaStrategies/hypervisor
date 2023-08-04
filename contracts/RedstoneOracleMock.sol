/// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.4;

import "@redstone-finance/evm-connector/contracts/mocks/RedstoneConsumerNumericMock.sol";
import {Ownable2Step} from '@openzeppelin8/contracts/access/Ownable2Step.sol';

contract RedstoneOracleMock is RedstoneConsumerNumericMock, Ownable2Step {
    mapping (bytes32 => bytes32) priceFeedIdMapping;

    /**
     * @dev get price from redstone oracle
     */
    function extractPrice(address token0, address token1, bytes calldata redstonePayload) external view returns(uint256) {
        bytes32 hash = keccak256(abi.encode(token0, token1));
        bytes32 priceFeedId = priceFeedIdMapping[hash];
        return getOracleNumericValueFromTxMsg(priceFeedId);
    }

    /**
     * @dev set the price feed id for a token pair
     */
    function setPriceFeedId(address token0, address token1, string memory feedIdStr) external onlyOwner {
        bytes32 hash = keccak256(abi.encode(token0, token1));
        require(bytes(feedIdStr).length > 0, "zero length");
        bytes32 feedId;
        assembly {
            feedId := mload(add(feedIdStr, 32))
        }
        priceFeedIdMapping[hash] = feedId;
    }
}
