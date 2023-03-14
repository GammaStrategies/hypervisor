import { ethers } from 'hardhat'
import { BigNumber, BigNumberish, constants } from 'ethers'
import { expect } from 'chai'
import { fixture, tokeHypervisorTestFixture } from "./shared/fixtures"
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers"


import {
    FeeAmount,
    TICK_SPACINGS,
    encodePriceSqrt,
    getPositionKey,
    getMinTick,
    getMaxTick
} from './shared/utilities'

import {
    ISwapRouter,
    IUniswapV3Factory,
    IUniswapV3Pool,
    TokeHypervisorFactory,
    TokeHypervisor,
    TestERC20
} from "../typechain"


describe('Tokemak', () => {
    const minSqrtPrice = 4295128740;
    const maxSqrtPrice = 1461446703485210103287273052203988822378723970341;

    let factory: IUniswapV3Factory
    let router: ISwapRouter
    let token0: TestERC20
    let token1: TestERC20
    let token2: TestERC20
    let uniswapPool: IUniswapV3Pool
    let tokeHypervisorFactory: TokeHypervisorFactory
    let tokeHypervisor: TokeHypervisor

    // Wallets
    let wallet: SignerWithAddress
    let alice: SignerWithAddress
    let manager: SignerWithAddress
    let carol: SignerWithAddress
    let other: SignerWithAddress
    let user0: SignerWithAddress
    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let user3: SignerWithAddress
    let user4: SignerWithAddress

    beforeEach('deploy contracts', async () => {
        [wallet, alice, manager, carol, other, user0, user1, user2, user3, user4] = await ethers.getSigners();
        ({ token0, token1, token2, factory, router, tokeHypervisorFactory } = await loadFixture(tokeHypervisorTestFixture))
        await tokeHypervisorFactory.createHypervisor(token0.address, token1.address, FeeAmount.MEDIUM,"Test Visor", "TVR");
        const tokeHypervisorAddress = await tokeHypervisorFactory.getHypervisor(token0.address, token1.address, FeeAmount.MEDIUM)
        tokeHypervisor = (await ethers.getContractAt('TokeHypervisor', tokeHypervisorAddress)) as TokeHypervisor
        const poolAddress = await factory.getPool(token0.address, token1.address, FeeAmount.MEDIUM)
        uniswapPool = (await ethers.getContractAt('IUniswapV3Pool', poolAddress)) as IUniswapV3Pool
        await uniswapPool.initialize(encodePriceSqrt('1', '1'))
    })

    it('tokemak deposit & withdraw', async () => {

        // deploy GammaController
        let gammaControllerFactory = await ethers.getContractFactory('GammaController')
        let gammaController = await (gammaControllerFactory.connect(manager).deploy(
            manager.address, manager.address, tokeHypervisorFactory.address
        ))

        await tokeHypervisor.setWhitelist(gammaController.address);
        await token0.mint(manager.address, ethers.utils.parseEther('1000000'))
        await token1.mint(manager.address, ethers.utils.parseEther('1000000'))

        await token0.connect(manager).approve(tokeHypervisor.address, ethers.utils.parseEther('1000000'))
        await token1.connect(manager).approve(tokeHypervisor.address, ethers.utils.parseEther('1000000'))

        let liqBalance = await tokeHypervisor.balanceOf(manager.address)
        let amount0 = await token0.balanceOf(manager.address)
        let amount1 = await token0.balanceOf(manager.address)
        expect(liqBalance).to.equal(0)
        console.log("Before Deposit: " + ethers.utils.formatEther(liqBalance))
        console.log("Amount 0: " + ethers.utils.formatEther(amount0))
        console.log("Amount 1: " + ethers.utils.formatEther(amount1))

        // alice may deposit from manager to recieve LP tokens 
        await expect(tokeHypervisor.connect(alice).deposit(ethers.utils.parseEther('1000'), ethers.utils.parseEther('1000'), alice.address, manager.address, [0, 0, 0, 0])).to.be.revertedWith("WHE")

        // deposit
        await gammaController.connect(manager).deploy(
            ethers.utils.parseEther('1000'),
            ethers.utils.parseEther('1000'),
            token0.address,
            token1.address,
            FeeAmount.MEDIUM,
            0,
            [0, 0, 0, 0]
        )

        liqBalance = await tokeHypervisor.balanceOf(manager.address)
        amount0 = await token0.balanceOf(manager.address)
        amount1 = await token0.balanceOf(manager.address)
        expect(liqBalance).to.equal(ethers.utils.parseEther('2000'))
        console.log("After Deposit: " + ethers.utils.formatEther(liqBalance))
        console.log("Amount 0: " + ethers.utils.formatEther(amount0))
        console.log("Amount 1: " + ethers.utils.formatEther(amount1))
        
        // alice may not withdraw from manager to recieve token0, token1
        await expect(tokeHypervisor.connect(alice).withdraw(liqBalance, alice.address, manager.address, [0, 0, 0, 0])).to.be.revertedWith("WHE");

        // withdraw
        await gammaController.connect(manager).withdraw(
            token0.address,
            token1.address,
            FeeAmount.MEDIUM,
            liqBalance,
            [0, 0, 0, 0],
        )
        
        liqBalance = await tokeHypervisor.balanceOf(manager.address)
        amount0 = await token0.balanceOf(manager.address)
        amount1 = await token0.balanceOf(manager.address)
        expect(liqBalance).to.equal(0)
        console.log("After Withdraw: " + ethers.utils.formatEther(liqBalance))
        console.log("Amount 0: " + ethers.utils.formatEther(amount0))
        console.log("Amount 1: " + ethers.utils.formatEther(amount1))
    });
})

