# Database Layer

The production database layer uses Supabase Postgres with `pgvector` and a clean adjacency-list graph schema. Apache AGE can be mirrored later, but the canonical write model stays relational so constraints, citations, and RLS policies remain straightforward.

## Migration

Apply the schema:

```bash
supabase db push
```

or run:

```text
supabase/migrations/001_initial_graph_schema.sql
supabase/migrations/002_normalized_graph_dimensions.sql
```

The migration enables:

- `vector` for semantic search
- `pgcrypto` for UUID generation
- strict graph node kinds
- adjacency-list edges
- code snippet storage
- document chunks for RAG grounding
- normalized dimensions for tags, contexts, layers, sources, aliases, code metadata, ABI items, and runtime observations
- HNSW cosine indexes for node, documentation, snippet, and chunk embeddings

## DB-First Topology

The JSON files in `data/` are now seed fixtures and offline developer ergonomics. The production topology is Supabase/Postgres:

- `nodes` and `edges` define the canonical graph.
- `node_tags`, `node_contexts`, and `node_layers` provide fast semantic filtering without array scans.
- `node_sources` and `document_chunk_nodes` make every claim traceable to source chunks.
- `code_snippets` plus `code_snippet_sources`, `code_snippet_package_hints`, and `code_snippet_security_notes` expose executable implementation guidance.
- `live_metadata_targets`, `live_metadata_checks`, `runtime_metadata_observations`, and `contract_abi_items` bind concepts to live network state and contract ABI facts.
- `node_runtime_dependencies` records which graph concepts must be revalidated when runtime metadata, registry tracks, or ABI bindings change.

The compatibility arrays on `nodes`, `code_snippets`, and `live_metadata_targets` remain useful for quick imports and local browsing, but new application queries should prefer the normalized tables.

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
data/exports/node_tags.jsonl
data/exports/node_contexts.jsonl
data/exports/node_layers.jsonl
data/exports/node_sources.jsonl
data/exports/node_aliases.jsonl
data/exports/code_snippet_sources.jsonl
data/exports/code_snippet_package_hints.jsonl
data/exports/code_snippet_security_notes.jsonl
data/exports/document_chunk_nodes.jsonl
data/exports/live_metadata_target_sources.jsonl
data/exports/contract_abi_items.jsonl
data/exports/runtime_metadata_observations.jsonl
data/exports/node_runtime_dependencies.jsonl
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

Normalized query tables:

```sql
select n.label, nt.tag, nc.context, nl.layer
from nodes n
join node_tags nt on nt.node_id = n.id
left join node_contexts nc on nc.node_id = n.id
left join node_layers nl on nl.node_id = n.id
where nt.tag = 'offline-signing';
```

```sql
select abi.signature, abi.selector, abi.inputs, abi.outputs
from contract_abi_items abi
join nodes n on n.id = abi.node_id
where n.id = 'erc20-transfer-calldata-template';
```

```sql
select n.label, obs.runtime, obs.serialization, obs.observed_at, obs.verification
from runtime_metadata_observations obs
join nodes n on n.id = obs.node_id
where obs.network = 'Polkadot'
order by obs.observed_at desc nulls last;
```

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
