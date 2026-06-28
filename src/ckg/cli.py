from __future__ import annotations

import argparse
import json

from .search import search_nodes
from .store import GraphStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Crypto Developer Knowledge Graph CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    search_parser = subparsers.add_parser("search")
    search_parser.add_argument("query")

    node_parser = subparsers.add_parser("node")
    node_parser.add_argument("id")

    path_parser = subparsers.add_parser("path")
    path_parser.add_argument("id")

    neighbors_parser = subparsers.add_parser("neighbors")
    neighbors_parser.add_argument("id")

    args = parser.parse_args()
    store = GraphStore()

    if args.command == "search":
        payload = search_nodes(store, args.query)
    elif args.command == "node":
        payload = store.node(args.id)
    elif args.command == "path":
        payload = store.goal(args.id)
    else:
        payload = store.neighbors(args.id)

    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
