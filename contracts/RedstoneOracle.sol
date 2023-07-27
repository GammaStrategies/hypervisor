/// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.4;

import "@redstone-finance/evm-connector/contracts/mocks/RedstoneConsumerNumericMock.sol";

contract RedstoneOracle is RedstoneConsumerNumericMock {
    address private _owner;
    address private _pendingOwner;
    mapping (bytes32 => bytes32) priceFeedIdMapping;

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner {
        require(msg.sender == _owner, "!owner");
        _;
    }

    constructor() {
        _owner = msg.sender;
    }

    /**
     * @dev get price from redstone oracle
     */
    function extractPrice(address token0, address token1) public view returns(uint256) {
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

    /**
     * @dev Starts the ownership transfer of the contract to a new account. Replaces the pending transfer if there is one.
     * Can only be called by the current owner.
     */
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "zero address");
        _pendingOwner = _newOwner;
        emit OwnershipTransferStarted(owner(), _newOwner);
    }

    /**
     * @dev The new owner accepts the ownership transfer.
     */
    function acceptOwnership() external {
        require(pendingOwner() == msg.sender, "caller is not the new owner");
        delete _pendingOwner;
        address oldOwner = _owner;
        _owner = msg.sender;
        emit OwnershipTransferred(oldOwner, msg.sender);
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Returns the address of the pending owner.
     */
    function pendingOwner() public view virtual returns (address) {
        return _pendingOwner;
    }
}
