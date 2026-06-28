# AWS KMS Sign API

The AWS KMS `Sign` operation signs a message using an asymmetric KMS key and a required signing algorithm. Callers choose `MessageType: RAW` when KMS should hash the message as part of the signing operation, or `MessageType: DIGEST` when passing a precomputed digest.

For offline blockchain signing, the application must construct the exact canonical transaction or message bytes, compute the chain-required digest when needed, and send the correct raw or digest bytes to KMS.
