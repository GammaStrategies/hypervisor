## Hypervisor

###
A Uniswap V2-like interface with fungible liquidity to Uniswap V3
which allows for arbitrary liquidity provision: one-sided, lop-sided, and
balanced

Consult tests/deposit_withdraw.test.ts for deposit, withdrawal, rebalance examples

### Tasks

Deploys hypervisor

`npx hardhat deploy-hypervisor-orphan --pool UNIV3-POOL-ADDRESS --name ERC20-NAME --symbol ERC20-SYMBOL --network NETWORK`

Initialize hypervisor

`npx hardhat initialize-hypervisor --hypervisor HYPERVISOR-ADDRESS --amount0 TOKEN0-AMOUNT --amount1 TOKEN1-AMOUNT --uniProxy UNIPROXY-ADDRESS --adminAddress ADMIN-ADDRESS --network NETWORK`

### Test

`npx hardhat test`
