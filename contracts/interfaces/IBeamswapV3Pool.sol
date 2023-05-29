// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import './pool/IBeamswapV3PoolImmutables.sol';
import './pool/IBeamswapV3PoolState.sol';
import './pool/IBeamswapV3PoolDerivedState.sol';
import './pool/IBeamswapV3PoolActions.sol';
import './pool/IBeamswapV3PoolOwnerActions.sol';
import './pool/IBeamswapV3PoolEvents.sol';

/// @title The interface for a Beamswap V3 Pool
/// @notice A Beamswap pool facilitates swapping and automated market making between any two assets that strictly conform
/// to the ERC20 specification
/// @dev The pool interface is broken up into many smaller pieces
interface IBeamswapV3Pool is
    IBeamswapV3PoolImmutables,
    IBeamswapV3PoolState,
    IBeamswapV3PoolDerivedState,
    IBeamswapV3PoolActions,
    IBeamswapV3PoolOwnerActions,
    IBeamswapV3PoolEvents
{

}
