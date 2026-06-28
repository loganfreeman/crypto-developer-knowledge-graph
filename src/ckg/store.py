from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
SCHEMA_PATH = ROOT / "schemas" / "graph.schema.json"


@dataclass(frozen=True)
class Edge:
    source: str
    type: str
    target: str
    context: str | None = None
    layer: str | None = None
    confidence: str | None = None
    evidence: list[str] | None = None
    developer_note: str | None = None

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "Edge":
        return cls(
            source=payload["source"],
            type=payload["type"],
            target=payload["target"],
            context=payload.get("context"),
            layer=payload.get("layer"),
            confidence=payload.get("confidence"),
            evidence=payload.get("evidence"),
            developer_note=payload.get("developer_note"),
        )

    def as_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"source": self.source, "type": self.type, "target": self.target}
        for key in ("context", "layer", "confidence", "evidence", "developer_note"):
            value = getattr(self, key)
            if value:
                payload[key] = value
        return payload


class GraphStore:
    def __init__(self, data_dir: Path = DATA_DIR, schema_path: Path = SCHEMA_PATH) -> None:
        self.data_dir = data_dir
        self.schema_path = schema_path
        self.schema = self._load_json(schema_path)
        self.nodes = {node["id"]: node for node in self._load_json(data_dir / "nodes.json")}
        self.edges = [Edge.from_dict(edge) for edge in self._load_json(data_dir / "relationships.json")]
        self.goal_paths = {goal["id"]: goal for goal in self._load_json(data_dir / "goal_paths.json")}
        self.sources = {source["id"]: source for source in self._load_optional_json(data_dir / "sources.json", [])}
        self.chunks = {chunk["id"]: chunk for chunk in self._load_optional_json(data_dir / "chunks.json", [])}
        self.citations = {citation["id"]: citation for citation in self._load_optional_json(data_dir / "citations.json", [])}
        self.trust_report = self._load_optional_json(data_dir / "trust_report.json", {"summary": {}, "nodes": [], "sources": []})
        self.network_conditions = self._load_optional_json(data_dir / "network_conditions.json", {"conditions": []})
        self.outgoing = self._group_edges("source")
        self.incoming = self._group_edges("target")

    @staticmethod
    def _load_json(path: Path) -> Any:
        with path.open(encoding="utf-8") as handle:
            return json.load(handle)

    @staticmethod
    def _load_optional_json(path: Path, default: Any) -> Any:
        if not path.exists():
            return default
        with path.open(encoding="utf-8") as handle:
            return json.load(handle)

    def _group_edges(self, key: str) -> dict[str, list[Edge]]:
        grouped: dict[str, list[Edge]] = {}
        for edge in self.edges:
            grouped.setdefault(getattr(edge, key), []).append(edge)
        return grouped

    def node(self, node_id: str) -> dict[str, Any] | None:
        return self.nodes.get(node_id)

    def goal(self, goal_id: str) -> dict[str, Any] | None:
        goal = self.goal_paths.get(goal_id)
        if not goal:
            return None
        return self._hydrate_goal(goal)

    def goals(self) -> list[dict[str, Any]]:
        return [self._hydrate_goal(goal) for goal in self.goal_paths.values()]

    def neighbors(self, node_id: str, direction: str = "both") -> dict[str, Any]:
        if node_id not in self.nodes:
            raise KeyError(node_id)

        edges: list[Edge] = []
        if direction in ("out", "both"):
            edges.extend(self.outgoing.get(node_id, []))
        if direction in ("in", "both"):
            edges.extend(self.incoming.get(node_id, []))

        node_ids = {edge.source for edge in edges} | {edge.target for edge in edges}
        return {
            "node": self.nodes[node_id],
            "nodes": [self.nodes[item] for item in sorted(node_ids) if item in self.nodes],
            "relationships": [edge.as_dict() for edge in edges],
        }

    def subgraph(self, node_ids: Iterable[str]) -> dict[str, Any]:
        selected = {node_id for node_id in node_ids if node_id in self.nodes}
        edges = [edge for edge in self.edges if edge.source in selected and edge.target in selected]
        return {
            "nodes": [self.nodes[node_id] for node_id in sorted(selected)],
            "relationships": [edge.as_dict() for edge in edges],
        }

    def horizon(self, node_id: str, edge_types: set[str] | None = None, layer: str | None = None) -> dict[str, Any]:
        if node_id not in self.nodes:
            raise KeyError(node_id)

        edges: list[Edge] = []
        for edge in self.outgoing.get(node_id, []) + self.incoming.get(node_id, []):
            if edge_types and edge.type not in edge_types:
                continue
            peer_id = edge.target if edge.source == node_id else edge.source
            peer = self.nodes.get(peer_id)
            if layer and peer and layer not in peer.get("layers", []):
                continue
            edges.append(edge)

        node_ids = {node_id} | {edge.source for edge in edges} | {edge.target for edge in edges}
        grouped: dict[str, list[dict[str, Any]]] = {}
        for item in sorted(node_ids):
            node = self.nodes[item]
            group = node.get("display_group") or (node.get("layers") or [node["type"]])[0]
            grouped.setdefault(group, []).append(node)

        return {
            "focus": self.nodes[node_id],
            "groups": grouped,
            "nodes": [self.nodes[item] for item in sorted(node_ids)],
            "relationships": [edge.as_dict() for edge in edges],
        }

    def node_citations(self, node_id: str) -> list[dict[str, Any]]:
        citations = [citation for citation in self.citations.values() if citation["node_id"] == node_id]
        enriched = []
        for citation in citations:
            item = dict(citation)
            item["source"] = self.sources.get(citation["source_id"])
            item["chunk"] = self.chunks.get(citation.get("chunk_id"))
            enriched.append(item)
        return enriched

    def citation_keys(self) -> set[str]:
        keys = set(self.sources)
        keys.update(source["url"] for source in self.sources.values())
        keys.update(self.citations)
        keys.update(citation["source_url"] for citation in self.citations.values())
        return keys

    def node_trust(self, node_id: str) -> dict[str, Any] | None:
        for item in self.trust_report.get("nodes", []):
            if item["id"] == node_id:
                return item
        return None

    def node_network_conditions(self, node_id: str) -> list[dict[str, Any]]:
        try:
            from .network_conditions import annotate_condition
        except ImportError:
            return []
        return [
            annotate_condition(condition)
            for condition in self.network_conditions.get("conditions", [])
            if condition.get("node_id") == node_id
        ]

    def validate(self) -> list[str]:
        errors: list[str] = []
        allowed_node_types = set(self.schema["node_types"])
        allowed_edge_types = set(self.schema["relationship_types"])
        citation_keys = self.citation_keys()

        for node_id, node in self.nodes.items():
            if node.get("type") not in allowed_node_types:
                errors.append(f"{node_id}: unknown node type {node.get('type')}")
            if not node.get("label"):
                errors.append(f"{node_id}: missing label")
            if "citations" not in node:
                errors.append(f"{node_id}: missing citations")
            for citation in node.get("citations", []):
                if citation not in citation_keys:
                    errors.append(f"{node_id}: unresolved citation {citation}")

        for edge in self.edges:
            if edge.source not in self.nodes:
                errors.append(f"{edge.source} -> {edge.target}: missing source node")
            if edge.target not in self.nodes:
                errors.append(f"{edge.source} -> {edge.target}: missing target node")
            if edge.type not in allowed_edge_types:
                errors.append(f"{edge.source} -> {edge.target}: unknown relationship type {edge.type}")

        for goal_id, goal in self.goal_paths.items():
            for field in ("concepts", "apis", "code_examples", "security_warnings", "supported_chains"):
                for node_id in goal.get(field, []):
                    if node_id not in self.nodes:
                        errors.append(f"{goal_id}.{field}: missing node {node_id}")

        for source_id, source in self.sources.items():
            local_path = ROOT / source["local_path"]
            if not local_path.exists():
                errors.append(f"{source_id}: missing local source document {source['local_path']}")

        for citation_id, citation in self.citations.items():
            if citation["node_id"] not in self.nodes:
                errors.append(f"{citation_id}: missing cited node {citation['node_id']}")
            if citation["source_id"] not in self.sources:
                errors.append(f"{citation_id}: missing source {citation['source_id']}")
            chunk_id = citation.get("chunk_id")
            if chunk_id and chunk_id not in self.chunks:
                errors.append(f"{citation_id}: missing chunk {chunk_id}")

        return errors

    def _hydrate_goal(self, goal: dict[str, Any]) -> dict[str, Any]:
        hydrated = dict(goal)
        for field in ("concepts", "apis", "code_examples", "security_warnings", "supported_chains"):
            hydrated[field] = [self.nodes[node_id] for node_id in goal.get(field, []) if node_id in self.nodes]
        return hydrated
