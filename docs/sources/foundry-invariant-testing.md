# Foundry Invariant Testing

Foundry's Forge supports invariant testing for Solidity contracts. Invariant tests define properties that should always hold across many randomly generated sequences of contract calls.

The documented pattern is to deploy the system under test in `setUp`, select target contracts or selectors, and write functions named with the `invariant_` prefix. Forge then executes random call sequences and checks the invariant after calls. Handler contracts are commonly used to constrain inputs, manage actors, and track ghost variables such as cumulative deposits, withdrawals, mints, or burns.

Foundry invariant configuration includes run count, call depth, revert handling, and shrinking limits. Useful invariant categories include solvency, conservation of value, monotonicity, bounds, access control, and cross-variable state consistency.

Developer relevance in this graph: use invariant tests before mainnet deployment to exercise stateful DeFi behavior, token accounting, authorization rules, and multi-contract interactions under broad call sequences.
