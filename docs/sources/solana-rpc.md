# Solana RPC Methods

Solana exposes HTTP and WebSocket RPC methods for developers building wallets, applications, and indexers. RPC methods allow clients to read accounts, submit transactions, and subscribe to network activity.

## sendTransaction

`sendTransaction` submits a fully signed Solana transaction. The RPC service verifies transaction encoding and signatures before forwarding it for processing.
