import { ethers, waffle } from 'hardhat'
import { BigNumber, BigNumberish, constants } from 'ethers'
import chai from 'chai'
import { expect } from 'chai'
import { fixture, hypervisorTestFixture } from "./shared/fixtures"
import { solidity } from "ethereum-waffle"

chai.use(solidity)

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
    HypervisorFactory,
    Hypervisor,
    TestERC20
} from "../typechain"

const createFixtureLoader = waffle.createFixtureLoader

describe('Hypervisor', () => {
    const [wallet, alice, bob, carol, other,
           user0, user1, user2, user3, user4] = waffle.provider.getWallets()

    let factory: IUniswapV3Factory
    let router: ISwapRouter
    let token0: TestERC20
    let token1: TestERC20
    let token2: TestERC20
    let uniswapPool: IUniswapV3Pool
    let hypervisorFactory: HypervisorFactory
    let hypervisor: Hypervisor

    let loadFixture: ReturnType<typeof createFixtureLoader>
    before('create fixture loader', async () => {
        loadFixture = createFixtureLoader([wallet, other])
    })

    beforeEach('deploy contracts', async () => {
        ({ token0, token1, token2, factory, router, hypervisorFactory } = await loadFixture(hypervisorTestFixture))
        await hypervisorFactory.createHypervisor(token0.address, token1.address, FeeAmount.MEDIUM,"Test Visor", "TVR");
        const hypervisorAddress = await hypervisorFactory.getHypervisor(token0.address, token1.address, FeeAmount.MEDIUM)
        hypervisor = (await ethers.getContractAt('Hypervisor', hypervisorAddress)) as Hypervisor

        const poolAddress = await factory.getPool(token0.address, token1.address, FeeAmount.MEDIUM)
        uniswapPool = (await ethers.getContractAt('IUniswapV3Pool', poolAddress)) as IUniswapV3Pool
        await uniswapPool.initialize(encodePriceSqrt('1', '1'))

        // adding extra liquidity into pool to make sure there's always
        // someone to swap with
        await token0.mint(carol.address, ethers.utils.parseEther('1000000000000'))
        await token1.mint(carol.address, ethers.utils.parseEther('1000000000000'))
    })

    it('deposit with an incorrect proportion will revert', async () => {
        let uniProxyFactory = await ethers.getContractFactory('UniProxy')
        let uniProxy = (await uniProxyFactory.deploy())
        let owner = await uniProxy.owner();
        expect(owner).to.equal(wallet.address);
        await uniProxy.connect(wallet).addPosition(hypervisor.address, 4);

        // SETTING FREE DEPOSIT
        //await uniProxy.connect(wallet).toggleDepositFree();
        let depState = await uniProxy.freeDeposit();
        expect(depState).to.equal(false);

        await token0.mint(alice.address, ethers.utils.parseEther('1000000'))
        await token1.mint(alice.address, ethers.utils.parseEther('1000000'))

        await token0.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))
        await token1.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))
        await token0.connect(alice).approve(uniProxy.address, ethers.utils.parseEther('1000000'))
        await token1.connect(alice).approve(uniProxy.address, ethers.utils.parseEther('1000000'))

        // alice should start with 0 hypervisor tokens
        let alice_liq_balance = await hypervisor.balanceOf(alice.address)
        expect(alice_liq_balance).to.equal(0)
        // establishing 1:1 ratio in hypervisor
        await expect(uniProxy.connect(alice).deposit(ethers.utils.parseEther('1000'), ethers.utils.parseEther('1000'), alice.address, hypervisor.address, [0,0,0,0])).to.be.revertedWith("WHE")
        await hypervisor.setWhitelist(uniProxy.address);

        await uniProxy.connect(alice).deposit(ethers.utils.parseEther('1000'), ethers.utils.parseEther('1000'), alice.address, hypervisor.address, [0,0,0,0])
        await hypervisor.rebalance(-1800, 1800, 0, 600, bob.address, [0, 0, 0, 0], [0, 0, 0, 0])
        // attempting 2 unbalanced deposits & expecting failure
        await expect(uniProxy.connect(alice).deposit(ethers.utils.parseEther('20000'), 0, alice.address, hypervisor.address, [0,0,0,0])).to.be.revertedWith("Improper ratio")
        await expect(uniProxy.connect(alice).deposit(0, ethers.utils.parseEther('20000'), alice.address, hypervisor.address, [0,0,0,0])).to.be.revertedWith("Improper ratio")
        // attempting balanced deposit & expecting success
        await uniProxy.connect(alice).deposit(ethers.utils.parseEther('1000'), ethers.utils.parseEther('1000'), alice.address, hypervisor.address, [0,0,0,0])
        // nearly balanced deposits are excepted
        await uniProxy.connect(alice).deposit(ethers.utils.parseEther('1000'), ethers.utils.parseEther('998'), alice.address, hypervisor.address, [0,0,0,0])
    });

    it('calculates fees properly & rebalances to limit-only after large swap', async () => {
        await token0.mint(alice.address, ethers.utils.parseEther('1000000'))
        await token1.mint(alice.address, ethers.utils.parseEther('1000000'))

        await token0.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))
        await token1.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))

        // alice should start with 0 hypervisor tokens
        let alice_liq_balance = await hypervisor.balanceOf(alice.address)
        expect(alice_liq_balance).to.equal(0)

        await expect(hypervisor.connect(alice).deposit(ethers.utils.parseEther('1000'), ethers.utils.parseEther('1000'), alice.address, alice.address, [0,0,0,0])).to.be.revertedWith("WHE")

        await hypervisor.setWhitelist(alice.address)
        await hypervisor.connect(alice).deposit(ethers.utils.parseEther('1000'), ethers.utils.parseEther('1000'), alice.address, alice.address, [0,0,0,0])
        let token0hypervisor = await token0.balanceOf(hypervisor.address)
        let token1hypervisor = await token1.balanceOf(hypervisor.address)
        expect(token0hypervisor).to.equal(ethers.utils.parseEther('1000'))
        expect(token1hypervisor).to.equal(ethers.utils.parseEther('1000'))
        alice_liq_balance = await hypervisor.balanceOf(alice.address)
        // check that alice has been awarded liquidity tokens equal the
        // quantity of tokens deposited since their price is the same
        expect(alice_liq_balance).to.equal(ethers.utils.parseEther('2000'))

        // liquidity positions will only be created once rebalance is called
        await hypervisor.rebalance(-120, 120, -60, 0, bob.address, [0, 0, 0, 0], [0, 0, 0, 0])
        token0hypervisor = await token0.balanceOf(hypervisor.address)
        token1hypervisor = await token1.balanceOf(hypervisor.address)
        expect(token0hypervisor).to.equal(0)
        expect(token1hypervisor).to.equal(0)

        let basePosition = await hypervisor.getBasePosition()
        let limitPosition = await hypervisor.getLimitPosition()
        expect(basePosition[0]).to.be.gt(0)
        expect(limitPosition[0]).to.be.equal(0)

        let tokenAmounts = await hypervisor.getTotalAmounts()
        expect(tokenAmounts[0] === tokenAmounts[1])

        // do a test swap
        await token0.connect(carol).approve(router.address, ethers.utils.parseEther('10000000000'))
        await token1.connect(carol).approve(router.address, ethers.utils.parseEther('10000000000'))
        await router.connect(carol).exactInputSingle({
            tokenIn: token0.address,
            tokenOut: token1.address,
            fee: FeeAmount.MEDIUM,
            recipient: carol.address,
            deadline: 2000000000, // Wed May 18 2033 03:33:20 GMT+0000
            amountIn: ethers.utils.parseEther('100000000'),
            amountOutMinimum: ethers.utils.parseEther('0'),
            sqrtPriceLimitX96: 0,
        })

        let limitUpper = 0
        let limitLower = -180
        tokenAmounts = await hypervisor.getTotalAmounts()
        expect(tokenAmounts[0] > tokenAmounts[1])
        let currentTick = await hypervisor.currentTick()
        // this is beyond the bounds of the original base position
        expect(currentTick).to.equal(-887272)

        let fees0 = await token0.balanceOf(bob.address)
        let fees1 = await token1.balanceOf(bob.address)
        expect(fees0).to.equal(0)
        expect(fees1).to.equal(0)
        await hypervisor.rebalance(-1800, 1800, limitLower, limitUpper, bob.address, [0, 0, 0, 0], [0, 0, 0, 0])
        token0hypervisor = await token0.balanceOf(hypervisor.address)
        token1hypervisor = await token1.balanceOf(hypervisor.address)
        expect(token0hypervisor).to.equal(0)
        expect(token1hypervisor).to.equal(0)
        fees0 = await token0.balanceOf(bob.address)
        fees1 = await token1.balanceOf(bob.address)
        // we are expecting VISR fees of 3 bips
        expect(fees0).to.gt(ethers.utils.parseEther('0.3'))
        expect(fees0).to.lt(ethers.utils.parseEther('0.305'))
        expect(fees1).to.equal(0)
        // have the positions been updated? Are the token amounts unchanged?
        basePosition = await hypervisor.getBasePosition()
        limitPosition = await hypervisor.getLimitPosition()
        // the limit position should have 0 liquidity because we are left with
        // only a single asset after carol's big swap
        expect(basePosition[0]).to.be.gt(0)
        expect(limitPosition[0]).to.equal(0)

        // swap everything back and check fees in the other token have
        // been earned
        await router.connect(carol).exactInputSingle({
            tokenIn: token1.address,
            tokenOut: token0.address,
            fee: FeeAmount.MEDIUM,
            recipient: carol.address,
            deadline: 2000000000, // Wed May 18 2033 03:33:20 GMT+0000
            amountIn: ethers.utils.parseEther('200000000'),
            amountOutMinimum: ethers.utils.parseEther('0'),
            sqrtPriceLimitX96: 0,
        })
        currentTick = await hypervisor.currentTick()
        let totalAmounts0 = await hypervisor.getTotalAmounts();
        await hypervisor.compound();
        let totalAmounts1 = await hypervisor.getTotalAmounts();
        // pending fees from swap should be realized after compounding
        expect(totalAmounts0.total1).to.lt(totalAmounts1.total1);

        // this is beyond the bounds of the original base position
        expect(currentTick).to.equal(887271)
        limitUpper = 180
        limitLower = 0
        await hypervisor.rebalance(-1800, 1800, limitLower, limitUpper, bob.address, [0, 0, 0, 0], [0, 0, 0, 0])
        token0hypervisor = await token0.balanceOf(hypervisor.address)
        token1hypervisor = await token1.balanceOf(hypervisor.address)
        expect(token0hypervisor).to.equal(0)
        expect(token1hypervisor).to.equal(0)
        fees1 = await token1.balanceOf(bob.address)
        // we are expecting fees of approximately 3 bips (10% of 30bips, which is total fees)
        expect(fees1).to.gt(ethers.utils.parseEther('0.595'))
        expect(fees1).to.lt(ethers.utils.parseEther('0.605'))
        // have the positions been updated? Are the token amounts unchanged?
        basePosition = await hypervisor.getBasePosition()
        limitPosition = await hypervisor.getLimitPosition()
        // the limit position should have 0 liquidity because we are left with
        // only a single asset after carol's big swap
        expect(basePosition[0]).to.be.gt(0)
        expect(limitPosition[0]).to.equal(0)

        alice_liq_balance = await hypervisor.balanceOf(alice.address)
        let totalSupply = await hypervisor.totalSupply()
        let baseMin0 = basePosition[1].mul(alice_liq_balance).div(totalSupply)
        let baseMin1 = basePosition[2].mul(alice_liq_balance).div(totalSupply)
        let limitMin0 = limitPosition[1].mul(alice_liq_balance).div(totalSupply)
        let limitMin1 = limitPosition[2].mul(alice_liq_balance).div(totalSupply)
        await hypervisor.connect(alice).withdraw(alice_liq_balance, alice.address, alice.address, [baseMin0, baseMin1, limitMin0, limitMin1])
    })

    it('deposit/withdrawal with many users', async () => {
        let tokenAmount = ethers.utils.parseEther('10000')

        // token mint for liquidity add
        await token0.mint(user0.address, tokenAmount)
        await token1.mint(user0.address, tokenAmount)

        await token0.mint(user1.address, tokenAmount)
        await token1.mint(user1.address, tokenAmount)

        await token0.mint(user2.address, tokenAmount)
        await token1.mint(user2.address, tokenAmount)

        await token0.mint(user3.address, tokenAmount)
        await token1.mint(user3.address, tokenAmount)

        await token0.mint(user4.address, tokenAmount)
        await token1.mint(user4.address, tokenAmount)

        await token0.mint(other.address, ethers.utils.parseEther('100000'))
        await token1.mint(other.address, ethers.utils.parseEther('100000'))

        // deposit to hypervisor contract

        await token0.connect(user0).approve(hypervisor.address, tokenAmount)
        await token1.connect(user0).approve(hypervisor.address, tokenAmount)

        await token0.connect(user1).approve(hypervisor.address, tokenAmount)
        await token1.connect(user1).approve(hypervisor.address, tokenAmount)

        await token0.connect(user2).approve(hypervisor.address, tokenAmount)
        await token1.connect(user2).approve(hypervisor.address, tokenAmount)

        await token0.connect(user3).approve(hypervisor.address, tokenAmount)
        await token1.connect(user3).approve(hypervisor.address, tokenAmount)

        await token0.connect(user4).approve(hypervisor.address, tokenAmount)
        await token1.connect(user4).approve(hypervisor.address, tokenAmount)

        await hypervisor.setWhitelist(user0.address)
        await hypervisor.connect(user0).deposit(tokenAmount, tokenAmount, user0.address, user0.address, [0,0,0,0])
        await hypervisor.rebalance(-1800, 1800, 0, 600, bob.address, [0, 0, 0, 0], [0, 0, 0, 0])
        await hypervisor.setWhitelist(user1.address)
        await hypervisor.connect(user1).deposit(tokenAmount, tokenAmount, user1.address, user1.address, [0,0,0,0])
        await hypervisor.setWhitelist(user2.address)
        await hypervisor.connect(user2).deposit(tokenAmount, tokenAmount, user2.address, user2.address, [0,0,0,0])
        await hypervisor.setWhitelist(user3.address)
        await hypervisor.connect(user3).deposit(tokenAmount, tokenAmount, user3.address, user3.address, [0,0,0,0])
        await hypervisor.setWhitelist(user4.address)
        await hypervisor.connect(user4).deposit(tokenAmount, tokenAmount, user4.address, user4.address, [0,0,0,0])

        let user0token0Amount = await token0.balanceOf(user0.address)
        let user0token1Amount = await token1.balanceOf(user0.address)

        let user1token0Amount = await token0.balanceOf(user1.address)
        let user1token1Amount = await token1.balanceOf(user1.address)

        let user2token0Amount = await token0.balanceOf(user2.address)
        let user2token1Amount = await token1.balanceOf(user2.address)

        let user3token0Amount = await token0.balanceOf(user3.address)
        let user3token1Amount = await token1.balanceOf(user3.address)

        let user4token0Amount = await token0.balanceOf(user4.address)
        let user4token1Amount = await token1.balanceOf(user4.address)

        expect(user0token0Amount).to.equal(0)
        expect(user1token0Amount).to.equal(0)
        expect(user2token0Amount).to.equal(0)
        expect(user3token0Amount).to.equal(0)
        expect(user4token0Amount).to.equal(0)
        expect(user0token1Amount).to.equal(0)
        expect(user1token1Amount).to.equal(0)
        expect(user2token1Amount).to.equal(0)
        expect(user3token1Amount).to.equal(0)
        expect(user4token1Amount).to.equal(0)

        // withdraw
        const user0_liq_balance = await hypervisor.balanceOf(user0.address)
        const user1_liq_balance = await hypervisor.balanceOf(user1.address)
        const user2_liq_balance = await hypervisor.balanceOf(user2.address)
        const user3_liq_balance = await hypervisor.balanceOf(user3.address)
        const user4_liq_balance = await hypervisor.balanceOf(user4.address)

        let totalSupply = await hypervisor.totalSupply()
        let basePosition = await hypervisor.getBasePosition()
        let limitPosition = await hypervisor.getLimitPosition()
        let baseMin0 = basePosition[1].mul(user0_liq_balance).div(totalSupply)
        let baseMin1 = basePosition[2].mul(user0_liq_balance).div(totalSupply)
        let limitMin0 = limitPosition[1].mul(user0_liq_balance).div(totalSupply)
        let limitMin1 = limitPosition[2].mul(user0_liq_balance).div(totalSupply)
        await hypervisor.connect(user0).withdraw(user0_liq_balance, user0.address, user0.address, [baseMin0, baseMin1, limitMin0, limitMin1])
        
        totalSupply = await hypervisor.totalSupply()
        basePosition = await hypervisor.getBasePosition()
        limitPosition = await hypervisor.getLimitPosition()
        baseMin0 = basePosition[1].mul(user0_liq_balance).div(totalSupply)
        baseMin1 = basePosition[2].mul(user0_liq_balance).div(totalSupply)
        limitMin0 = limitPosition[1].mul(user0_liq_balance).div(totalSupply)
        limitMin1 = limitPosition[2].mul(user0_liq_balance).div(totalSupply)
        await hypervisor.connect(user1).withdraw(user1_liq_balance, user1.address, user1.address, [baseMin0, baseMin1, limitMin0, limitMin1])
        
        totalSupply = await hypervisor.totalSupply()
        basePosition = await hypervisor.getBasePosition()
        limitPosition = await hypervisor.getLimitPosition()
        baseMin0 = basePosition[1].mul(user0_liq_balance).div(totalSupply)
        baseMin1 = basePosition[2].mul(user0_liq_balance).div(totalSupply)
        limitMin0 = limitPosition[1].mul(user0_liq_balance).div(totalSupply)
        limitMin1 = limitPosition[2].mul(user0_liq_balance).div(totalSupply)
        await hypervisor.connect(user2).withdraw(user2_liq_balance, user2.address, user2.address, [baseMin0, baseMin1, limitMin0, limitMin1])
        
        totalSupply = await hypervisor.totalSupply()
        basePosition = await hypervisor.getBasePosition()
        limitPosition = await hypervisor.getLimitPosition()
        baseMin0 = basePosition[1].mul(user0_liq_balance).div(totalSupply)
        baseMin1 = basePosition[2].mul(user0_liq_balance).div(totalSupply)
        limitMin0 = limitPosition[1].mul(user0_liq_balance).div(totalSupply)
        limitMin1 = limitPosition[2].mul(user0_liq_balance).div(totalSupply)
        await hypervisor.connect(user3).withdraw(user3_liq_balance, user3.address, user3.address, [baseMin0, baseMin1, limitMin0, limitMin1])
        
        totalSupply = await hypervisor.totalSupply()
        basePosition = await hypervisor.getBasePosition()
        limitPosition = await hypervisor.getLimitPosition()
        baseMin0 = basePosition[1].mul(user0_liq_balance).div(totalSupply)
        baseMin1 = basePosition[2].mul(user0_liq_balance).div(totalSupply)
        limitMin0 = limitPosition[1].mul(user0_liq_balance).div(totalSupply)
        limitMin1 = limitPosition[2].mul(user0_liq_balance).div(totalSupply)
        await hypervisor.connect(user4).withdraw(user4_liq_balance, user4.address, user4.address, [baseMin0, baseMin1, limitMin0, limitMin1])

        user0token0Amount = await token0.balanceOf(user0.address)
        user0token1Amount = await token1.balanceOf(user0.address)

        user1token0Amount = await token0.balanceOf(user1.address)
        user1token1Amount = await token1.balanceOf(user1.address)

        user2token0Amount = await token0.balanceOf(user2.address)
        user2token1Amount = await token1.balanceOf(user2.address)

        user3token0Amount = await token0.balanceOf(user3.address)
        user3token1Amount = await token1.balanceOf(user3.address)

        user4token0Amount = await token0.balanceOf(user4.address)
        user4token1Amount = await token1.balanceOf(user4.address)

        expect(user0token0Amount.sub(tokenAmount).abs()).to.be.lte(ethers.utils.parseEther('1'))
        expect(user1token0Amount.sub(tokenAmount).abs()).to.be.lte(ethers.utils.parseEther('1'))
        expect(user2token0Amount.sub(tokenAmount).abs()).to.be.lte(ethers.utils.parseEther('1'))
        expect(user3token0Amount.sub(tokenAmount).abs()).to.be.lte(ethers.utils.parseEther('1'))
        expect(user0token1Amount.sub(tokenAmount).abs()).to.be.lte(ethers.utils.parseEther('1'))
        expect(user1token1Amount.sub(tokenAmount).abs()).to.be.lte(ethers.utils.parseEther('1'))
        expect(user2token1Amount.sub(tokenAmount).abs()).to.be.lte(ethers.utils.parseEther('1'))
        expect(user3token1Amount.sub(tokenAmount).abs()).to.be.lte(ethers.utils.parseEther('1'))
    })

    it('can withdraw deposited funds without rebalance', async () => {
        await token0.mint(alice.address, ethers.utils.parseEther('1000000'))
        await token1.mint(alice.address, ethers.utils.parseEther('1000000'))

        await token0.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))
        await token1.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))

        // alice should start with 0 hypervisor tokens
        let alice_liq_balance = await hypervisor.balanceOf(alice.address)
        expect(alice_liq_balance).to.equal(0)

        await hypervisor.setWhitelist(alice.address)
        await hypervisor.connect(alice).deposit(ethers.utils.parseEther('1000'), ethers.utils.parseEther('1000'), alice.address, alice.address, [0,0,0,0])
        alice_liq_balance = await hypervisor.balanceOf(alice.address)
        expect(alice_liq_balance).to.equal(ethers.utils.parseEther('2000'))

        let totalSupply = await hypervisor.totalSupply()
        let basePosition = await hypervisor.getBasePosition()
        let limitPosition = await hypervisor.getLimitPosition()
        let baseMin0 = basePosition[1].mul(alice_liq_balance).div(totalSupply)
        let baseMin1 = basePosition[2].mul(alice_liq_balance).div(totalSupply)
        let limitMin0 = limitPosition[1].mul(alice_liq_balance).div(totalSupply)
        let limitMin1 = limitPosition[2].mul(alice_liq_balance).div(totalSupply)
        await hypervisor.connect(alice).withdraw(alice_liq_balance, alice.address, alice.address, [baseMin0, baseMin1, limitMin0, limitMin1])

        let tokenAmounts = await hypervisor.getTotalAmounts()
        // verify that all liquidity has been removed from the pool
        expect(tokenAmounts[0]).to.equal(0)
        expect(tokenAmounts[1]).to.equal(0)

        await hypervisor.connect(alice).deposit(ethers.utils.parseEther('1000'), ethers.utils.parseEther('1000'), alice.address, alice.address, [0,0,0,0])

        await hypervisor.rebalance(-120, 120, 0, 60, bob.address, [0, 0, 0, 0], [0, 0, 0, 0])

        let tokenAmount = ethers.utils.parseEther('1000')

        await token0.mint(user0.address, tokenAmount)
        await token1.mint(user0.address, tokenAmount)
        await token0.connect(user0).approve(hypervisor.address, tokenAmount)
        await token1.connect(user0).approve(hypervisor.address, tokenAmount)

        await hypervisor.setWhitelist(user0.address)
        await hypervisor.connect(user0).deposit(tokenAmount, tokenAmount, user0.address, user0.address, [0,0,0,0])
        let token0Balance = await token0.balanceOf(user0.address)
        let token1Balance = await token1.balanceOf(user0.address)
        expect(token0Balance).to.equal(0)
        expect(token1Balance).to.equal(0)

        const user0_liq_balance = await hypervisor.balanceOf(user0.address)
        tokenAmounts = await hypervisor.getTotalAmounts()
        // verify that all liquidity has been removed from the pool
        expect(tokenAmounts[0]).to.be.gte(ethers.utils.parseEther('1999'))
        expect(tokenAmounts[1]).to.be.gte(ethers.utils.parseEther('1999'))
        expect(tokenAmounts[0]).to.be.lt(ethers.utils.parseEther('2001'))
        expect(tokenAmounts[1]).to.be.lt(ethers.utils.parseEther('2001'))

        totalSupply = await hypervisor.totalSupply()
        basePosition = await hypervisor.getBasePosition()
        limitPosition = await hypervisor.getLimitPosition()
        baseMin0 = basePosition[1].mul(user0_liq_balance).div(totalSupply)
        baseMin1 = basePosition[2].mul(user0_liq_balance).div(totalSupply)
        limitMin0 = limitPosition[1].mul(user0_liq_balance).div(totalSupply)
        limitMin1 = limitPosition[2].mul(user0_liq_balance).div(totalSupply)        
        await hypervisor.connect(user0).withdraw(user0_liq_balance, user0.address, user0.address, [baseMin0, baseMin1, limitMin0, limitMin1])
        
        token0Balance = await token0.balanceOf(user0.address)
        token1Balance = await token1.balanceOf(user0.address)
        expect(token0Balance).to.equal(ethers.utils.parseEther('1000'))
        expect(token1Balance).to.equal(ethers.utils.parseEther('1000'))
    })

    it('test pullLiquidity, addBaseLiquidity, addLimitLiquidity', async () => {
        let tokenAmount = ethers.utils.parseEther('1000000')
        await token0.mint(alice.address, ethers.utils.parseEther('1000000'))
        await token1.mint(alice.address, ethers.utils.parseEther('1000000'))

        await token0.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))
        await token1.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))

        // alice should start with 0 hypervisor tokens
        let alice_liq_balance = await hypervisor.balanceOf(alice.address)
        expect(alice_liq_balance).to.equal(0)

        await hypervisor.setWhitelist(alice.address)
        await hypervisor.connect(alice).deposit(ethers.utils.parseEther('1000'), ethers.utils.parseEther('1000'), alice.address, alice.address, [0,0,0,0])
        alice_liq_balance = await hypervisor.balanceOf(alice.address)
        expect(alice_liq_balance).to.equal(ethers.utils.parseEther('2000'))

        await hypervisor.rebalance(-240, 240, -120, 120, bob.address, [0, 0, 0, 0], [0, 0, 0, 0])

        let basePosition = await hypervisor.getBasePosition()
        let limitPosition = await hypervisor.getLimitPosition()
        expect(basePosition[0]).to.be.gt(0)

        await hypervisor.pullLiquidity(ethers.utils.parseEther('2000'), [0,0,0,0])

        basePosition = await hypervisor.getBasePosition()
        limitPosition = await hypervisor.getLimitPosition()
        expect(basePosition[0]).to.equal(0)
        expect(limitPosition[0]).to.equal(0)

        // withdraw alice's all liq balance
        let totalSupply = await hypervisor.totalSupply()
        let baseMin0 = basePosition[1].mul(alice_liq_balance).div(totalSupply)
        let baseMin1 = basePosition[2].mul(alice_liq_balance).div(totalSupply)
        let limitMin0 = limitPosition[1].mul(alice_liq_balance).div(totalSupply)
        let limitMin1 = limitPosition[2].mul(alice_liq_balance).div(totalSupply)
        await hypervisor.connect(alice).withdraw(alice_liq_balance, alice.address, alice.address,[baseMin0, baseMin1, limitMin0, limitMin1])
        alice_liq_balance = await hypervisor.balanceOf(alice.address)
        
        // expect alice liq balance to be 0
        expect(alice_liq_balance).to.equal(0)

        let aliceToken0 = await token0.balanceOf(alice.address)
        let aliceToken1 = await token1.balanceOf(alice.address)
        expect(aliceToken0.sub(tokenAmount).abs()).to.be.lte(ethers.utils.parseEther('1'))
        expect(aliceToken1.sub(tokenAmount).abs()).to.be.lte(ethers.utils.parseEther('1'))

        await hypervisor.connect(alice).deposit(ethers.utils.parseEther('1000'), ethers.utils.parseEther('1000'), alice.address, alice.address, [0,0,0,0])

        // add base liquidity
        await hypervisor.addBaseLiquidity(0, 0, [0,0])

        basePosition = await hypervisor.getBasePosition()
        limitPosition = await hypervisor.getLimitPosition()
        expect(basePosition[0]).to.gt(0)
        expect(limitPosition[0]).to.equal(0)

        await hypervisor.pullLiquidity(ethers.utils.parseEther('2000'), [0,0,0,0])

        // add limit liquidity
        await hypervisor.addLimitLiquidity(0, 0, [0,0])
        basePosition = await hypervisor.getBasePosition()
        limitPosition = await hypervisor.getLimitPosition()
        expect(basePosition[0]).to.equal(0)
        expect(limitPosition[0]).to.gt(0)
    })

    it('test directDeposit', async () => {
        await token0.mint(alice.address, ethers.utils.parseEther('1000000'))
        await token1.mint(alice.address, ethers.utils.parseEther('1000000'))
        await token0.mint(carol.address, ethers.utils.parseEther('1000000'))
        await token1.mint(carol.address, ethers.utils.parseEther('1000000'))

        await token0.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))
        await token1.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))
        await token0.connect(carol).approve(hypervisor.address, ethers.utils.parseEther('1000000'))
        await token1.connect(carol).approve(hypervisor.address, ethers.utils.parseEther('1000000'))

        await hypervisor.setWhitelist(carol.address)
        await hypervisor.connect(carol).deposit(ethers.utils.parseEther('1000'), ethers.utils.parseEther('1000'), carol.address, carol.address, [0,0,0,0])

        await hypervisor.rebalance(-120, 120, 0, 60, bob.address, [0, 0, 0, 0], [0, 0, 0, 0])

        await hypervisor.toggleDirectDeposit()
        let directDeposit = await hypervisor.directDeposit()
        expect(directDeposit).to.equal(true)

        let basePositionBefore = await hypervisor.getBasePosition()

        let alice_liq_balance = await hypervisor.balanceOf(alice.address)

        // alice direct deposits, should add to liquidity immediately
        await hypervisor.setWhitelist(alice.address)
        await hypervisor.connect(alice).deposit(ethers.utils.parseEther('1000'), ethers.utils.parseEther('1000'), alice.address, alice.address, [0,0,0,0])
        alice_liq_balance = await hypervisor.balanceOf(alice.address)

        let basePosition = await hypervisor.getBasePosition()

        expect(basePosition[0]).to.gt(basePositionBefore[0])
        
    })

    it ('realize pending fees after compound', async () => {
        await token0.mint(alice.address, ethers.utils.parseEther('1000000'))
        await token1.mint(alice.address, ethers.utils.parseEther('1000000'))

        await token0.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))
        await token1.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))

        // alice should start with 0 hypervisor tokens
        let alice_liq_balance = await hypervisor.balanceOf(alice.address)
        expect(alice_liq_balance).to.equal(0)

        await hypervisor.setWhitelist(alice.address)
        await hypervisor.connect(alice).deposit(ethers.utils.parseEther('1000'), ethers.utils.parseEther('1000'), alice.address, alice.address, [0,0,0,0])

        // liquidity positions will only be created once rebalance is called
        await hypervisor.rebalance(-120, 120, -60, 0, bob.address, [0, 0, 0, 0], [0, 0, 0, 0])

        let basePosition = await hypervisor.getBasePosition()
        let limitPosition = await hypervisor.getLimitPosition()
        expect(basePosition[0]).to.be.gt(0)
        expect(limitPosition[0]).to.be.equal(0)

        let tokenAmounts = await hypervisor.getTotalAmounts()
        expect(tokenAmounts[0] === tokenAmounts[1])

        // do a test swap
        await token0.connect(carol).approve(router.address, ethers.utils.parseEther('10000000000'))
        await token1.connect(carol).approve(router.address, ethers.utils.parseEther('10000000000'))
        await router.connect(carol).exactInputSingle({
            tokenIn: token1.address,
            tokenOut: token0.address,
            fee: FeeAmount.MEDIUM,
            recipient: carol.address,
            deadline: 2000000000, // Wed May 18 2033 03:33:20 GMT+0000
            amountIn: ethers.utils.parseEther('200000000'),
            amountOutMinimum: ethers.utils.parseEther('0'),
            sqrtPriceLimitX96: 0,
        })

        tokenAmounts = await hypervisor.getTotalAmounts()
        expect(tokenAmounts[0] > tokenAmounts[1])

        let totalAmounts0 = await hypervisor.getTotalAmounts();
        await hypervisor.compound();
        let totalAmounts1 = await hypervisor.getTotalAmounts();
        // pending fees from swap should be realized after compounding
        expect(totalAmounts0.total1).to.lt(totalAmounts1.total1);
    })

})

