import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-etherscan'
import '@nomiclabs/hardhat-waffle'
import '@typechain/hardhat'
import "hardhat-watcher"
import './scripts/copy-uniswap-v3-artifacts.ts'
import './tasks/hypervisor'
import './tasks/swap'
import { parseUnits } from 'ethers/lib/utils'
import { HardhatUserConfig } from 'hardhat/types'
require('dotenv').config()
const mnemonic = process.env.DEV_MNEMONIC || ''

const config: HardhatUserConfig = {
  networks: {
      hardhat: {
        allowUnlimitedContractSize: false,
      },
      polygon: {
        url: 'https://polygon-mainnet.g.alchemy.com/v2/VU6_Meq6eWSZ8lyqtxBI3WYsqNVwPXUM',
        accounts: [process.env.MAINNET_PRIVATE_KEY as string],
        gasPrice: parseUnits('500', 'gwei').toNumber(),
      },
      mainnet: {
        url: 'https://eth-mainnet.alchemyapi.io/v2/aPu7bijfZPuyctp4UR1xmAHsNuExJ7Sr',
        accounts: [process.env.MAINNET_PRIVATE_KEY as string],
        gasPrice: parseUnits('35', 'gwei').toNumber(),
      },
      optimism: {
        url: 'https://opt-mainnet.g.alchemy.com/v2/hsJn-uc_MRMOvWcl3ZytcZHX0v65LwQv',
        accounts: [process.env.MAINNET_PRIVATE_KEY as string],
      },
      arbitrum: {
        url: 'https://arb-mainnet.g.alchemy.com/v2/-hrVCo_fvtU2n1Rsol9WxfcEp3s8EauF',
        accounts: [process.env.MAINNET_PRIVATE_KEY as string],
        gasPrice: parseUnits('1', 'gwei').toNumber(),
      },
      celo: {
        url: "https://forno.celo.org",
        accounts: [process.env.MAINNET_PRIVATE_KEY as string],
        chainId: 42220
      },
	    bsc: {
      url: 'https://bsc-mainnet.nodereal.io/v1/c90506ed63514e5e8f9fcd7e7ea2aacd',
      accounts: [process.env.MAINNET_PRIVATE_KEY as string],
      gasPrice: parseUnits('6', 'gwei').toNumber(),
      },
      zkevm: {
        url: 'https://polygonzkevm-mainnet.g.alchemy.com/v2/6MaZoczRQ_jD1PEuDHSv818Yc7LUpUWM',
        accounts: [process.env.MAINNET_PRIVATE_KEY as string],
      },
      moonbeam: {
        url: 'https://moonbeam-mainnet.gateway.pokt.network/v1/lb/042f88350fbb38b053de0aa0',
        accounts: [process.env.MAINNET_PRIVATE_KEY as string],
        gasPrice: parseUnits('300', 'gwei').toNumber(),
      },
      

  },
  watcher: {
      compilation: {
          tasks: ["compile"],
      }
  },
  solidity: {
      compilers: [
        {
            version: '0.7.6',
            settings: {
                optimizer: {
                    enabled: true,
                    runs: 800,
                },
                metadata: {
                    bytecodeHash: 'none',
                },
            },
        },
        { version: '0.6.11' },
        { version: '0.6.0' },
        { version: '0.6.2' },
        { version: '0.6.12' },
        { version: '0.8.4'},
      ],
  },
  etherscan: {
    // apiKey: process.env.ETHERSCAN_APIKEY,
    // apiKey: process.env.OPTIMISM_APIKEY,
    apiKey: process.env.ARBISCAN_APIKEY,
     //apiKey: process.env.POLYGONSCAN_APIKEY,
    // apiKey: process.env.MOONSCAN_APIKEY,
     //apiKey: process.env.CELO_APIKEY,
 //	apiKey: process.env.BSCSCAN_APIKEY,
  //    apiKey: process.env.ZKEVM_APIKEY,
  //    customChains: [
    //    {
      //    network: "zkevm",
        //  chainId:  1101,
          //urls: {
            //apiURL: "https://api-zkevm.polygonscan.com/api",
            //browserURL: "https://zkevm.polygonscan.com" 
          //}
        //}
      //]
  },
  mocha: {
    timeout: 2000000
  }
}
export default config;
