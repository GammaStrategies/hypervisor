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

task('deploy-data', 'Deploy swapper contract')
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

    const chefFactory = await ethers.getContractFactory('Data')

    const chef = await deployContract(
      'Data',
      await ethers.getContractFactory('Data'),
      signer,
    )

    await chef.deployTransaction.wait(15)
    await run('verify:verify', {
      address: chef.address,
      constructorArguments: []
    })
})

task('verify-clearing', 'Deploy swapper contract')
  .addParam('clearing', 'router')
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

    const chef = await ethers.getContractAt(
      'Clearing',
      args.clearing,
      signer,
    )

    await run('verify:verify', {
      address: chef.address,
      constructorArguments: []
    })
})

task('deploy-exgamma', 'Deploy swapper contract')
  .addParam('xgamma', 'router')
  .addParam('weth', 'router')
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

    const chefFactory = await ethers.getContractFactory('exGamma')

    const chef = await deployContract(
      'exGamma',
      await ethers.getContractFactory('exGamma'),
      signer,
			[args.xgamma, args.weth]
    )

    await chef.deployTransaction.wait(15)
    await run('verify:verify', {
      address: chef.address,
      constructorArguments: [args.xgamma, args.weth]
    })
})

task('deploy-swapper', 'Deploy swapper contract')
  .addParam('router', 'router')
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

    const chefFactory = await ethers.getContractFactory('Swap')

    const chef = await deployContract(
      'Swap',
      await ethers.getContractFactory('Swap'),
      signer,
			[signer.address, args.router]
    )

    await chef.deployTransaction.wait(15)
    await run('verify:verify', {
      address: chef.address,
      constructorArguments: [signer.address, args.router]
    })
})

task('deploy-registry', 'Deploy admin contract')
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

    const chefFactory = await ethers.getContractFactory('HypeRegistry')

    const chef = await deployContract(
      'HypeRegistry',
      await ethers.getContractFactory('HypeRegistry'),
      signer,
    )

    await chef.deployTransaction.wait(15)
    await run('verify:verify', {
      address: chef.address,
    })

})


task('deploy-masterchef', 'Deploy admin contract')
  .addParam('sushi', 'reward rate')
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
      [args.sushi]
    )

    await chef.deployTransaction.wait(15)
    await run('verify:verify', {
      address: chef.address,
      constructorArguments: [args.sushi]
    })

})

task('deploy-rewarder', 'Deploy admin contract')
  .addParam('rewardToken', 'reward rate')
  .addParam('rate', 'reward rate')
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
      [args.rewardToken, args.rate, args.chef]
    )

    await chef.deployTransaction.wait(30)
    await run('verify:verify', {
      address: chef.address,
      constructorArguments: [args.rewardToken, args.rate, args.chef]
    })

});


task('deploy-router', 'Deploy Hypervisor contract')
  .addParam('token0', 'token address')
  .addParam('token1', 'token address')
  .addParam('pos', 'token address')
  .setAction(async (cliArgs, { ethers, run, network }) => {

    const args = {
      token0: cliArgs.token0,
      token1: cliArgs.token1, 
      pos: cliArgs.pos 
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
    const router = await deployContract(
      'Router',
      await ethers.getContractFactory('Router'),
      signer,
      [args.token0, args.token1, args.pos]
    )

    await router.deployTransaction.wait(5)
    await run('verify:verify', {
      address: router.address,
      constructorArguments: [args.token0, args.token1, args.pos]
    })
})

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

task('deploy-token', 'Deploy admin contract')
  // .addParam('name', 'admin account')
  // .addParam('symbol', 'advisor account')
  // .addParam('decimals', 'advisor account')
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

    const adminFactory = await ethers.getContractFactory('MintableToken')

    const admin = await deployContract(
      'MintableToken',
      await ethers.getContractFactory('MintableToken'),
      signer,
      // [args.name, args.symbol, args.decimals]
      []
    )

    await admin.deployTransaction.wait(5)
    await run('verify:verify', {
      address: admin.address,
      // constructorArguments: [args.name, args.symbol, args.decimals]
      constructorArguments: []
    })

});

task('deploy-admin', 'Deploy admin contract')
  .addParam('admin', 'admin account')
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
      [args.admin]
    )

    await admin.deployTransaction.wait(30)
    await run('verify:verify', {
      address: admin.address,
      constructorArguments: [args.admin]
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

task('set-rebalancer', 'Deploy Hypervisor contract via the factory')
  .addParam('admin', 'erc2 symbol')
  .setAction(async (args, { ethers, run, network }) => {

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))
    
    console.log('Network')
    console.log('  ', network.name)
    console.log('Task Args')
    console.log(args)


    const admin = await ethers.getContractAt(
      'Admin',
      args.admin,
      signer,
    )

  let hypes = [ 
"0x5ca313118358e3f5efe0c49f239b66c964f9aef0",
"0x6ccf63ac74b5533c456c3a68786629e7670293c0",
"0x056e8299b082d5f1016c846d93e71eadf4137851",
"0x15f2e223000d392a8449a53a4b930f3c54926987",
"0xe0f0622f871d9597649062e9bbbe9bd65e918e34",
"0x2752e822283c8baec3ad7ad18b09248a914930ff",
"0x20103b6fcecaa94ddbf3d18ab9d99892003b1d80",
"0x242d1d8bd3e600dc04c56f7817327fd750b61736",
"0x5c1fa2c9999d4fe0f6b13e95770ca406f79879c4",
"0x7ae5dece3903388281eff3a3d115ca00d4fafd4d",
"0xb81686295822b639b647d3b421cd5e09af700ada",
"0x7922591f6f9b047ebda320a12b6e3ca4d0f1435f",
"0x718a554d9740ac9bf4092ec1692961f1c9d96f46",
"0xac0f71f2492daf020f459bd163052b9dae28f159",
"0x82927c36ab62e504e24ab160afa5821b6c4a9265",
"0xe389d95e2e8c799fde5d37f245bdd7160bf50864",
"0xeb7d263db66aab4d5ee903a949a5a54c287bec87",
"0xd3bd62439c599739775df75cb33b888d437e23fe",
"0x02203f2351e7ac6ab5051205172d3f772db7d814",
"0x81cec323bf8c4164c66ec066f53cc053a535f03d",
"0x04d521e2c414e6d898c6f2599fdd863edf49e247",
"0x4a83253e88e77e8d518638974530d0cbbbf3b675",
"0x3cc20a6795c4b57d9817399f68e83e71c8626580",
"0x6077177d4c41e114780d9901c9b5c784841c523f",
"0x3f35705479d9d77c619b2aac9dd7a64e57151506",
"0xe40a5aa22cbccc8165aedd86f6d03fc5f551c3c6",
"0x4b9e26a02121a1c541403a611b542965bd4b68ce",
"0xadc7b4096c3059ec578585df36e6e1286d345367",
"0x9e31214db6931727b7d63a0d2b6236db455c0965",
"0x795f8c9b0a0da9cd8dea65fc10f9b57abc532e58",
"0x7f09bd2801a7b795df29c273c4afbb0ff15e2d63",
"0x543403307bc9f9ec46fd9bc1048b263c9692a26a",
"0x8dd3bf71ef18dd88869d128bde058c9d8c270176",
"0xccbcaf47e87f50a338fac9bf58e567ed1c87be2b",
"0x25b186eed64ca5fdd1bc33fc4cffd6d34069baec",
"0x598ca33b7f5fab560ddc8e76d94a4b4aa52566d7",
"0x9134f456d33d1288de26271730047ae0c5cb6f71",
"0x33eeafa7ef22cd4468d65819b2fe30f170db5b69",
"0xcd483d2ba34d24cada71639beb1215609860b911",
"0x14223bb48c8cf3ef49319be44a6e718e4dbf9486",
"0x69b2aaaf08ac9b04cd5b64a1d23ffcb40224fdaf",
"0xac15baba7bcc532f8727c1a42b23501f59630115",
"0xccbbb572eb5edc973a90fdc57d07d7740bb027f5",
"0x3e99b86b16f36dcf3b987ebc8b754c54030403b5",
"0x5ec3511b49d4fe7798015a26a83abdc01261615b",
"0xf86d6151d03007b1906465b63e36d6f48136bc39",
"0x454ff7780a9a99ecb3462ab61ba06fe4a886862e",
"0xa1c3e15b3307b04067e843d3bfaf3cead5b51cb7",
"0x4f7e090fe185aac68fc58e7fa1b9d4314d357327",
"0x5928f9f61902b139e1c40cba59077516734ff09f",
"0x3672d301778750c41a7864980a5ddbc2af99476e",
"0x7ae7fb44c92b4d41abb6e28494f46a2eb3c2a690",
"0xfd73ce19d3842ad7b551bb184ac6c6256dc2c9ab",
"0x1c1b4cf2a40810c49a8b42a9da857cb0b76d06e3",
"0x46840e073376178b1e669693c021329b17fb22aa",
"0x0f7e4c66cebb5f5cabd435684946585a917b2f65",
"0x535206aaeca58c038ef28ce9924c7782bbb3d94d",
"0x002ba5f8ad6dc69bb056ced3e6b5165ae1e1691b",
"0xe5d2907164aed433b63087b7969c5454f4a37ed7"]
let advisor = "0x2a8f0bdc37a7ff86dfdc758301c2106383a46dea";
for(let i=0;i<hypes.length;i++){
await admin.setAdvisor(hypes[i], advisor);
await admin.setRebalancer(hypes[i], advisor);
console.log('set for ', hypes[i]);
}
console.log(admin.address);
  })
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

task('deploy-clearing', 'Deploy UniProxy contract')
  .setAction(async (cliArgs, { ethers, run, network }) => {

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))

    console.log('Network')
    console.log('  ', network.name)

    const uniProxyFactory = await ethers.getContractFactory('Clearing')

    const uniProxy = await deployContract(
      'Clearing',
      uniProxyFactory,
      signer
    )

    await uniProxy.deployTransaction.wait(5)
    await run('verify:verify', {
      address: uniProxy.address
    })
  })

task('deploy-uniproxy', 'Deploy UniProxy contract')
  .addParam('clearing', 'the UniProxy to verify')
  .setAction(async (args, { ethers, run, network }) => {

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
      signer,
			[args.clearing]
    )

    await uniProxy.deployTransaction.wait(5)
    await run('verify:verify', {
      address: uniProxy.address,
			constructorArguments: [args.clearing]
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
    
    // await hypervisor.rebalance(
    //   -6000,
    //   6000,
    //   -600,
    //   600,
    //   signer.address,
    //   [0, 0, 0, 0],
    //   [0, 0, 0, 0]
    // )

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
