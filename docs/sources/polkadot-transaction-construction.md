# Polkadot Transaction Construction

Substrate and Polkadot transaction construction requires runtime-aware extrinsic payloads. Signing payloads include encoded call data, account nonce, era, tip, runtime spec version, transaction version, genesis hash, and recent block hash.

Developers building offline signers must fetch chain metadata and runtime versions before constructing bytes to sign, because runtime upgrades can change call indexes and encoding expectations.
