# Semantic API

The graph is exposed as a terminal and IDE-friendly semantic API through the `crypto-graph` command.

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
