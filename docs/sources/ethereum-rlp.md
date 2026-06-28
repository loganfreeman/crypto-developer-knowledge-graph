# Ethereum RLP Encoding

Ethereum uses Recursive Length Prefix encoding for byte arrays and nested lists. Legacy Ethereum transactions are serialized as RLP lists, and EIP-155 signing includes chain id, zero, and zero in the unsigned transaction list before hashing.

Offline signers must distinguish unsigned signing preimages from signed transaction envelopes. Hashing or signing the final signed envelope instead of the unsigned preimage causes invalid signatures.
