# Substrate SCALE Codec

SCALE is the compact binary codec used by Substrate runtimes. It is not self-describing, so the encoder and decoder must agree on type order, tuple layout, enum variants, compact integer encoding, and runtime metadata.

Substrate signing payloads depend on exact SCALE encoding of the call and signed extensions. Runtime metadata, spec version, transaction version, genesis hash, and block hash affect the bytes that are signed.
