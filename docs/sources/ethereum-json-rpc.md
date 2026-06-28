# Ethereum JSON-RPC API

Ethereum execution clients expose JSON-RPC methods for applications and tooling. Wallets, indexers, and developer tools use this interface to read account data, inspect blocks, estimate gas, and submit signed transactions.

## eth_getBalance

`eth_getBalance` returns the balance of an address at a requested block tag. Wallet applications commonly call it after deriving or importing an address so they can show current account state to the user.

## eth_sendRawTransaction

`eth_sendRawTransaction` submits a signed and serialized Ethereum transaction to the network through an execution client. The transaction must already contain valid authorization from the account key.
