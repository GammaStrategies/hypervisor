import { expect } from 'chai'
import { constants, Wallet } from 'ethers'
import { formatEther, parseEther, formatUnits, parseUnits } from 'ethers/lib/utils'
import { task } from 'hardhat/config'
import { deployContract, signPermission } from './utils'
import {
    FeeAmount,
    TICK_SPACINGS,
    encodePriceSqrt,
    getPositionKey,
    getMinTick,
    getMaxTick,
    MaxUint256
} from './shared/utilities'
import {
  baseTicksFromCurrentTick,
  limitTicksFromCurrentTick
} from './shared/tick'

task('deploy-timelock', 'Deploy timelock contract')
  .addParam('chef', 'chef')
  .addParam('mindelay', 'min delay')
  .addParam('proposer', 'proposer address')
  .addParam('executor', 'exec address')
  .setAction(async (args, { ethers, run, network }) => {

    console.log('Network')
    console.log('  ', network.name)
    console.log('Task Args')
    console.log(args)

    // compile

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))

    // deploy contracts
    const timelock = await deployContract(
      'TimeLock',
      await ethers.getContractFactory('Timelock'),
      signer,
      [args.chef, args.mindelay, [args.proposer], [args.executor]]
    )
    await timelock.deployTransaction.wait(5)
    await run('verify:verify', {
      address: timelock.address,
      constructorArguments: [args.chef, args.mindelay, [args.proposer], [args.executor]]
    })
})

task('add-chef-pool', 'Deploy admin contract')
  .addParam('chef', 'token address')
  .addParam('rewardPerBlock', 'token address')
  .addParam('lpToken', 'token address')
  .addParam('withUpdate', 'token address')
  .setAction(async (args, { ethers, run, network }) => {

    console.log('Network')
    console.log('  ', network.name)
    console.log('Task Args')
    console.log(args)

    // compile

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))


    const chef = await ethers.getContractAt(
      'MasterChef',
      args.chef,
      signer,
    )

    await chef.add(args.rewardPerBlock, args.lpToken, args.withUpdate);
});

task('deploy-masterchef', 'Deploy admin contract')
  .addParam('sushiToken', 'reward rate')
  .setAction(async (args, { ethers, run, network }) => {
    console.log('Network')
    console.log('  ', network.name)
    console.log('Task Args')
    console.log(args)

    // compile

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))

    // deploy contracts

    const chefFactory = await ethers.getContractFactory('MasterChef')

    const chef = await deployContract(
      'MasterChef',
      await ethers.getContractFactory('MasterChef'),
      signer,
      [args.sushiToken]
    )

    await chef.deployTransaction.wait(5)
    await run('verify:verify', {
      address: chef.address,
      constructorArguments: [args.sushiToken]
    })

});

task('deploy-rewarder', 'Deploy admin contract')
  .addParam('chef', 'reward rate')
  .setAction(async (args, { ethers, run, network }) => {
    console.log('Network')
    console.log('  ', network.name)
    console.log('Task Args')
    console.log(args)

    // compile

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))

    // deploy contracts

    const chefFactory = await ethers.getContractFactory('Rewarder')

    const chef = await deployContract(
      'Rewarder',
      await ethers.getContractFactory('Rewarder'),
      signer,
      [args.chef]
    )

    await chef.deployTransaction.wait(5)
    await run('verify:verify', {
      address: chef.address,
      constructorArguments: [args.chef]
    })

});

task('init-rewarder', 'Deploy admin contract')
  .addParam('rewardToken', 'admin account')
  .addParam('owner', 'advisor account')
  .addParam('rewardRate', 'advisor account')
  .addParam('lpToken', 'advisor account')
  .addParam('rewarder', 'advisor account')
  .setAction(async (args, { ethers, run, network }) => {

    console.log('Network')
    console.log('  ', network.name)
    console.log('Task Args')
    console.log(args)

    // compile

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))

    const rewarder = await ethers.getContractAt(
      'Rewarder',
      args.rewarder,
      signer,
    )

    await rewarder.init(args.rewardToken, args.owner,args.rewardRate, args.lpToken);
    console.log('done');




});


task('deploy-token', 'Deploy admin contract')
  .addParam('name', 'admin account')
  .addParam('symbol', 'advisor account')
  .addParam('decimals', 'advisor account')
  .setAction(async (args, { ethers, run, network }) => {
    console.log('Network')
    console.log('  ', network.name)
    console.log('Task Args')
    console.log(args)

    // compile

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))

    // deploy contracts

    const adminFactory = await ethers.getContractFactory('MockToken')

    const admin = await deployContract(
      'MockToken',
      await ethers.getContractFactory('MockToken'),
      signer,
      [args.name, args.symbol, args.decimals]
    )

    await admin.deployTransaction.wait(5)
    await run('verify:verify', {
      address: admin.address,
      constructorArguments: [args.name, args.symbol, args.decimals]
    })

});


task('deploy-admin', 'Deploy admin contract')
  .addParam('admin', 'admin account')
  .addParam('advisor', 'advisor account')
  .setAction(async (args, { ethers, run, network }) => {
    console.log('Network')
    console.log('  ', network.name)
    console.log('Task Args')
    console.log(args)

    // compile

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))

    // deploy contracts

    const adminFactory = await ethers.getContractFactory('Admin')

    const admin = await deployContract(
      'Admin',
      await ethers.getContractFactory('Admin'),
      signer,
      [args.admin, args.advisor]
    )

    await admin.deployTransaction.wait(5)
    await run('verify:verify', {
      address: admin.address,
      constructorArguments: [args.admin, args.advisor]
    })

});

task('deploy-hypervisor-factory', 'Deploy Hypervisor contract')
  .setAction(async (cliArgs, { ethers, run, network }) => {

    const args = {
      uniswapFactory: "0x1f98431c8ad98523631ae4a59f267346ea31f984",
    };

    console.log('Network')
    console.log('  ', network.name)
    console.log('Task Args')
    console.log(args)

    // compile

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))

    // deploy contracts

    const hypervisorFactoryFactory = await ethers.getContractFactory('HypervisorFactory')

    const hypervisorFactory = await deployContract(
      'HypervisorFactory',
      await ethers.getContractFactory('HypervisorFactory'),
      signer,
      [args.uniswapFactory]
    )

    await hypervisorFactory.deployTransaction.wait(5)
    await run('verify:verify', {
      address: hypervisorFactory.address,
      constructorArguments: [args.uniswapFactory],
    })
})

task('deploy-hypervisor-orphan', 'Deploy Hypervisor contract without factory')
  .addParam('pool', 'the uniswap pool address')
  .addParam('name', 'erc20 name')
  .addParam('symbol', 'erc2 symbol')
  .setAction(async (cliArgs, { ethers, run, network }) => {

    // compile

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))

    const args = {
      pool: cliArgs.pool,
      owner: signer.address,
      name: cliArgs.name,
      symbol: cliArgs.symbol 
    }

    console.log('Network')
    console.log('  ', network.name)
    console.log('Task Args')
    console.log(args)

    const hypervisor = await deployContract(
      'Hypervisor',
      await ethers.getContractFactory('Hypervisor'),
      signer,
      [args.pool, args.owner, args.name, args.symbol]
    )

    await hypervisor.deployTransaction.wait(5)
    await run('verify:verify', {
      address: hypervisor.address,
      constructorArguments: [args.pool, args.owner, args.name, args.symbol],
    })

  }); 

task('deploy-hypervisor', 'Deploy Hypervisor contract via the factory')
  .addParam('factory', 'address of hypervisor factory')
  .addParam('token0', 'token0 of pair')
  .addParam('token1', 'token1 of pair')
  .addParam('fee', 'LOW, MEDIUM, or HIGH')
  .addParam('name', 'erc20 name')
  .addParam('symbol', 'erc2 symbol')
  .setAction(async (cliArgs, { ethers, run, network }) => {

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))
    
    const args = {
      factory: cliArgs.factory,  
      token0: cliArgs.token0,
      token1: cliArgs.token1,
      fee: FeeAmount[cliArgs.fee],
      name: cliArgs.name,
      symbol: cliArgs.symbol 
    };

    console.log('Network')
    console.log('  ', network.name)
    console.log('Task Args')
    console.log(args)


    const hypervisorFactory = await ethers.getContractAt(
      'HypervisorFactory',
      args.factory,
      signer,
    )

    const hypervisor = await hypervisorFactory.createHypervisor(
      args.token0, args.token1, args.fee, args.name, args.symbol) 

  })

task('verify-hypervisor', 'Verify Hypervisor contract')
  .addParam('hypervisor', 'the hypervisor to verify')
  .addParam('pool', 'the uniswap pool address')
  .addParam('name', 'erc20 name')
  .addParam('symbol', 'erc2 symbol')
  .setAction(async (cliArgs, { ethers, run, network }) => {

    console.log('Network')
    console.log('  ', network.name)

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))

    const args = {
      pool: cliArgs.pool,
      owner: signer.address,
      name: cliArgs.name,
      symbol: cliArgs.symbol 
    }

    console.log('Task Args')
    console.log(args)

    const hypervisor = await ethers.getContractAt(
      'Hypervisor',
      cliArgs.hypervisor,
      signer,
    )
    await run('verify:verify', {
      address: hypervisor.address,
      constructorArguments: Object.values(args),
    })

  });

task('deploy-uniproxy', 'Deploy UniProxy contract')
  .setAction(async (cliArgs, { ethers, run, network }) => {

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))

    console.log('Network')
    console.log('  ', network.name)

    const uniProxyFactory = await ethers.getContractFactory('UniProxy')

    const uniProxy = await deployContract(
      'UniProxy',
      uniProxyFactory,
      signer
    )

    await uniProxy.deployTransaction.wait(5)
    await run('verify:verify', {
      address: uniProxy.address
    })
  })

task('verify-uniproxy', 'Verify UniProxy contract')
  .addParam('uniproxy', 'the UniProxy to verify')
  .setAction(async (cliArgs, { ethers, run, network }) => {

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))

    console.log('Network')
    console.log('  ', network.name)

    const uniProxy = await ethers.getContractAt(
      'UniProxy',
      cliArgs.uniproxy,
      signer,
    )

    await run('verify:verify', {
      address: uniProxy.address
    })
  })

task('initialize-hypervisor', 'Initialize Hypervisor contract')
  .addParam('hypervisor', 'the hypervisor')
  .addParam('amount0', 'the amount of token0')
  .addParam('amount1', 'the amount of token1')
  .addParam('uniproxy', 'the uniproxy')
  .addParam('admin', 'the admin address')
  .setAction(async (cliArgs, { ethers, run, network }) => {

    console.log('Network')
    console.log('  ', network.name)

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))

    const args = {
      hypervisor: cliArgs.hypervisor,
      owner: signer.address,
      amount0: cliArgs.amount0,
      amount1: cliArgs.amount1,
      uniproxy: cliArgs.uniproxy,
      admin: cliArgs.admin
    }

    console.log('Task Args')
    console.log(args)

    const hypervisor = await ethers.getContractAt(
      'Hypervisor',
      cliArgs.hypervisor,
      signer,
    )

    const uniproxy = await ethers.getContractAt(
      'UniProxy',
      cliArgs.uniproxy,
      signer,
    )

    const token0 = await ethers.getContractAt(
      'ERC20',
      await hypervisor.token0(),
      signer
    )

    const token1 = await ethers.getContractAt(
      'ERC20',
      await hypervisor.token1(),
      signer
    )

    console.log('Signer')
    console.log('  at', signer.address)
    console.log(' ', (await token0.symbol()), ' ', formatUnits(await token0.balanceOf(signer.address), await token0.decimals()))
    console.log(' ', (await token1.symbol()), ' ', formatUnits(await token1.balanceOf(signer.address), await token1.decimals()))

    // Token Approval
    console.log('Token Approving...')
    await token0.approve(hypervisor.address, MaxUint256)
    await token1.approve(hypervisor.address, MaxUint256)
    console.log('Approval Success')

    // Set Whitelist
    console.log('Whitelist Signer...')
    await hypervisor.setWhitelist(signer.address)
    console.log('Success')

    // Make First Deposit
    console.log('First Depositing...')
    console.log(      parseUnits(cliArgs.amount0, (await token0.decimals())),
      parseUnits(cliArgs.amount1, (await token1.decimals())),
      signer.address,
      signer.address)

    await hypervisor.deposit(
      parseUnits(cliArgs.amount0, (await token0.decimals())),
      parseUnits(cliArgs.amount1, (await token1.decimals())),
      signer.address,
      signer.address,
      [0, 0, 0, 0]
    )
    console.log('Success')

    // Rebalance
    console.log('Rebalancing')
    const pool = await ethers.getContractAt(
      'UniswapV3Pool',
      await hypervisor.pool(),
      signer
    )
    const tickSpacing = 100
    const percent = 8
    let currentTick: number
    [, currentTick] = await pool.slot0()
    let [baseLower, baseUpper] = baseTicksFromCurrentTick(
      currentTick,
      await token0.decimals(),
      await token1.decimals(),
      tickSpacing,
      percent
    )
    let [limitLower, limitUpper] = limitTicksFromCurrentTick(
      currentTick,
      await token0.decimals(),
      await token1.decimals(),
      tickSpacing,
      percent,
      true
    )
    
    console.log(baseLower)
    console.log(baseUpper)
    console.log(limitLower)
    console.log(limitUpper)
    
    await hypervisor.rebalance(
      baseLower,
      baseUpper,
      limitLower,
      limitUpper,
      signer.address,
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    )
    console.log('Success')

    // Whitelist uniproxy
    console.log('Whitelist uniproxy')
    await hypervisor.setWhitelist(cliArgs.uniproxy)
    console.log('Success')

    // TransferOnwership
    console.log('Transferring Ownership')
    await hypervisor.transferOwnership(cliArgs.admin)
    console.log('Success')

    console.log('Add to uniproxy');
    await uniproxy.addPosition(hypervisor.address,4);
    console.log('Success')

  });
