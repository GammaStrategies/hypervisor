## Hypervisor

A Uniswap V2–like interface with **fungible liquidity** on top of **Uniswap V3**, enabling arbitrary liquidity provision: **one-sided**, **lop-sided**, and **balanced**.

Consult `tests/deposit_withdraw.test.ts` for examples of deposit, withdrawal, and rebalance.

### Tasks

**Deploy Hypervisor**


`npx hardhat deploy-hypervisor-orphan --pool UNIV3-POOL-ADDRESS --name ERC20-NAME --symbol ERC20-SYMBOL --network NETWORK`

Initialize hypervisor

`npx hardhat initialize-hypervisor --hypervisor HYPERVISOR-ADDRESS --amount0 TOKEN0-AMOUNT --amount1 TOKEN1-AMOUNT --uniProxy UNIPROXY-ADDRESS --adminAddress ADMIN-ADDRESS --network NETWORK`

### Testing

`npx hardhat test`
