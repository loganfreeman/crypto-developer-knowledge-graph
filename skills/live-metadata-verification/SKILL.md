---
name: live-metadata-verification
description: Verify crypto graph claims against live on-chain metadata, JSON-RPC responses, runtime registries, contract bytecode, and ABI bindings. Use when a user asks whether serialization rules, runtime metadata, chain IDs, contract ABIs, staking parameters, or graph node claims are true right now.
---

# Live Metadata Verification

Use this skill to connect a concept node to live Web3 infrastructure before trusting implementation details.

## Workflow

1. Inspect cached verification targets:

```bash
PYTHONPATH=src python3 -m ckg.cli live-metadata
PYTHONPATH=src python3 -m ckg.cli live-metadata <node-id>
```

2. Refresh the target only when network access and RPC configuration are available:

```bash
PYTHONPATH=src python3 -m ckg.live_metadata <node-id> --refresh
```

Ethereum checks require an explicit provider:

```bash
ETHEREUM_RPC_URL=https://... PYTHONPATH=src python3 -m ckg.live_metadata erc20-transfer-calldata-template --refresh
```

3. Persist observations only when the user wants to update repo state:

```bash
PYTHONPATH=src python3 -m ckg.live_metadata <node-id> --refresh --write
```

4. Report verification status precisely:

- `verified`: observed value matches expectation
- `unverified`: cached target exists but no live observation is present
- `failed`: live observation contradicted the expected claim or RPC failed

## References

Read [verification-targets.md](references/verification-targets.md) for seeded target nodes and interpretation rules.
