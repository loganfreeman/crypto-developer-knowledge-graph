# Signing Patterns

## Graph Nodes

- `offline-transaction-signer`
- `deterministic-serialization`
- `bad-signature-diagnostic`
- `signing-byte-boundary-guardrail`
- `replay-domain-guardrail`
- `ethereum-legacy-rlp-byte-template`
- `substrate-scale-byte-template`
- `filecoin-cbor-byte-template`
- `aws-kms-secp256k1-signing-pattern`
- `turnkey-raw-payload-signing-pattern`
- `ecdsa-der-to-rsv-normalization-snippet`

## Commands

```bash
PYTHONPATH=src python3 -m ckg.cli trace "Ethereum EIP-155 RLP signing preimage"
PYTHONPATH=src python3 -m ckg.cli trace "Polkadot SCALE bad signature"
PYTHONPATH=src python3 -m ckg.cli trace "Filecoin CBOR tuple misalignment"
PYTHONPATH=src python3 -m ckg.cli trace "Turnkey raw payload signing"
```

## Non-Negotiables

- Never sign UI-rendered text when the chain verifies canonical bytes.
- Never hard-code Substrate call indexes without checking runtime metadata.
- Never pass ambiguous payloads to a signer without recording encoding, hash mode, chain id, nonce, and expected public key.
- Never treat AWS KMS DER ECDSA output as Ethereum-ready `r/s/v`.
