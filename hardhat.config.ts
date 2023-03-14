import "@nomicfoundation/hardhat-toolbox"
import "@nomicfoundation/hardhat-chai-matchers"
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
      celo: {
        url: "https://forno.celo.org",
        accounts: [process.env.MAINNET_PRIVATE_KEY as string],
        chainId: 42220
      },    
    polygon: {
        url: 'https://polygon-mainnet.g.alchemy.com/v2/' + process.env.ALCHEMY_POLYGON,
        accounts: [process.env.MAINNET_PRIVATE_KEY as string],
        gasPrice: parseUnits('300', 'gwei').toNumber(),
    },
    mainnet: {
        url: 'https://eth-mainnet.alchemyapi.io/v2/' + process.env.ALCHEMY_MAINNET,
        accounts: [process.env.MAINNET_PRIVATE_KEY as string],
        gasPrice: parseUnits('40', 'gwei').toNumber(),
      },
    optimism: {
        url: 'https://opt-mainnet.g.alchemy.com/v2/' + process.env.ALCHEMY_OPTIMISM,
        accounts: [process.env.MAINNET_PRIVATE_KEY as string],
        gasPrice: parseUnits('100', 'gwei').toNumber(),
      },
    arbitrum: {
        url: 'https://arb-mainnet.g.alchemy.com/v2/' + process.env.ALCHEMY_ARBITRUM,
        accounts: [process.env.MAINNET_PRIVATE_KEY as string],
        gasPrice: parseUnits('10', 'gwei').toNumber(),
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
      ],
  },
  etherscan: {
    apiKey: process.env.CELO_APIKEY,
    // apiKey: process.env.ETHERSCAN_APIKEY,
    // apiKey: process.env.OPTIMISM_APIKEY,
    // apiKey: process.env.ARBISCAN_APIKEY,
    // apiKey: process.env.POLYGONSCAN_APIKEY,
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },
  mocha: {
    timeout: 2000000
  }
}
export default config;
