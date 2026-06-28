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

    def as_dict(self) -> dict[str, str]:
        return {"source": self.source, "type": self.type, "target": self.target}


class GraphStore:
    def __init__(self, data_dir: Path = DATA_DIR, schema_path: Path = SCHEMA_PATH) -> None:
        self.data_dir = data_dir
        self.schema_path = schema_path
        self.schema = self._load_json(schema_path)
        self.nodes = {node["id"]: node for node in self._load_json(data_dir / "nodes.json")}
        self.edges = [Edge(**edge) for edge in self._load_json(data_dir / "relationships.json")]
        self.goal_paths = {goal["id"]: goal for goal in self._load_json(data_dir / "goal_paths.json")}
        self.outgoing = self._group_edges("source")
        self.incoming = self._group_edges("target")

    @staticmethod
    def _load_json(path: Path) -> Any:
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

    def validate(self) -> list[str]:
        errors: list[str] = []
        allowed_node_types = set(self.schema["node_types"])
        allowed_edge_types = set(self.schema["relationship_types"])

        for node_id, node in self.nodes.items():
            if node.get("type") not in allowed_node_types:
                errors.append(f"{node_id}: unknown node type {node.get('type')}")
            if not node.get("label"):
                errors.append(f"{node_id}: missing label")
            if "citations" not in node:
                errors.append(f"{node_id}: missing citations")

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

        return errors

    def _hydrate_goal(self, goal: dict[str, Any]) -> dict[str, Any]:
        hydrated = dict(goal)
        for field in ("concepts", "apis", "code_examples", "security_warnings", "supported_chains"):
            hydrated[field] = [self.nodes[node_id] for node_id in goal.get(field, []) if node_id in self.nodes]
        return hydrated
