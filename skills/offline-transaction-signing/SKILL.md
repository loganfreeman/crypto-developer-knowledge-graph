---
name: offline-transaction-signing
description: Build, audit, or debug offline crypto transaction signing flows across Ethereum, Substrate/Polkadot, Filecoin, Bitcoin, and Solana. Use for byte-level serialization, signing preimages, KMS/Turnkey/AWS signing, bad signature errors, DER r/s/v normalization, replay domains, CBOR/RLP/SCALE encoding, and secure non-custodial signer design.
---

# Offline Transaction Signing

Use this skill when the task involves constructing exact bytes to sign, delegating signing to a wallet/KMS/HSM, normalizing signatures, or debugging invalid transaction signatures.

## Workflow

1. Trace the problem first:

```bash
PYTHONPATH=src python3 -m ckg.cli trace "<chain or signer problem>"
```

2. Identify the byte boundary:

- structured transaction fields
- serialized transaction bytes
- final signing digest
- signed transaction envelope

3. Verify chain-specific serialization:

- Ethereum legacy transactions: RLP preimage with EIP-155 `chainId, 0, 0`
- Substrate/Polkadot: SCALE call bytes, extra, additional signed payload, runtime metadata
- Filecoin: canonical DAG-CBOR message bytes before CID/signing
- Solana: signed transaction message bytes, not JSON display

4. Verify signer mode:

- AWS KMS ECDSA returns DER, not chain-ready `r/s/v`
- Turnkey `sign_raw_payload` requires explicit encoding and hash mode
- Ed25519 APIs distinguish raw-message and prehash semantics

5. Debug bad signatures by comparing against a trusted SDK encoder:

- hex-dump fields before serialization
- hex-dump serialized preimage
- verify hash function and domain separator
- decode signer output
- recover sender/public key before broadcasting

## References

Read [signing-patterns.md](references/signing-patterns.md) for chain-specific checks and graph nodes.
