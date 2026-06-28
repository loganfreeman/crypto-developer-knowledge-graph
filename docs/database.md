# Database Layer

The production database layer uses Supabase Postgres with `pgvector` and a clean adjacency-list graph schema. Apache AGE can be mirrored later, but the canonical write model stays relational so constraints, citations, and RLS policies remain straightforward.

## Migration

Apply the initial schema:

```bash
supabase db push
```

or run:

```text
supabase/migrations/001_initial_graph_schema.sql
```

The migration enables:

- `vector` for semantic search
- `pgcrypto` for UUID generation
- strict graph node kinds
- adjacency-list edges
- code snippet storage
- document chunks for RAG grounding
- HNSW cosine indexes for node, documentation, snippet, and chunk embeddings

## Ingestion Pipeline

Run the full local pipeline:

```bash
PYTHONPATH=src python3 -m ckg.pipeline
```

This refreshes:

```text
data/chunks.json
data/citations.json
data/exports/nodes.jsonl
data/exports/edges.jsonl
data/exports/code_snippets.jsonl
data/exports/document_chunks.jsonl
data/exports/live_metadata_targets.jsonl
data/exports/live_metadata_checks.jsonl
```

Fetch registered sources before chunking:

```bash
PYTHONPATH=src python3 -m ckg.pipeline --fetch
```

Export rows only through the CLI:

```bash
PYTHONPATH=src python3 -m ckg.cli export-db
```

By default, vector columns are exported as `null`. That is the correct production default until a real embedding provider fills them.

For local smoke tests only, deterministic non-semantic vectors can be emitted:

```bash
PYTHONPATH=src python3 -m ckg.pipeline --embedding-mode hash
```

Do not use hash vectors for retrieval quality; they only verify that import and vector-column plumbing works.

## Live Registry And ABI Verification

The graph ties implementation claims to live metadata through:

- `data/live_metadata.json`
- `live_metadata_targets`
- `live_metadata_checks`

Targets attach directly to graph nodes. Current seeded examples include:

- `substrate-scale-byte-template`: verifies that Polkadot runtime metadata and runtime version are available from RPC before trusting SCALE signing payload fields
- `erc20-transfer-calldata-template`: binds the ERC-20 `transfer(address,uint256)` ABI selector to a deployed Ethereum mainnet contract address
- `ethereum-legacy-rlp-byte-template`: checks that an Ethereum RPC can provide the live chain id required by EIP-155 signing

Inspect cached targets:

```bash
PYTHONPATH=src python3 -m ckg.live_metadata
PYTHONPATH=src python3 -m ckg.cli live-metadata substrate-scale-byte-template
```

Refresh targets through configured JSON-RPC endpoints:

```bash
PYTHONPATH=src python3 -m ckg.live_metadata substrate-scale-byte-template --refresh
```

Ethereum contract and chain checks intentionally require an explicit RPC URL:

```bash
ETHEREUM_RPC_URL=https://... PYTHONPATH=src python3 -m ckg.live_metadata erc20-transfer-calldata-template --refresh
```

Persist refreshed observations:

```bash
PYTHONPATH=src python3 -m ckg.live_metadata substrate-scale-byte-template --refresh --write
```

This keeps the default repo offline and deterministic while still making live verification a first-class production path.

## Node Types

`nodes.kind` is intentionally strict:

- `Primitive`: cryptographic curves, hash algorithms, serialization codecs, signature schemes
- `Protocol`: chains, runtimes, consensus systems, execution environments
- `Action`: developer tasks, RPC calls, payload construction, signing and broadcast flows
- `Vulnerability`: security risks, guardrails, diagnostics, attack classes

Domain-specific legacy types from `data/nodes.json` should be stored in `nodes.metadata`, for example:

```json
{
  "legacy_type": "SigningIntegration",
  "display_group": "Offline signing",
  "runtime": "backend"
}
```

## Embeddings

The schema uses `vector(1536)`, matching `text-embedding-3-small`.

Recommended node embedding text:

```text
{label}
{kind}
{summary}
tags: ...
contexts: ...
metadata: ...
```

Recommended documentation embedding text:

```text
{label}
{theoretical_documentation}
source claims: ...
```

Store those vectors in:

- `nodes.embedding`
- `nodes.documentation_embedding`
- `code_snippets.embedding`
- `document_chunks.embedding`

## Core Tables

`nodes` stores typed graph entities, semantic metadata, source ids, and vectors.

`edges` stores directed relationships:

```sql
select
  s.label as source,
  e.kind,
  t.label as target,
  e.context,
  e.confidence
from edges e
join nodes s on s.id = e.source_node_id
join nodes t on t.id = e.target_node_id
where s.id = 'offline-transaction-signer';
```

`code_snippets` attaches executable examples to graph nodes:

```sql
select title, language, summary, code
from code_snippets
where node_id = 'turnkey-raw-payload-signing-pattern'
order by language, title;
```

`document_chunks` stores cited theoretical documentation and retrieval chunks.

`live_metadata_targets` stores RPC-backed registry tracks and contract ABI bindings. `live_metadata_checks` stores the individual observed claims, such as metadata availability, chain id availability, deployed bytecode presence, or selector verification.

## Semantic Search

Find conceptually similar nodes:

```sql
select *
from match_nodes(
  '[0.001, ...]'::vector,
  10,
  'Action'
);
```

Find grounding chunks for a selected node:

```sql
select *
from match_document_chunks(
  '[0.001, ...]'::vector,
  8,
  'offline-transaction-signer'
);
```

The frontend Copilot Bridge can use `match_nodes` to retrieve a path seed, expand adjacent `edges`, then use `match_document_chunks` to ground the answer.
