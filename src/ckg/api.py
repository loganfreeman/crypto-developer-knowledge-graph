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
DEFAULT_LIMIT = 10
MAX_LIMIT = 50
STATIC_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
}


def current_store() -> GraphStore:
    return STORE


def reload_store() -> GraphStore:
    global STORE
    STORE = GraphStore()
    return STORE


class KnowledgeGraphHandler(BaseHTTPRequestHandler):
    server_version = "CKG/0.1"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.strip("/")
        query = parse_qs(parsed.query)

        try:
            static_path = static_file_path(path)
            if static_path:
                self.static_response(static_path)
                return

            payload = execute_get(path, query)
            if payload is not None:
                self.json_response(payload)
            else:
                self.not_found(path)
        except KeyError as exc:
            self.not_found(str(exc))
        except ValueError as exc:
            self.json_response({"error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path not in ("/graphql", "/api/query", "/api/reload", "/api/trace-builder"):
            self.not_found(parsed.path)
            return

        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length).decode("utf-8")
        try:
            payload = json.loads(body or "{}")
            self.json_response(execute_post(parsed.path, payload))
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
            "serialization_sandboxes": "/api/serialization-sandboxes",
            "operational_playbooks": "/api/operational-playbooks",
            "reload": "POST /api/reload",
            "query": "POST /api/query",
            "trace_builder": "POST /api/trace-builder",
        },
    }


def static_file_path(path: str) -> Path | None:
    if path in ("", "index.html"):
        return ROOT / "frontend" / "index.html"
    if path in ("app.js", "data.js", "graph_view.js", "node_detail.js", "sandboxes.js", "state.js", "styles.css", "serialization_sandbox.js", "trace_builder.js"):
        return ROOT / "frontend" / path
    if path.startswith("frontend/"):
        return ROOT / path
    return None


def api_path(path: str) -> str:
    return path[4:] if path.startswith("api/") else path


def first(query: dict[str, list[str]], key: str, default: Any = "") -> Any:
    return query.get(key, [default])[0]


def execute_get(path: str, query: dict[str, list[str]]) -> dict[str, Any] | None:
    route = api_path(path)
    store = current_store()
    exact_routes = {
        "api": lambda: api_index(),
        "health": lambda: health_payload(store),
        "schema": lambda: store.schema,
        "graph": lambda: graph_payload(store),
        "nodes": lambda: {"nodes": list(store.nodes.values())},
        "relationships": lambda: {"relationships": [edge.as_dict() for edge in store.edges]},
        "trust": lambda: store.trust_report,
        "network-conditions": lambda: {"conditions": store.network_conditions.get("conditions", [])},
        "live-metadata": lambda: {"targets": store.live_metadata.get("targets", [])},
        "serialization-sandboxes": lambda: store.serialization_sandboxes,
        "operational-playbooks": lambda: store.operational_playbooks,
        "sources": lambda: {"sources": list(store.sources.values())},
        "citations": lambda: {"citations": list(store.citations.values())},
        "chunks": lambda: {"chunks": list(store.chunks.values())},
        "goals": lambda: {"goals": store.goals()},
    }
    if route in exact_routes:
        return exact_routes[route]()
    if route == "chunks/search":
        return chunk_search_payload(store, query)
    if route == "search":
        return node_search_payload(store, query)
    if route == "trace":
        return trace_payload(store, query)
    if route.startswith("nodes/"):
        return node_route_payload(store, route, query)
    if route.startswith("operational-playbooks/"):
        playbook_id = route.split("/", 1)[1]
        playbook = store.operational_playbook(playbook_id)
        if playbook is None:
            raise KeyError(playbook_id)
        return playbook
    if route.startswith("goals/"):
        return goal_route_payload(store, route)
    return None


def execute_post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    if path == "/api/query":
        return execute_api_query(current_store(), payload)
    if path == "/api/trace-builder":
        return trace_builder_payload(current_store(), payload)
    if path == "/api/reload":
        return reload_payload()
    if path == "/graphql":
        return {"data": execute_graphql_like_query(current_store(), payload.get("query", ""))}
    raise ValueError("supported POST endpoints: /api/query, /api/trace-builder, /api/reload, /graphql")


def health_payload(store: GraphStore) -> dict[str, Any]:
    return {"ok": True, "nodes": len(store.nodes), "relationships": len(store.edges)}


def reload_payload() -> dict[str, Any]:
    store = reload_store()
    return {"ok": True, "reloaded": True, "nodes": len(store.nodes), "relationships": len(store.edges)}


def node_search_payload(store: GraphStore, query: dict[str, list[str]]) -> dict[str, Any]:
    q = first(query, "q")
    limit = parse_limit(first(query, "limit", str(DEFAULT_LIMIT)))
    return {"query": q, "results": search_nodes(store, q, limit)}


def chunk_search_payload(store: GraphStore, query: dict[str, list[str]]) -> dict[str, Any]:
    q = first(query, "q")
    limit = parse_limit(first(query, "limit", str(DEFAULT_LIMIT)))
    return {"query": q, "results": search_chunks(store, q, limit)}


def trace_payload(store: GraphStore, query: dict[str, list[str]]) -> dict[str, Any]:
    q = first(query, "q")
    limit = parse_limit(first(query, "limit", "8"))
    return node_trace(store, q, limit=limit)


def trace_builder_payload(store: GraphStore, payload: dict[str, Any]) -> dict[str, Any]:
    prompt = str(payload.get("q") or payload.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("trace builder requires q or prompt")

    trace = node_trace(store, prompt, limit=parse_limit(payload.get("limit"), default=7))
    highlighted_ids = [node["id"] for node in trace["seed_nodes"][:7]]
    if not highlighted_ids:
        highlighted_ids = [node["id"] for node in trace["nodes"][:7]]

    requested_goal_id = payload.get("goal_id")
    goal = store.goal(str(requested_goal_id)) if requested_goal_id else None
    focus_node_id = highlighted_ids[0] if highlighted_ids else (goal or {}).get("task_node_id")
    if not focus_node_id:
        raise ValueError("no graph nodes matched the trace prompt")

    return {
        "id": "api-trace-builder",
        "title": trace_builder_title(store, trace),
        "prompt": prompt,
        "goalId": requested_goal_id or infer_goal_id(store, focus_node_id),
        "focusNodeId": focus_node_id,
        "highlightedNodeIds": highlighted_ids,
        "architecturalSteps": trace_builder_steps(store, trace, highlighted_ids),
        "caveats": [
            "Built by the local API from graph search, relationships, citations, and code snippets.",
            "This is deterministic retrieval over curated graph data, not language-model synthesis.",
        ],
        "trace": trace,
    }


def trace_builder_title(store: GraphStore, trace: dict[str, Any]) -> str:
    if trace["seed_nodes"]:
        return f"Graph trace for {trace['seed_nodes'][0]['label']}"
    return "Graph trace"


def infer_goal_id(store: GraphStore, focus_node_id: str) -> str | None:
    for goal_id, goal in store.goal_paths.items():
        node_ids = {goal.get("task_node_id")}
        for field in ("concepts", "apis", "code_examples", "security_warnings", "supported_chains"):
            node_ids.update(goal.get(field, []))
        if focus_node_id in node_ids:
            return goal_id
    return None


def trace_builder_steps(store: GraphStore, trace: dict[str, Any], highlighted_ids: list[str]) -> list[str]:
    steps: list[str] = []
    for node_id in highlighted_ids[:4]:
        node = store.node(node_id)
        if node:
            steps.append(f"Inspect {node['label']}: {node.get('summary', '')}")

    relationship_steps = []
    for edge in trace["relationships"]:
        source = store.node(edge["source"])
        target = store.node(edge["target"])
        if source and target:
            relationship_steps.append(f"Follow {source['label']} --{edge['type']}--> {target['label']}.")
        if len(relationship_steps) >= 4:
            break

    steps.extend(relationship_steps)
    if trace.get("code_solutions"):
        steps.append("Review the returned code snippets for implementation boundaries and byte-level constraints.")
    if trace.get("citations"):
        steps.append("Check grounding sources before treating the path as production guidance.")
    return steps or ["No strong trace path was found. Try naming a protocol, API, serialization format, or build goal."]


def node_route_payload(store: GraphStore, route: str, query: dict[str, list[str]]) -> dict[str, Any]:
    parts = route.split("/")
    node_id = parts[1] if len(parts) > 1 else ""
    subroute = "/".join(parts[2:])
    if not node_id:
        raise KeyError("node id")
    if not subroute:
        node = store.node(node_id)
        if node is None:
            raise KeyError(node_id)
        return node
    if subroute == "neighbors":
        return store.neighbors(node_id, first(query, "direction", "both"))
    if subroute == "horizon":
        edge_types = set(query.get("edge_type", [])) or None
        return store.horizon(node_id, edge_types=edge_types, layer=first(query, "layer", None))
    if subroute == "citations":
        return {"citations": store.node_citations(node_id)}
    if subroute == "network-conditions":
        return {"conditions": store.node_network_conditions(node_id)}
    if subroute == "live-metadata":
        return {"targets": store.node_live_metadata(node_id)}
    if subroute == "operational-playbooks":
        return {"playbooks": store.node_operational_playbooks(node_id)}
    if subroute == "context":
        return node_context(store, node_id)
    raise KeyError(route)


def goal_route_payload(store: GraphStore, route: str) -> dict[str, Any]:
    goal_id = route.split("/", 1)[1]
    goal = store.goal(goal_id)
    if goal is None:
        raise KeyError(goal_id)
    return goal


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
        "serialization_sandboxes": store.serialization_sandboxes,
        "operational_playbooks": store.operational_playbooks,
    }


def parse_limit(raw: Any, default: int = DEFAULT_LIMIT, maximum: int = MAX_LIMIT) -> int:
    if raw in (None, ""):
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("limit must be an integer") from exc
    if value < 1:
        raise ValueError("limit must be at least 1")
    return min(value, maximum)


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
        "serialization_sandboxes": store.node_serialization_sandboxes(node_id),
        "operational_playbooks": store.node_operational_playbooks(node_id),
        "trust": store.node_trust(node_id),
    }


def execute_api_query(store: GraphStore, payload: dict[str, Any]) -> dict[str, Any]:
    query_type = payload.get("type")
    if query_type == "search":
        return {"query": payload.get("q", ""), "results": search_nodes(store, payload.get("q", ""), parse_limit(payload.get("limit")))}
    if query_type == "trace":
        return node_trace(store, payload.get("q", ""), limit=parse_limit(payload.get("limit"), default=8))
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
