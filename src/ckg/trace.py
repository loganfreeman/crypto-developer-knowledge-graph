from __future__ import annotations

import argparse
import json
from typing import Any

from .search import search_chunks, search_nodes
from .store import Edge, GraphStore


TRACE_EDGE_TYPES = {
    "REQUIRES",
    "DEPENDS_ON",
    "USES_TEMPLATE",
    "SERIALIZES_AS",
    "HASHES_TO",
    "FAILS_WITH",
    "DEBUGGED_BY",
    "HAS_GUARDRAIL",
    "CAN_USE_SIGNER",
    "IMPLEMENTED_BY",
    "BROADCASTS",
}


def related_edges(store: GraphStore, node_ids: set[str], limit: int = 24) -> list[Edge]:
    scored: list[tuple[int, Edge]] = []
    for edge in store.edges:
        source_hit = edge.source in node_ids
        target_hit = edge.target in node_ids
        if not source_hit and not target_hit:
            continue
        score = 0
        if source_hit and target_hit:
            score += 8
        if edge.type in TRACE_EDGE_TYPES:
            score += 4
        if edge.confidence == "high":
            score += 2
        scored.append((score, edge))
    scored.sort(key=lambda item: (-item[0], item[1].source, item[1].target))
    return [edge for _, edge in scored[:limit]]


def code_snippets_for_nodes(store: GraphStore, node_ids: set[str], limit: int = 8) -> list[dict[str, Any]]:
    snippets: list[dict[str, Any]] = []
    for node_id in node_ids:
        node = store.node(node_id)
        if not node:
            continue
        if node.get("code"):
            snippets.append(
                {
                    "node_id": node_id,
                    "node_label": node["label"],
                    "title": node["label"],
                    "language": node.get("language", "text"),
                    "summary": node.get("summary", ""),
                    "code": node["code"],
                }
            )
        for example in node.get("multi_language_examples", []):
            snippets.append(
                {
                    "node_id": node_id,
                    "node_label": node["label"],
                    "title": example.get("title") or node["label"],
                    "language": example.get("language", "text"),
                    "summary": example.get("summary", node.get("summary", "")),
                    "code": example["code"],
                }
            )
    snippets.sort(key=lambda item: (item["language"].lower(), item["title"].lower()))
    return snippets[:limit]


def node_trace(store: GraphStore, query: str, limit: int = 8) -> dict[str, Any]:
    matches = search_nodes(store, query, limit=limit)
    seed_ids = {node["id"] for node in matches}
    expanded_ids = set(seed_ids)
    edge_by_key: dict[tuple[str, str, str], Edge] = {}
    for _ in range(2):
        for edge in related_edges(store, expanded_ids):
            edge_by_key[(edge.source, edge.type, edge.target)] = edge
            expanded_ids.add(edge.source)
            expanded_ids.add(edge.target)
    edges = list(edge_by_key.values())

    nodes = [store.nodes[node_id] for node_id in sorted(expanded_ids) if node_id in store.nodes]
    chunks = search_chunks(store, query, limit=5)
    citations = [
        citation
        for node_id in sorted(expanded_ids)
        for citation in store.node_citations(node_id)
    ][:10]
    live_metadata = [
        target
        for node_id in sorted(expanded_ids)
        for target in store.node_live_metadata(node_id)
    ]
    network_conditions = [
        condition
        for node_id in sorted(expanded_ids)
        for condition in store.node_network_conditions(node_id)
    ]

    return {
        "query": query,
        "summary": {
            "seed_nodes": len(matches),
            "expanded_nodes": len(nodes),
            "relationships": len(edges),
            "code_snippets": len(code_snippets_for_nodes(store, expanded_ids)),
            "citations": len(citations),
            "live_metadata_targets": len(live_metadata),
        },
        "seed_nodes": matches,
        "nodes": nodes,
        "relationships": [edge.as_dict() for edge in edges],
        "code_solutions": code_snippets_for_nodes(store, expanded_ids),
        "citations": citations,
        "source_chunks": chunks,
        "live_metadata": live_metadata,
        "network_conditions": network_conditions,
    }


def format_trace(payload: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"Trace: {payload['query']}")
    lines.append("=" * (7 + len(payload["query"])))
    summary = payload["summary"]
    lines.append(
        f"{summary['expanded_nodes']} nodes, {summary['relationships']} relationships, "
        f"{summary['code_snippets']} code snippets, {summary['live_metadata_targets']} live metadata targets"
    )
    lines.append("")

    lines.append("Seed Nodes")
    for node in payload["seed_nodes"]:
        lines.append(f"- {node['id']} [{node['type']}]: {node['label']}")
        lines.append(f"  {node['summary']}")
    lines.append("")

    lines.append("Contextual Graph Mapping")
    for edge in payload["relationships"]:
        detail = " / ".join(str(edge.get(key)) for key in ("context", "layer", "confidence") if edge.get(key))
        suffix = f" ({detail})" if detail else ""
        lines.append(f"- {edge['source']} --{edge['type']}--> {edge['target']}{suffix}")
        if edge.get("developer_note"):
            lines.append(f"  note: {edge['developer_note']}")
    lines.append("")

    if payload["live_metadata"]:
        lines.append("Live Registry / ABI Checks")
        for target in payload["live_metadata"]:
            lines.append(f"- {target['id']} [{target['kind']}] {target['network']} status={target.get('freshness_status', target.get('status'))}")
            for check in target.get("checks", []):
                lines.append(f"  - {check['key']}: {check.get('verification', 'unverified')} via {check.get('rpc_method', 'local')}")
        lines.append("")

    lines.append("Code Solutions")
    if not payload["code_solutions"]:
        lines.append("- No code snippets found for this trace.")
    for item in payload["code_solutions"]:
        lines.append(f"- {item['title']} ({item['language']}) from {item['node_id']}")
        lines.append(f"  {item['summary']}")
        lines.append("```" + item["language"].lower())
        lines.append(item["code"])
        lines.append("```")
    lines.append("")

    lines.append("Grounding Sources")
    seen = set()
    for citation in payload["citations"]:
        key = citation.get("source_url") or citation.get("source_id")
        if key in seen:
            continue
        seen.add(key)
        lines.append(f"- {citation.get('source_id')}: {citation.get('source_url')}")
    if not seen:
        for chunk in payload["source_chunks"]:
            lines.append(f"- {chunk['source_id']}: {chunk['url']}")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Trace a developer problem through the crypto knowledge graph.")
    parser.add_argument("query")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON for IDE extensions.")
    parser.add_argument("--limit", type=int, default=8, help="Maximum seed nodes to retrieve before graph expansion.")
    args = parser.parse_args()
    payload = node_trace(GraphStore(), args.query, limit=args.limit)
    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        print(format_trace(payload))


if __name__ == "__main__":
    main()
