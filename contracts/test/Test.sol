// SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;
pragma abicoder v2;

import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

/**
 * @title  TestSwapRouter
 * @dev    DO NOT USE IN PRODUCTION. This is only intended to be used for
 *         tests and lacks slippage and callback caller checks.
 */
abstract contract TestSwapRouter is ISwapRouter { }
