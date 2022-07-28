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
          url: 'https://polygon-mainnet.g.alchemy.com/v2/',
          accounts: [process.env.PRIVATE_KEY as string],
          gasPrice: parseUnits('300', 'gwei').toNumber(),
        },
      mainnet: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.MAINNET_API}`,
        accounts: [process.env.PRIVATE_KEY as string],
        gasPrice: parseUnits('80', 'gwei').toNumber(),
      },
      celo: {
        url: "https://forno.celo.org",
        accounts: [process.env.PRIVATE_KEY as string],
        chainId: 42220
      },    
      optimism: {
        url: `https://opt-mainnet.g.alchemy.com/v2/${process.env.OPT_API}`,
        accounts: [process.env.PRIVATE_KEY as string],
      },
      arbitrum: {
        url: `https://arb-mainnet.g.alchemy.com/v2/${process.env.ARB_API}`,
        accounts: [process.env.PRIVATE_KEY as string],
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
                    // do not include the metadata hash, since this is machine dependent
                    // and we want all generated code to be deterministic
                    // https://docs.soliditylang.org/en/v0.7.6/metadata.html
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
    apiKey: process.env.ETHERSCAN_APIKEY,
    // apiKey: process.env.CELO_APIKEY,
    // apiKey: process.env.OPTIMISM_APIKEY,
    // apiKey: process.env.ARBISCAN_APIKEY,
    // apiKey: process.env.POLYGONSCAN_APIKEY,
  },
  mocha: {
    timeout: 2000000
  }
}
export default config;
