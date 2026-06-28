# AWS KMS Asymmetric Key Specs

AWS KMS supports asymmetric elliptic curve keys for signing and verification. `ECC_SECG_P256K1` is the secp256k1 key spec commonly used for cryptocurrencies, and it supports `ECDSA_SHA_256`.

For Ed25519, AWS KMS supports `ECC_NIST_EDWARDS25519`. `ED25519_SHA_512` requires `MessageType: RAW`, while `ED25519_PH_SHA_512` requires `MessageType: DIGEST`; these modes are not interchangeable.

The private key stays inside AWS KMS. Applications download or use the public key for verification and call signing APIs for authorization.
