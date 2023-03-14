import { BigNumber } from 'ethers'
import { ethers } from 'hardhat'

import {
    abi as FACTORY_ABI,
    bytecode as FACTORY_BYTECODE,
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json'

import {
    abi as SWAPROUTER_ABI,
    bytecode as SWAPROUTER_BYTECODE,
} from '@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json'

import {
    TestERC20,
    IUniswapV3Factory,
    ISwapRouter,
    HypervisorFactory,
    MockUniswapV3PoolDeployer,
    TokeHypervisorFactory
} from "../../typechain";

interface UniswapV3Fixture {
    factory: IUniswapV3Factory
    router: ISwapRouter
}

async function uniswapV3Fixture(): Promise<UniswapV3Fixture> {
    const factoryFactory = await ethers.getContractFactory(FACTORY_ABI, FACTORY_BYTECODE)
    const factory = (await factoryFactory.deploy()) as IUniswapV3Factory

    const tokenFactory = await ethers.getContractFactory('TestERC20')
    const WETH = (await tokenFactory.deploy(BigNumber.from(2).pow(255))) as TestERC20 // TODO: change to real WETH

    const routerFactory = await ethers.getContractFactory(SWAPROUTER_ABI, SWAPROUTER_BYTECODE)
    const router = (await routerFactory.deploy(factory.address, WETH.address)) as ISwapRouter
    return { factory, router }
}


interface TokensFixture {
    token0: TestERC20
    token1: TestERC20
    token2: TestERC20
}

async function tokensFixture(): Promise<TokensFixture> {
    const tokenFactory = await ethers.getContractFactory('TestERC20')
    const tokenA = (await tokenFactory.deploy(BigNumber.from(2).pow(255))) as TestERC20
    const tokenB = (await tokenFactory.deploy(BigNumber.from(2).pow(255))) as TestERC20
    const tokenC = (await tokenFactory.deploy(BigNumber.from(2).pow(255))) as TestERC20

    const [token0, token1, token2] = [tokenA, tokenB, tokenC].sort((tokenA, tokenB) =>
        tokenA.address.toLowerCase() < tokenB.address.toLowerCase() ? -1 : 1
    )

    return { token0, token1, token2 }
}

interface HypervisorFactoryFixture {
    hypervisorFactory: HypervisorFactory
}

async function hypervisorFactoryFixture(factory: IUniswapV3Factory): Promise<HypervisorFactoryFixture> {
    const hypervisorFactoryFactory = await ethers.getContractFactory('HypervisorFactory')
    const hypervisorFactory = (await hypervisorFactoryFactory.deploy(factory.address)) as HypervisorFactory
    return { hypervisorFactory }
}
interface TokeHypervisorFactoryFixture {
    tokeHypervisorFactory: TokeHypervisorFactory
}

async function tokeHypervisorFactoryFixture(factory: IUniswapV3Factory): Promise<TokeHypervisorFactoryFixture> {
    const tokeHypervisorFactoryFactory = await ethers.getContractFactory('TokeHypervisorFactory')
    const tokeHypervisorFactory = (await tokeHypervisorFactoryFactory.deploy(factory.address)) as TokeHypervisorFactory
    return { tokeHypervisorFactory }
}


interface OurFactoryFixture {
    ourFactory: MockUniswapV3PoolDeployer
}

async function ourFactoryFixture(): Promise<OurFactoryFixture> {
    const ourFactoryFactory = await ethers.getContractFactory('MockUniswapV3PoolDeployer')
    const ourFactory = (await ourFactoryFactory.deploy()) as MockUniswapV3PoolDeployer
    return { ourFactory }
}

type allContractsFixture = UniswapV3Fixture & TokensFixture & OurFactoryFixture

export async function fixture(): Promise<allContractsFixture> {
    const { factory, router } = await uniswapV3Fixture()
    const { token0, token1, token2 } = await tokensFixture()
    const { ourFactory } = await ourFactoryFixture()

    return {
        token0,
        token1,
        token2,
        factory,
        router,
        ourFactory,
    }
}

type HypervisorTestFixture = UniswapV3Fixture & TokensFixture & HypervisorFactoryFixture

export async function hypervisorTestFixture(): Promise<HypervisorTestFixture> {
    const { factory, router } = await uniswapV3Fixture()
    const { token0, token1, token2 } = await tokensFixture()
    const { hypervisorFactory } = await hypervisorFactoryFixture(factory)

    return {
        token0,
        token1,
        token2,
        factory,
        router,
        hypervisorFactory,
    }
}

type TokeHypervisorTestFixture = UniswapV3Fixture & TokensFixture & TokeHypervisorFactoryFixture

export async function tokeHypervisorTestFixture(): Promise<TokeHypervisorTestFixture> {
    const { factory, router } = await uniswapV3Fixture()
    const { token0, token1, token2 } = await tokensFixture()
    const { tokeHypervisorFactory } = await tokeHypervisorFactoryFixture(factory)

    return {
        token0,
        token1,
        token2,
        factory,
        router,
        tokeHypervisorFactory,
    }
}
