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
            elif path == "health":
                self.json_response({"ok": True, "nodes": len(STORE.nodes), "relationships": len(STORE.edges)})
            elif path == "schema":
                self.json_response(STORE.schema)
            elif path == "nodes":
                self.json_response({"nodes": list(STORE.nodes.values())})
            elif path.startswith("nodes/") and path.endswith("/neighbors"):
                node_id = path.split("/")[1]
                direction = query.get("direction", ["both"])[0]
                self.json_response(STORE.neighbors(node_id, direction))
            elif path.startswith("nodes/") and path.endswith("/citations"):
                node_id = path.split("/")[1]
                self.json_response({"citations": STORE.node_citations(node_id)})
            elif path.startswith("nodes/"):
                node_id = path.split("/", 1)[1]
                node = STORE.node(node_id)
                self.json_response(node) if node else self.not_found(node_id)
            elif path == "relationships":
                self.json_response({"relationships": [edge.as_dict() for edge in STORE.edges]})
            elif path == "sources":
                self.json_response({"sources": list(STORE.sources.values())})
            elif path == "citations":
                self.json_response({"citations": list(STORE.citations.values())})
            elif path == "chunks":
                self.json_response({"chunks": list(STORE.chunks.values())})
            elif path == "chunks/search":
                q = query.get("q", [""])[0]
                limit = int(query.get("limit", ["10"])[0])
                self.json_response({"query": q, "results": search_chunks(STORE, q, limit)})
            elif path == "goals":
                self.json_response({"goals": STORE.goals()})
            elif path.startswith("goals/"):
                goal_id = path.split("/", 1)[1]
                goal = STORE.goal(goal_id)
                self.json_response(goal) if goal else self.not_found(goal_id)
            elif path == "search":
                q = query.get("q", [""])[0]
                limit = int(query.get("limit", ["10"])[0])
                self.json_response({"query": q, "results": search_nodes(STORE, q, limit)})
            else:
                self.not_found(path)
        except KeyError as exc:
            self.not_found(str(exc))
        except ValueError as exc:
            self.json_response({"error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/graphql":
            self.not_found(parsed.path)
            return

        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length).decode("utf-8")
        try:
            payload = json.loads(body or "{}")
            self.json_response({"data": execute_graphql_like_query(STORE, payload.get("query", ""))})
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

    def log_message(self, format: str, *args: Any) -> None:
        return


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
