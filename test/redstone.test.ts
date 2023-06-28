import { ethers, waffle } from 'hardhat'
import { BigNumber, BigNumberish, constants, Contract } from 'ethers'
import chai from 'chai'
import { expect } from 'chai'
import { fixture, hypervisorTestFixture } from "./shared/fixtures"
import { solidity } from "ethereum-waffle"
import { WrapperBuilder } from "@redstone-finance/evm-connector";
import { SimpleNumericMockWrapper } from "@redstone-finance/evm-connector/dist/src/wrappers/SimpleMockNumericWrapper";

const MOCKING_PRECISION = Math.pow(10,10);

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
        ({ token0, token1, token2, factory, hypervisorFactory } = await loadFixture(hypervisorTestFixture))
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

        await token0.mint(uniswapPool.address, ethers.utils.parseEther('1000000'))
        await token1.mint(uniswapPool.address, ethers.utils.parseEther('1000000'))
    })

    it("Should get the price directly from Oracle contract", async function () {
        const Oracle = await ethers.getContractFactory("RedstoneOracle");
        const oracle = await Oracle.deploy();
        await oracle.deployed();
    
          const wrappedContract =
          WrapperBuilder.wrap(oracle).usingSimpleNumericMock({
              mockSignersCount: 10,
              dataPoints: [
              { dataFeedId: "LP", value: 1 * MOCKING_PRECISION },
              ],
          });
    
          let price = await wrappedContract.extractPrice();
          console.log("Price directly from oracle: " + price.toString());
      });
  
      it("Should get the price from Redstone Oracles via UnniProxy", async function () {
        const Oracle = await ethers.getContractFactory("RedstoneOracle");
        const oracle = await Oracle.deploy();
        await oracle.deployed();

        const UniProxy = await ethers.getContractFactory("UniProxy");
        const uniProxy = await UniProxy.deploy(oracle.address);
        await uniProxy.deployed();
  
        
        const redstonePayload = await (new SimpleNumericMockWrapper({
            mockSignersCount: 10,
            dataPoints: [
              {dataFeedId: "LP", value: 1 * MOCKING_PRECISION}
            ],
          }).getBytesDataForAppending());  
    
        let price = await uniProxy.getPriceFromRedstoneOracle(`0x${redstonePayload}`);
        console.log("Price via Uni Proxy: " + price.toString());
    });

    it("Should successfully deposit", async function () {
        const Oracle = await ethers.getContractFactory("RedstoneOracle");
        const oracle = await Oracle.deploy();
        await oracle.deployed();

        const UniProxy = await ethers.getContractFactory("UniProxy");
        const uniProxy = await UniProxy.deploy(oracle.address);
        await uniProxy.deployed();

        //Add position
        await uniProxy.connect(wallet).addPosition(hypervisor.address, 4);
        await uniProxy.connect(wallet).toggleDepositFree();

        //Mint tokens and set allowances
        await token0.mint(alice.address, ethers.utils.parseEther('1000000'))
        await token1.mint(alice.address, ethers.utils.parseEther('1000000'))
        await token0.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))
        await token1.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))
        await token0.connect(alice).approve(uniProxy.address, ethers.utils.parseEther('1000000'))
        await token1.connect(alice).approve(uniProxy.address, ethers.utils.parseEther('1000000'))
        
        //Whitelist proxy
        await hypervisor.setWhitelist(uniProxy.address);

        //Prepare payload with prices
        const redstonePayload = await (new SimpleNumericMockWrapper({
            mockSignersCount: 10,
            dataPoints: [
              {dataFeedId: "LP", value: 1.009 * MOCKING_PRECISION}
            ],
          }).getBytesDataForAppending()); 

        //Deposit
        await uniProxy.connect(alice).deposit(
            ethers.utils.parseEther('1000'),
            ethers.utils.parseEther('1000'),
            alice.address,
            hypervisor.address,
            [0,0,0,0],
            `0x${redstonePayload}`
        );
    });

    it("Should revert when the price deviates too much from Oracle", async function () {
        const Oracle = await ethers.getContractFactory("RedstoneOracle");
        const oracle = await Oracle.deploy();
        await oracle.deployed();

        const UniProxy = await ethers.getContractFactory("UniProxy");
        const uniProxy = await UniProxy.deploy(oracle.address);
        await uniProxy.deployed();

        //Add position
        await uniProxy.connect(wallet).addPosition(hypervisor.address, 4);
        await uniProxy.connect(wallet).toggleDepositFree();

        //Mint tokens and set allowances
        await token0.mint(alice.address, ethers.utils.parseEther('1000000'))
        await token1.mint(alice.address, ethers.utils.parseEther('1000000'))
        await token0.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))
        await token1.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))
        await token0.connect(alice).approve(uniProxy.address, ethers.utils.parseEther('1000000'))
        await token1.connect(alice).approve(uniProxy.address, ethers.utils.parseEther('1000000'))
        
        //Whitelist proxy
        await hypervisor.setWhitelist(uniProxy.address);

        //Prepare payload with prices
        const redstonePayload = await (new SimpleNumericMockWrapper({
            mockSignersCount: 10,
            dataPoints: [
              {dataFeedId: "LP", value: 1.01 * MOCKING_PRECISION}
            ],
          }).getBytesDataForAppending()); 

        //Deposit
        await expect(uniProxy.connect(alice).deposit(
            ethers.utils.parseEther('1000'),
            ethers.utils.parseEther('1000'),
            alice.address,
            hypervisor.address,
            [0,0,0,0],
            `0x${redstonePayload}`
        )).to.be.revertedWith("Too large deviation from oracle price");
    });   

})

