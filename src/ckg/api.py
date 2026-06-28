from __future__ import annotations

import json
import os
import re
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from .search import search_chunks, search_nodes
from .store import GraphStore, ROOT
from .trace import code_snippets_for_nodes, node_trace


STORE = GraphStore()
STATIC_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
}


class KnowledgeGraphHandler(BaseHTTPRequestHandler):
    server_version = "CKG/0.1"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.strip("/")
        api_path = path[4:] if path.startswith("api/") else path
        query = parse_qs(parsed.query)

        try:
            if path in ("", "index.html"):
                self.static_response(ROOT / "frontend" / "index.html")
            elif path in ("app.js", "styles.css"):
                self.static_response(ROOT / "frontend" / path)
            elif path.startswith("frontend/"):
                self.static_response(ROOT / path)
            elif path.startswith("data/"):
                self.static_response(ROOT / path)
            elif api_path == "api" or path == "api":
                self.json_response(api_index())
            elif api_path == "health":
                self.json_response({"ok": True, "nodes": len(STORE.nodes), "relationships": len(STORE.edges)})
            elif api_path == "schema":
                self.json_response(STORE.schema)
            elif api_path == "graph":
                self.json_response(graph_payload(STORE))
            elif api_path == "nodes":
                self.json_response({"nodes": list(STORE.nodes.values())})
            elif api_path.startswith("nodes/") and api_path.endswith("/neighbors"):
                node_id = api_path.split("/")[1]
                direction = query.get("direction", ["both"])[0]
                self.json_response(STORE.neighbors(node_id, direction))
            elif api_path.startswith("nodes/") and api_path.endswith("/horizon"):
                node_id = api_path.split("/")[1]
                edge_types = set(query.get("edge_type", [])) or None
                layer = query.get("layer", [None])[0]
                self.json_response(STORE.horizon(node_id, edge_types=edge_types, layer=layer))
            elif api_path.startswith("nodes/") and api_path.endswith("/citations"):
                node_id = api_path.split("/")[1]
                self.json_response({"citations": STORE.node_citations(node_id)})
            elif api_path.startswith("nodes/") and api_path.endswith("/network-conditions"):
                node_id = api_path.split("/")[1]
                self.json_response({"conditions": STORE.node_network_conditions(node_id)})
            elif api_path.startswith("nodes/") and api_path.endswith("/live-metadata"):
                node_id = api_path.split("/")[1]
                self.json_response({"targets": STORE.node_live_metadata(node_id)})
            elif api_path.startswith("nodes/") and api_path.endswith("/context"):
                node_id = api_path.split("/")[1]
                self.json_response(node_context(STORE, node_id))
            elif api_path.startswith("nodes/"):
                node_id = api_path.split("/", 1)[1]
                node = STORE.node(node_id)
                self.json_response(node) if node else self.not_found(node_id)
            elif api_path == "relationships":
                self.json_response({"relationships": [edge.as_dict() for edge in STORE.edges]})
            elif api_path == "trust":
                self.json_response(STORE.trust_report)
            elif api_path == "network-conditions":
                self.json_response({"conditions": STORE.network_conditions.get("conditions", [])})
            elif api_path == "live-metadata":
                self.json_response({"targets": STORE.live_metadata.get("targets", [])})
            elif api_path == "sources":
                self.json_response({"sources": list(STORE.sources.values())})
            elif api_path == "citations":
                self.json_response({"citations": list(STORE.citations.values())})
            elif api_path == "chunks":
                self.json_response({"chunks": list(STORE.chunks.values())})
            elif api_path == "chunks/search":
                q = query.get("q", [""])[0]
                limit = int(query.get("limit", ["10"])[0])
                self.json_response({"query": q, "results": search_chunks(STORE, q, limit)})
            elif api_path == "goals":
                self.json_response({"goals": STORE.goals()})
            elif api_path.startswith("goals/"):
                goal_id = api_path.split("/", 1)[1]
                goal = STORE.goal(goal_id)
                self.json_response(goal) if goal else self.not_found(goal_id)
            elif api_path == "search":
                q = query.get("q", [""])[0]
                limit = int(query.get("limit", ["10"])[0])
                self.json_response({"query": q, "results": search_nodes(STORE, q, limit)})
            elif api_path == "trace":
                q = query.get("q", [""])[0]
                limit = int(query.get("limit", ["8"])[0])
                self.json_response(node_trace(STORE, q, limit=limit))
            else:
                self.not_found(path)
        except KeyError as exc:
            self.not_found(str(exc))
        except ValueError as exc:
            self.json_response({"error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path not in ("/graphql", "/api/query"):
            self.not_found(parsed.path)
            return

        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length).decode("utf-8")
        try:
            payload = json.loads(body or "{}")
            if parsed.path == "/api/query":
                self.json_response(execute_api_query(STORE, payload))
            else:
                self.json_response({"data": execute_graphql_like_query(STORE, payload.get("query", ""))})
        except KeyError as exc:
            self.json_response({"error": f"missing field: {exc}"}, HTTPStatus.BAD_REQUEST)
        except ValueError as exc:
            self.json_response({"error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def json_response(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("access-control-allow-origin", "*")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def not_found(self, item: str) -> None:
        self.json_response({"error": f"not found: {item}"}, HTTPStatus.NOT_FOUND)

    def static_response(self, path: Path) -> None:
        resolved = path.resolve()
        root = ROOT.resolve()
        if not str(resolved).startswith(str(root)) or not resolved.exists() or not resolved.is_file():
            self.not_found(str(path))
            return

        body = resolved.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("content-type", STATIC_TYPES.get(resolved.suffix, "application/octet-stream"))
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "GET, POST, OPTIONS")
        self.send_header("access-control-allow-headers", "content-type")
        self.end_headers()

    def log_message(self, format: str, *args: Any) -> None:
        return


def api_index() -> dict[str, Any]:
    return {
        "name": "Crypto Developer Knowledge Graph API",
        "version": "0.1",
        "endpoints": {
            "graph": "/api/graph",
            "search": "/api/search?q=wallet&limit=10",
            "trace": "/api/trace?q=Filecoin%20CBOR%20tuple%20misalignment",
            "node": "/api/nodes/{id}",
            "node_context": "/api/nodes/{id}/context",
            "horizon": "/api/nodes/{id}/horizon?edge_type=REQUIRES&layer=infrastructure",
            "citations": "/api/nodes/{id}/citations",
            "network_conditions": "/api/nodes/{id}/network-conditions",
            "live_metadata": "/api/nodes/{id}/live-metadata",
            "query": "POST /api/query",
        },
    }


def graph_payload(store: GraphStore) -> dict[str, Any]:
    return {
        "nodes": list(store.nodes.values()),
        "relationships": [edge.as_dict() for edge in store.edges],
        "goals": list(store.goal_paths.values()),
        "citations": list(store.citations.values()),
        "chunks": list(store.chunks.values()),
        "sources": list(store.sources.values()),
        "trust": store.trust_report,
        "network_conditions": store.network_conditions,
        "live_metadata": store.live_metadata,
    }


def node_context(store: GraphStore, node_id: str) -> dict[str, Any]:
    node = store.node(node_id)
    if node is None:
        raise KeyError(node_id)
    node_ids = {node_id}
    for edge in store.outgoing.get(node_id, []) + store.incoming.get(node_id, []):
        node_ids.add(edge.source)
        node_ids.add(edge.target)
    return {
        "node": node,
        "horizon": store.horizon(node_id),
        "citations": store.node_citations(node_id),
        "code_solutions": code_snippets_for_nodes(store, node_ids),
        "network_conditions": store.node_network_conditions(node_id),
        "live_metadata": store.node_live_metadata(node_id),
        "trust": store.node_trust(node_id),
    }


def execute_api_query(store: GraphStore, payload: dict[str, Any]) -> dict[str, Any]:
    query_type = payload.get("type")
    if query_type == "search":
        return {"query": payload.get("q", ""), "results": search_nodes(store, payload.get("q", ""), int(payload.get("limit", 10)))}
    if query_type == "trace":
        return node_trace(store, payload.get("q", ""), limit=int(payload.get("limit", 8)))
    if query_type == "node_context":
        return node_context(store, payload["id"])
    if query_type == "horizon":
        edge_types = set(payload.get("edge_types", [])) or None
        return store.horizon(payload["id"], edge_types=edge_types, layer=payload.get("layer"))
    raise ValueError("supported API query types: search, trace, node_context, horizon")


def execute_graphql_like_query(store: GraphStore, query: str) -> dict[str, Any]:
    node_match = re.search(r'node\s*\(\s*id\s*:\s*"([^"]+)"\s*\)', query)
    if node_match:
        node_id = node_match.group(1)
        node = store.node(node_id)
        if node is None:
            raise ValueError(f"unknown node: {node_id}")
        return {"node": node}

    search_match = re.search(r'search\s*\(\s*q\s*:\s*"([^"]+)"\s*\)', query)
    if search_match:
        return {"search": search_nodes(store, search_match.group(1))}

    chunk_match = re.search(r'chunks\s*\(\s*q\s*:\s*"([^"]+)"\s*\)', query)
    if chunk_match:
        return {"chunks": search_chunks(store, chunk_match.group(1))}

    goal_match = re.search(r'goal\s*\(\s*id\s*:\s*"([^"]+)"\s*\)', query)
    if goal_match:
        goal_id = goal_match.group(1)
        goal = store.goal(goal_id)
        if goal is None:
            raise ValueError(f"unknown goal: {goal_id}")
        return {"goal": goal}

    raise ValueError('supported queries: node(id:"..."), search(q:"..."), chunks(q:"..."), goal(id:"...")')


def main() -> None:
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), KnowledgeGraphHandler)
    print(f"Crypto Developer Knowledge Graph API listening on http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
