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
  sources/               Cached source documents
schemas/
  graph.schema.json      Versioned graph contract
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

## Example Usage

Search from the command line:

```bash
PYTHONPATH=src python3 -m ckg.cli search "eth_getBalance"
PYTHONPATH=src python3 -m ckg.cli chunks "signed transaction"
PYTHONPATH=src python3 -m ckg.cli citations ethereum
PYTHONPATH=src python3 -m ckg.cli path build-wallet
PYTHONPATH=src python3 -m ckg.cli node ethereum
```

Use the REST API:

```bash
curl "http://127.0.0.1:8000/search?q=transaction"
curl "http://127.0.0.1:8000/chunks/search?q=signed%20transaction"
curl "http://127.0.0.1:8000/nodes/ethereum/citations"
curl "http://127.0.0.1:8000/nodes/ethereum/neighbors"
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

Every node should carry citations where practical. Citation values are source identifiers or URLs that ingestion can later resolve into document chunks, embeddings, and provenance metadata.

## MVP Roadmap

1. Replace JSON storage with Postgres for canonical metadata.
2. Mirror graph relationships into Neo4j or Memgraph.
3. Add Meilisearch/OpenSearch for keyword search.
4. Add embeddings over cited source docs for natural-language retrieval.
5. Swap the static browser for a Next.js graph navigation UI.
6. Expand cross-chain coverage, starting with Chainlink CCIP.
