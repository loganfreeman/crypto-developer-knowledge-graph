from __future__ import annotations

import argparse
import json

from .search import search_chunks, search_nodes
from .store import GraphStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Crypto Developer Knowledge Graph CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    search_parser = subparsers.add_parser("search")
    search_parser.add_argument("query")

    chunks_parser = subparsers.add_parser("chunks")
    chunks_parser.add_argument("query")

    node_parser = subparsers.add_parser("node")
    node_parser.add_argument("id")

    path_parser = subparsers.add_parser("path")
    path_parser.add_argument("id")

    neighbors_parser = subparsers.add_parser("neighbors")
    neighbors_parser.add_argument("id")

    horizon_parser = subparsers.add_parser("horizon")
    horizon_parser.add_argument("id")
    horizon_parser.add_argument("--edge-type", action="append", default=[])
    horizon_parser.add_argument("--layer")

    citations_parser = subparsers.add_parser("citations")
    citations_parser.add_argument("id")

    subparsers.add_parser("trust")

    args = parser.parse_args()
    store = GraphStore()

    if args.command == "search":
        payload = search_nodes(store, args.query)
    elif args.command == "chunks":
        payload = search_chunks(store, args.query)
    elif args.command == "node":
        payload = store.node(args.id)
    elif args.command == "path":
        payload = store.goal(args.id)
    elif args.command == "citations":
        payload = store.node_citations(args.id)
    elif args.command == "horizon":
        payload = store.horizon(args.id, edge_types=set(args.edge_type) or None, layer=args.layer)
    elif args.command == "trust":
        payload = store.trust_report
    else:
        payload = store.neighbors(args.id)

    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
