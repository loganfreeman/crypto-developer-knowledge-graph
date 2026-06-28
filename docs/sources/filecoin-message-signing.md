# Filecoin Message Signing and CBOR Serialization

Filecoin messages are serialized using DAG-CBOR/IPLD conventions before signing and CID computation. The message fields, address encoding, nonce, gas fields, method, parameters, and value must be encoded deterministically.

Offline signers must preserve Filecoin's exact CBOR message serialization and domain expectations. Signing JSON, reordered fields, or a display representation instead of canonical message bytes produces invalid signatures.
