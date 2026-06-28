# Turnkey Sign Raw Payload

Turnkey exposes a `sign_raw_payload` activity for signing raw payloads. The request includes activity type, timestamp, organization id, `signWith`, `payload`, `encoding`, and `hashFunction`.

The API supports payload encodings such as hexadecimal and hash functions such as no-op, SHA-256, Keccak-256, or not applicable. The signing result returns ECDSA components including `r`, `s`, and `v`.
