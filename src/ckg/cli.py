from __future__ import annotations

import argparse
import json

from .pipeline import build_exports
from .live_metadata import refresh_targets
from .search import search_chunks, search_nodes
from .store import GraphStore, ROOT
from .trace import format_trace, node_trace


def main() -> None:
    parser = argparse.ArgumentParser(description="Crypto Developer Knowledge Graph CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    search_parser = subparsers.add_parser("search")
    search_parser.add_argument("query")

    chunks_parser = subparsers.add_parser("chunks")
    chunks_parser.add_argument("query")

    trace_parser = subparsers.add_parser("trace")
    trace_parser.add_argument("query")
    trace_parser.add_argument("--json", action="store_true")
    trace_parser.add_argument("--limit", type=int, default=8)

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

    network_parser = subparsers.add_parser("network")
    network_parser.add_argument("id", nargs="?")

    live_parser = subparsers.add_parser("live-metadata")
    live_parser.add_argument("id", nargs="?")
    live_parser.add_argument("--refresh", action="store_true")
    live_parser.add_argument("--write", action="store_true")

    export_parser = subparsers.add_parser("export-db")
    export_parser.add_argument("--export-dir", default="data/exports")
    export_parser.add_argument("--embedding-mode", choices=["none", "hash"], default="none")

    args = parser.parse_args()
    store = GraphStore()

    if args.command == "search":
        payload = search_nodes(store, args.query)
    elif args.command == "chunks":
        payload = search_chunks(store, args.query)
    elif args.command == "trace":
        payload = node_trace(store, args.query, limit=args.limit)
        if not args.json:
            print(format_trace(payload))
            return
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
    elif args.command == "network":
        payload = store.node_network_conditions(args.id) if args.id else store.network_conditions
    elif args.command == "live-metadata":
        if args.refresh:
            payload = refresh_targets(node_id=args.id, write=args.write)
        else:
            payload = store.node_live_metadata(args.id) if args.id else store.live_metadata
    elif args.command == "export-db":
        payload = build_exports(export_dir=ROOT / args.export_dir, embedding_mode=args.embedding_mode)
    else:
        payload = store.neighbors(args.id)

    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
