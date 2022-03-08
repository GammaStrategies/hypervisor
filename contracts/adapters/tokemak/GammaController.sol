// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./interfaces/ITokeHypervisor.sol";
import "./BaseController.sol";

contract GammaController is BaseController {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;
    uint256 public constant N_COINS = 2;
    
    constructor(
        address manager,
        address addressRegistry
    ) public BaseController(manager, addressRegistry) { }

    /// @notice Deploy liquidity to a Gamma Hypervisor ( controller owns assets, manager receives LP tokens )
    /// @dev Calls to external contract
    /// @dev We trust sender to send a true gamma lpTokenAddress
    /// @param amount0 quantity of token0 of Hypervisor 
    /// @param amount1 quantity of token1 of Hypervisor 
    /// @param lpTokenAddress LP Token(Hypervisor) address
    function deploy(
      uint256 amount0,
      uint256 amount1,
      address lpTokenAddress,
	  uint256 minMintAmount
    ) external onlyManager {

        uint256 balance0 = ITokeHypervisor(lpTokenAddress).token0().balanceOf(manager);
        uint256 balance1 = ITokeHypervisor(lpTokenAddress).token1().balanceOf(manager);

        require(balance0 >= amount0 && balance1 >= amount1, "INSUFFICIENT_BALANCE");

        // approve Hypervisor to spend amount0,1 amounts of Hypervisor.token0,1
        _approve(ITokeHypervisor(lpTokenAddress).token0(), lpTokenAddress, amount0);
        _approve(ITokeHypervisor(lpTokenAddress).token1(), lpTokenAddress, amount1);

        uint256 lpTokenBalanceBefore = IERC20(lpTokenAddress).balanceOf(manager);
        // deposit amount0, amount1 and mint LP tokens to the manager 
        // uint256 lpTokenReceived = uniProxy.deposit(amount0, amount1, manager, lpTokenAddress);
        uint256 lpTokenReceived = ITokeHypervisor(lpTokenAddress).deposit(amount0, amount1, manager, manager);

        uint256 lpTokenBalanceAfter = IERC20(lpTokenAddress).balanceOf(manager);
        require(lpTokenBalanceBefore + lpTokenReceived == lpTokenBalanceAfter, "LP_TOKEN_MISMATCH");
				require(lpTokenReceived >= minMintAmount, "INSUFFICIENT_MINT");
    }

    /// @notice Withdraw liquidity from Hypervisor ( controller owns LP tokens, controller receives assets ) 
    /// @dev Calls to external contract
    /// @dev We trust sender to send a true gamma lpTokenAddress. If it's not the case it will fail in the UniProxy deposit require.
    /// @param lpTokenAddress LP Token(Hypervisor) address
    /// @param amount Quantity of LP tokens to burn in the withdrawal
    function withdraw(
        address lpTokenAddress,
        uint256 amount,
        uint256[N_COINS] memory minAmounts
    ) external onlyManager {
        
        uint256 lpTokenBalanceBefore = IERC20(lpTokenAddress).balanceOf(manager);
        uint256[N_COINS] memory coinsBalancesBefore = _getCoinsBalances(lpTokenAddress);

        ITokeHypervisor(lpTokenAddress).withdraw(amount, manager, manager);

        uint256 lpTokenBalanceAfter = IERC20(lpTokenAddress).balanceOf(manager);
        uint256[N_COINS] memory coinsBalancesAfter = _getCoinsBalances(lpTokenAddress);

        _compareCoinsBalances(coinsBalancesBefore, coinsBalancesAfter, minAmounts);

        require(lpTokenBalanceBefore - amount == lpTokenBalanceAfter, "LP_TOKEN_MISMATCH");
    }

    // @dev pool address is lp token address for gamma
    function _getLPToken(address lpTokenAddress) internal returns (address) {
        return lpTokenAddress;
    }

    function _getCoinsBalances(address lpTokenAddress) internal returns (uint256[N_COINS] memory coinsBalances) {
        coinsBalances[0] = ITokeHypervisor(lpTokenAddress).token0().balanceOf(manager);
        coinsBalances[1] = ITokeHypervisor(lpTokenAddress).token1().balanceOf(manager);
        return coinsBalances;
    }

    function _compareCoinsBalances(uint256[N_COINS] memory balancesBefore, uint256[N_COINS] memory balancesAfter, uint256[N_COINS] memory amounts) internal {
        for (uint256 i = 0; i < N_COINS; i++) {
            if (amounts[i] > 0) {
                require(balancesBefore[i] < balancesAfter[i], "BALANCE_MUST_INCREASE");
            }
        }
    }

    function _approve(
        IERC20 token,
        address spender,
        uint256 amount
    ) internal {
        uint256 currentAllowance = token.allowance(address(this), spender);
        if (currentAllowance > 0) {
            token.safeDecreaseAllowance(spender, currentAllowance);
        }
        token.safeIncreaseAllowance(spender, amount);
    }
}

