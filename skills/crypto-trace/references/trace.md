# Crypto Trace Reference

## Commands

```bash
crypto-graph trace "Filecoin CBOR tuple misalignment"
crypto-graph trace "Filecoin CBOR tuple misalignment" --json
PYTHONPATH=src python3 -m ckg.cli trace "Go concurrent Turnkey signer"
```

## Output Contract

JSON trace output contains:

- `query`
- `summary`
- `seed_nodes`
- `nodes`
- `relationships`
- `code_solutions`
- `citations`
- `source_chunks`
- `live_metadata`
- `network_conditions`

## Interpretation

- Prefer `code_solutions` over inventing fresh snippets.
- Use `relationships` to explain why concepts are connected.
- Use `live_metadata` to identify claims that need current RPC/ABI verification.
- Use `citations` and `source_chunks` for provenance.

## Useful Queries

```text
Filecoin CBOR tuple misalignment
Go concurrent Turnkey signer
Polkadot SCALE bad signature
Ethereum EIP-155 RLP signing preimage
ERC-20 transfer calldata ABI
```
