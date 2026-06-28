# Semantic API

The graph is exposed as an API-first developer surface. The web UI is only one consumer; terminals, IDE extensions, and local tools can query the same graph through simple HTTP or the `crypto-graph` CLI.

## HTTP API

Start the API:

```bash
PYTHONPATH=src python3 -m ckg.api
```

Discover endpoints:

```bash
curl "http://127.0.0.1:8000/api"
```

Fetch the full graph bundle consumed by the frontend:

```bash
curl "http://127.0.0.1:8000/api/graph"
```

Search nodes:

```bash
curl "http://127.0.0.1:8000/api/search?q=offline%20signing&limit=5"
```

Trace a developer problem through concepts, relationships, snippets, citations, and live metadata:

```bash
curl "http://127.0.0.1:8000/api/trace?q=Filecoin%20CBOR%20tuple%20misalignment"
```

Fetch a node-centered context packet:

```bash
curl "http://127.0.0.1:8000/api/nodes/substrate-scale-byte-template/context"
```

Fetch deterministic byte-layout sandbox specs for RLP, SCALE, and DAG-CBOR nodes:

```bash
curl "http://127.0.0.1:8000/api/serialization-sandboxes"
```

Use the POST query endpoint when an IDE wants a stable JSON command envelope:

```bash
curl -X POST "http://127.0.0.1:8000/api/query" \
  -H "content-type: application/json" \
  -d '{"type":"trace","q":"Go concurrent Turnkey signer","limit":6}'
```

Supported query types:

```text
search
trace
node_context
horizon
```

## CLI API

The same graph is exposed as a terminal and IDE-friendly semantic API through the `crypto-graph` command.

Install the package in editable mode from the repository root:

```bash
python3 -m pip install -e .
```

Trace a developer problem:

```bash
crypto-graph trace "Filecoin CBOR tuple misalignment"
```

The text output is designed for direct terminal use inside a workspace. It includes:

- seed nodes
- contextual graph relationships
- live registry or ABI checks
- code solutions
- grounding sources

Use JSON for IDE extensions:

```bash
crypto-graph trace "Filecoin CBOR tuple misalignment" --json
```

The JSON payload contains:

```text
query
summary
seed_nodes
nodes
relationships
code_solutions
citations
source_chunks
live_metadata
network_conditions
```

An IDE extension can render `relationships` as a compact graph, open `code_solutions` into an editor panel, and use `citations` plus `source_chunks` for provenance hovercards.

The same command is available without installation:

```bash
PYTHONPATH=src python3 -m ckg.cli trace "Filecoin CBOR tuple misalignment"
PYTHONPATH=src python3 -m ckg.trace "Filecoin CBOR tuple misalignment" --json
```
