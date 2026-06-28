# Crypto Developer Knowledge Graph

A developer-first knowledge graph for crypto engineering. The graph is organized around build goals, APIs, primitives, risks, and example flows rather than protocol trivia.

The MVP covers Bitcoin, Ethereum, Solana, ERC-20, ERC-721, JSON-RPC, REST APIs, wallet building, transaction lifecycle, signatures, hashing, Merkle trees, consensus, and indexing.

## Quick Start

```bash
python3 scripts/validate_graph.py
PYTHONPATH=src python3 -m ckg.api
```

Use another port if `8000` is busy:

```bash
PORT=8010 PYTHONPATH=src python3 -m ckg.api
```

Then open:

- Graph browser: `http://127.0.0.1:8000/`
- API health: `http://127.0.0.1:8000/health`
- REST search: `http://127.0.0.1:8000/search?q=wallet`
- Goal path: `http://127.0.0.1:8000/goals/build-wallet`
- GraphQL-style query endpoint: `http://127.0.0.1:8000/graphql`

The API uses only Python's standard library so the repository works before databases or frameworks are introduced.

## Repository Layout

```text
data/
  nodes.json             Typed graph nodes with citations
  relationships.json     Directed typed graph edges
  goal_paths.json        Goal-first developer navigation paths
  sources.json           Authoritative docs registry
  chunks.json            Ingested source chunks for retrieval
  citations.json         Node-to-source claim links
docs/
  database.md            Supabase/Postgres graph and pgvector schema guide
  sources/               Cached source documents
schemas/
  graph.schema.json      Versioned graph contract
supabase/
  migrations/            Postgres migrations for the production database layer
src/ckg/
  store.py               Graph loading, traversal, and indexes
  search.py              Lightweight keyword search
  ingest.py              Source ingestion, chunking, and citation generation
  api.py                 REST and GraphQL-style HTTP API
  cli.py                 Command-line search and traversal
frontend/
  index.html             Static graph browser
  app.js
  styles.css
scripts/
  validate_graph.py      Data integrity checks
tests/
  test_graph.py          Smoke tests for core graph behavior
```

## Database Layer

The production schema lives in:

```text
supabase/migrations/001_initial_graph_schema.sql
```

It defines a Supabase/Postgres graph layer with:

- strict node kinds: `Primitive`, `Protocol`, `Action`, and `Vulnerability`
- adjacency-list `edges`
- `code_snippets` attached to nodes
- `document_chunks` for citation-grounded RAG
- `pgvector` columns for semantic node, documentation, snippet, and chunk embeddings
- HNSW cosine indexes and helper search functions

See `docs/database.md` for the schema model, embedding conventions, and example queries.

## Example Usage

Search from the command line:

```bash
PYTHONPATH=src python3 -m ckg.cli search "eth_getBalance"
PYTHONPATH=src python3 -m ckg.cli chunks "signed transaction"
PYTHONPATH=src python3 -m ckg.cli citations ethereum
PYTHONPATH=src python3 -m ckg.cli horizon cross-chain-state-verification
PYTHONPATH=src python3 -m ckg.cli horizon wallet-building --edge-type REQUIRES --layer infrastructure
PYTHONPATH=src python3 -m ckg.cli horizon offline-transaction-signer --edge-type CAN_USE_SIGNER
PYTHONPATH=src python3 -m ckg.cli network polkadot-staking-nominations
PYTHONPATH=src python3 -m ckg.cli trust
PYTHONPATH=src python3 -m ckg.cli path build-wallet
PYTHONPATH=src python3 -m ckg.cli node ethereum
```

Use the REST API:

```bash
curl "http://127.0.0.1:8000/search?q=transaction"
curl "http://127.0.0.1:8000/chunks/search?q=signed%20transaction"
curl "http://127.0.0.1:8000/nodes/ethereum/citations"
curl "http://127.0.0.1:8000/nodes/ethereum/neighbors"
curl "http://127.0.0.1:8000/nodes/cross-chain-state-verification/horizon"
curl "http://127.0.0.1:8000/nodes/polkadot-staking-nominations/network-conditions"
curl "http://127.0.0.1:8000/trust"
curl "http://127.0.0.1:8000/goals/build-defi-app"
```

Use the GraphQL-style endpoint:

```bash
curl -X POST http://127.0.0.1:8000/graphql \
  -H "content-type: application/json" \
  -d '{"query":"{ node(id:\"ethereum\") { id label type } }"}'
```

```bash
curl -X POST http://127.0.0.1:8000/graphql \
  -H "content-type: application/json" \
  -d '{"query":"{ search(q:\"wallet\") { id label type } }"}'
```

```bash
curl -X POST http://127.0.0.1:8000/graphql \
  -H "content-type: application/json" \
  -d '{"query":"{ chunks(q:\"signed transaction\") { id title url } }"}'
```

## Ingestion And Citations

The ingestion layer is offline-first. `data/sources.json` lists authoritative sources, `docs/sources/` stores cached source text, and the ingestion command produces source chunks plus node-to-source citation records.

Regenerate citation artifacts from cached docs:

```bash
PYTHONPATH=src python3 -m ckg.ingest
```

Fetch registered source URLs before chunking:

```bash
PYTHONPATH=src python3 -m ckg.ingest --fetch
```

Use `--force` with `--fetch` to overwrite cached documents. Network fetches are optional; the repository includes seed cached docs so validation and search work offline.

The validator now checks:

- graph node and relationship types
- goal path node references
- citation references against registered source ids or URLs
- source local document presence
- generated citation links against known nodes, sources, and chunks

## Trust And Freshness

Trust reports make reliability visible. They hash local source documents, find stale or missing sources, map changed sources to impacted nodes, and flag production-grade nodes that still need citations.

Generate the report:

```bash
PYTHONPATH=src python3 -m ckg.trust
```

The command updates:

```text
data/trust_report.json
```

The frontend reads this report and shows trust badges in node cards and the sidecar:

- `Verified`
- `Seeded`
- `Needs citation`
- `Source attention`

The report is intentionally strict about production node types such as cryptographic primitives, proof systems, runtimes, payload templates, signing integrations, implementation patterns, and security guardrails.

## Data Model

Nodes are typed as:

- `Protocol`
- `Chain`
- `TokenStandard`
- `ConsensusAlgorithm`
- `CryptographicPrimitive`
- `RPCMethod`
- `RESTEndpoint`
- `SDK`
- `SmartContractStandard`
- `WalletFeature`
- `DeveloperTask`
- `SecurityRisk`
- `ExampleApp`
- `CodeSnippet`
- `Interface`
- `Concept`
- `Library`
- `PayloadTemplate`
- `SigningIntegration`
- `ImplementationPattern`
- `SecurityGuardrail`
- `ExecutionSandbox`
- `Runtime`
- `ProofSystem`

Relationships include:

- `USES`
- `IMPLEMENTS`
- `CALLS`
- `DEPENDS_ON`
- `SECURED_BY`
- `EXPOSES_API`
- `HAS_ENDPOINT`
- `HAS_SDK`
- `HAS_RISK`
- `BUILDS`
- `ALTERNATIVE_TO`
- `REQUIRES`
- `BROADCASTS`
- `INDEXES`
- `SUPPORTS`
- `ENABLES`
- `IMPLEMENTED_BY`
- `USES_TEMPLATE`
- `CAN_USE_SIGNER`
- `HAS_TEST_VECTOR`
- `HAS_CLI_COMMAND`
- `ENCODES_AS`
- `VERIFIES_WITH`
- `RUNS_ON`
- `HAS_GUARDRAIL`

## Semantic Web3 Intelligence Features

The frontend now avoids whole-graph hairballs. It uses an Intent-Driven Dual View:

- left: a visual horizon canvas scoped to the selected build intent or node
- right: a dense tabbed sidecar for documentation, code snippets, live state, interactive sandboxes, risks, and sources

Clicking a node recenters the local graph without a page refresh and pulls in adjacent relational nodes. Developers can filter by layer and relationship type, then inspect exact execution blueprints in the sidecar.

The sidecar is implementation-first:

- overview, layers, and contexts
- contextual assistant traces from a natural-language prompt
- code snippets and payload templates, including multi-language examples
- implementation notes
- relationship metadata with context, layer, confidence, and developer notes
- security guardrails
- live/cached network conditions
- client-side simulation widgets for hashing/signing and staking scenarios
- citations and source chunks

Seeded production-style examples include:

- Cross-Chain State Verification
- BLS12-381
- zk-SNARKs
- KZG commitments
- EVM, SVM, and WASM runtimes
- Substrate raw extrinsic template
- ERC-20 transfer calldata template
- Turnkey-style KMS signing pattern
- AWS KMS secp256k1 signing pattern
- Ethereum EIP-155 signing preimage template
- ECDSA DER to r/s/v normalization snippet
- deterministic serialization and byte-boundary templates for RLP, SCALE, and DAG-CBOR
- Replay domain guardrail
- Remix EVM sandbox

The `Build offline transaction signer` path shows the raw engineering bridge from primitives to executable signing:

- canonical transaction fields and signing preimages
- hash boundaries and KMS `RAW` versus `DIGEST` modes
- AWS KMS secp256k1 signing
- Turnkey raw-payload signing
- DER ECDSA normalization into chain-specific `r/s/v`
- Ed25519 raw/prehash guardrails
- TypeScript, Go, and Rust implementations for signer orchestration and broadcast flows

Nodes can attach `multi_language_examples`:

```json
{
  "language": "Go",
  "title": "Broadcast signed Ethereum transaction",
  "summary": "Post an eth_sendRawTransaction request from a backend worker.",
  "code": "..."
}
```

The serialization layer makes byte-level failures explicit:

- Ethereum legacy RLP signing preimage and signed envelope boundaries
- Substrate SCALE call, extra, and additional signed payload layout
- Filecoin DAG-CBOR message serialization before CID/signing
- `Bad signature` diagnostic workflow for tuple misalignment, wrong hash mode, and signature normalization errors

The Sandbox tab adds execution-adjacent calculators:

- crypto/signing nodes expose a raw payload hash calculator with exact SHA-256 output through native WebCrypto
- Keccak-256 and BLAKE2b are shown as required algorithms, but the widget refuses to fake output when the browser lacks a vetted implementation
- staking nodes expose a reward scenario dashboard for bonded amount, assumed APR, and validator commission
- live-state panels remain source-of-truth; sandbox reward values are local scenarios, not protocol guarantees

The Copilot Bridge adds a graph-grounded assistant surface:

- prompts are matched against local graph metadata and curated implementation blueprints
- the canvas highlights the retrieved node path instead of dumping a full hairball
- the Assistant tab renders architectural steps, grounding notes, and clickable path nodes
- the current implementation is local and deterministic; a server-side RAG model can later produce answers against the same highlighted-node contract

## Live Network Conditions

Some concepts are only useful with current chain state. `data/network_conditions.json` stores cached live-condition definitions for staking and validator workflows. Each condition records provider, freshness policy, last update time, and the exact query a production fetcher should run.

Current seeded examples:

- Polkadot staking and nominations
- Avalanche P-Chain staking

The frontend sidecar shows network condition panels for matching nodes, including cached/live status, provider, query, units, and developer notes. Null values mean "query live"; they are intentionally not invented.

CLI:

```bash
PYTHONPATH=src python3 -m ckg.cli network polkadot-staking-nominations
PYTHONPATH=src python3 -m ckg.cli network avalanche-pchain-staking
```

Every node should carry citations where practical. Citation values are source identifiers or URLs that ingestion can later resolve into document chunks, embeddings, and provenance metadata.

## MVP Roadmap

1. Replace JSON storage with Postgres for canonical metadata.
2. Mirror graph relationships into Neo4j or Memgraph.
3. Add Meilisearch/OpenSearch for keyword search.
4. Add embeddings over cited source docs for natural-language retrieval.
5. Swap the static browser for a Next.js graph navigation UI.
6. Expand cross-chain coverage, starting with Chainlink CCIP.
