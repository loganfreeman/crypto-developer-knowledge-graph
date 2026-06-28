---
name: crypto-trace
description: Trace crypto/Web3 implementation questions through the Crypto Developer Knowledge Graph. Use when the user asks for contextual graph mapping, CLI/IDE semantic API output, code solutions, source-grounded implementation paths, or terminal commands like `crypto-graph trace "Filecoin CBOR tuple misalignment"`.
---

# Crypto Trace

Use this skill to answer developer questions by tracing the local knowledge graph instead of giving a free-floating explanation.

## Workflow

1. Run a trace for the user query:

```bash
PYTHONPATH=src python3 -m ckg.cli trace "<query>"
```

Use JSON when the output is for an IDE extension or another tool:

```bash
PYTHONPATH=src python3 -m ckg.cli trace "<query>" --json
```

2. Treat the trace output as source of truth:

- seed nodes are matched concepts
- relationships are the contextual graph mapping
- code solutions are implementation snippets
- live metadata shows RPC/ABI verification targets
- citations and source chunks provide provenance

3. If the user wants a human answer, summarize in this order:

- implementation path
- byte/protocol constraints
- code snippets or commands
- live metadata and citation caveats

4. If the user wants machine-readable output, return JSON without reformatting unless asked.

## Reference

For examples, expected output shape, and command variants, read [trace.md](references/trace.md).
