# Avalanche P-Chain Staking And Validators

Avalanche's P-Chain maintains validator sets and staking transactions. The P-Chain RPC uses JSON-RPC and exposes validator and staking methods such as current validators, pending validators, balances, staking transactions, and rewards.

Developer tooling should fetch validator set information from the P-Chain RPC rather than treating validator set size or pending validator count as static facts.
