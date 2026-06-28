#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ckg.store import GraphStore


def main() -> int:
    store = GraphStore(ROOT / "data", ROOT / "schemas" / "graph.schema.json")
    errors = store.validate()
    if errors:
        for error in errors:
            print(f"ERROR {error}")
        return 1

    print(
        "OK "
        f"{len(store.nodes)} nodes, "
        f"{len(store.edges)} relationships, "
        f"{len(store.goal_paths)} goal paths, "
        f"{len(store.sources)} sources, "
        f"{len(store.chunks)} chunks, "
        f"{len(store.citations)} citations"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
