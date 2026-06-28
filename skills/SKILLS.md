# Concept Skills

This repository converts high-value graph concepts into reusable agent skills.

## Skills

- `crypto-trace`: trace a natural-language crypto implementation problem through graph nodes, relationships, citations, live metadata, and code snippets.
- `offline-transaction-signing`: design and debug byte-exact offline transaction signing flows across RLP, SCALE, CBOR, KMS, Turnkey, and signature normalization.
- `live-metadata-verification`: verify graph claims against live RPC metadata, runtime registries, contract bytecode, ABI bindings, and cached freshness status.

## Concept Mapping

- `filecoin-cbor-byte-template`, `dag-cbor`, `bad-signature-diagnostic` -> `crypto-trace`, `offline-transaction-signing`
- `offline-transaction-signer`, `payload-signing`, `signing-byte-boundary-guardrail` -> `offline-transaction-signing`
- `substrate-scale-byte-template`, `ethereum-legacy-rlp-byte-template`, `erc20-transfer-calldata-template` -> `live-metadata-verification`

## Local Usage

Use a skill explicitly in Codex-style prompts:

```text
Use $crypto-trace to explain Filecoin CBOR tuple misalignment.
Use $offline-transaction-signing to debug a Polkadot bad signature error.
Use $live-metadata-verification to check whether an ERC-20 ABI claim is live-backed.
```
