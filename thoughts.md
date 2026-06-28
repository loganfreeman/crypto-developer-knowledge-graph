Build it as a developer knowledge graph, not just a crypto encyclopedia.

Core graph structure

1. Protocol layer
Bitcoin, Ethereum, Solana, Cosmos, Polkadot, Lightning, Rollups, bridges, stablecoins, DeFi protocols.

2. Primitive layer
Hashing, signatures, Merkle trees, zk proofs, consensus, mempools, UTXO/account models, finality, slashing, gas, MEV.

3. Interface layer
RPC, REST, WebSocket, GraphQL, SDKs, CLIs, ABIs, indexers, wallets.

Ethereum JSON-RPC is the standard interface execution clients expose for apps and tooling, while Bitcoin Core exposes its own RPC API for node, wallet, mining, network, and transaction operations.

4. Application layer
Wallets, exchanges, payment apps, NFT apps, DeFi, analytics, custody, identity, games, cross-chain apps.

5. Build-task layer
This is the most useful part:

Build a wallet → needs → key generation → signatures → address format → RPC balance query → transaction creation → broadcasting → confirmation tracking

Build a DeFi app → needs → smart contracts → ABI → token standards → oracle → wallet connection → event indexing → risk checks

Node types

Use typed nodes like:

Protocol
Chain
Token standard
Consensus algorithm
Cryptographic primitive
RPC method
REST endpoint
SDK
Smart contract standard
Wallet feature
Developer task
Security risk
Example app
Code snippet
Relationship types
USES
IMPLEMENTS
CALLS
DEPENDS_ON
SECURED_BY
EXPOSES_API
HAS_ENDPOINT
HAS_SDK
HAS_RISK
BUILDS
ALTERNATIVE_TO
REQUIRES

Example:

Ethereum → EXPOSES_API → JSON-RPC
eth_sendRawTransaction → BROADCASTS → Signed transaction
Signed transaction → REQUIRES → ECDSA/secp256k1
ERC-20 → IMPLEMENTS → Token standard
Wallet app → CALLS → eth_getBalance
Navigation design

Users should browse by goal, not by protocol name.

Top-level paths:

Build a wallet
Build payments
Build token/NFT app
Build DeFi app
Build cross-chain app
Build analytics/indexer
Build identity app
Run a node
Understand security
Compare protocols

Each path should show:

Concepts needed
APIs needed
SDKs/libraries
Example flow
Code examples
Security warnings
Supported chains
Suggested database stack

For MVP:

Neo4j or Memgraph → graph database
Postgres → canonical metadata
OpenSearch / Meilisearch → keyword search
Vector DB → semantic search over docs
Next.js frontend → graph navigation UI
Python/Node ingestion pipeline → docs parser

For developer UX:

GraphQL API over the knowledge graph
REST search endpoint
Embeddings for natural-language questions
Versioned schema
Source citations per node
MVP scope

Start with only:

Bitcoin
Ethereum
Solana
ERC-20
ERC-721
JSON-RPC
REST APIs
Wallet building
Transaction lifecycle
Signatures
Hashing
Merkle trees
Consensus
Indexing

Then expand into cross-chain protocols like Chainlink CCIP, which supports cross-chain token transfers and messaging for apps
