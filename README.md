## Hypervisor

A Uniswap V2–style, **fungible-liquidity** interface built on Uniswap V3.  
It supports **arbitrary liquidity provision**: one-sided, lop-sided, or balanced.

For usage patterns (deposit, withdraw, rebalance), see: `tests/deposit_withdraw.test.ts`.

---

### Tasks

**Deploy the Hypervisor**
```bash
npx hardhat deploy-hypervisor-orphan \
  --pool UNIV3-POOL-ADDRESS \
  --name "ERC20-NAME" \
  --symbol ERC20-SYMBOL \
  --network NETWORK

Initialize hypervisor

`npx hardhat initialize-hypervisor --hypervisor HYPERVISOR-ADDRESS --amount0 TOKEN0-AMOUNT --amount1 TOKEN1-AMOUNT --uniProxy UNIPROXY-ADDRESS --adminAddress ADMIN-ADDRESS --network NETWORK`

### Testing

`npx hardhat test`
