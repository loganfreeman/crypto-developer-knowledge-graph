from __future__ import annotations

import argparse
import hashlib
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .store import ROOT, GraphStore


DATA_DIR = ROOT / "data"
TRUST_REPORT_PATH = DATA_DIR / "trust_report.json"
DEFAULT_VERIFIED_AT = "2026-06-27"
DEFAULT_FRESHNESS_DAYS = 90
FAST_MOVING_TYPES = {
    "Library",
    "PayloadTemplate",
    "SigningIntegration",
    "SDK",
    "RPCMethod",
    "RESTEndpoint",
    "ExecutionSandbox",
}
PRODUCTION_TYPES = {
    "CryptographicPrimitive",
    "ProofSystem",
    "Runtime",
    "PayloadTemplate",
    "SigningIntegration",
    "ImplementationPattern",
    "SecurityGuardrail",
    "SerializationFormat",
    "Diagnostic",
}


def sha256_file(path: Path) -> str | None:
    if not path.exists():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None


def freshness_days(source: dict[str, Any]) -> int:
    policy = source.get("freshness_policy")
    if isinstance(policy, int):
        return policy
    if isinstance(policy, str):
        mapping = {
            "daily": 1,
            "weekly": 7,
            "monthly": 30,
            "quarterly": 90,
            "yearly": 365,
        }
        if policy in mapping:
            return mapping[policy]
        if policy.endswith("d") and policy[:-1].isdigit():
            return int(policy[:-1])
    return DEFAULT_FRESHNESS_DAYS


def node_status(node: dict[str, Any], cited_node_ids: set[str]) -> str:
    if node["id"] in cited_node_ids or node.get("citations"):
        return "verified"
    if node["type"] in PRODUCTION_TYPES:
        return "needs_citation"
    return "seeded"


def build_report(store: GraphStore, today: date | None = None) -> dict[str, Any]:
    today = today or datetime.now(timezone.utc).date()
    cited_node_ids = {citation["node_id"] for citation in store.citations.values()}
    source_items = []
    stale_sources = []
    missing_sources = []

    for source in store.sources.values():
        local_path = ROOT / source["local_path"]
        verified_at = parse_date(source.get("last_verified_at")) or parse_date(DEFAULT_VERIFIED_AT)
        max_age = freshness_days(source)
        age_days = (today - verified_at).days if verified_at else None
        status = "healthy"
        if not local_path.exists():
            status = "missing"
            missing_sources.append(source["id"])
        elif age_days is not None and age_days > max_age:
            status = "stale"
            stale_sources.append(source["id"])

        current_hash = sha256_file(local_path)
        source_items.append(
            {
                "id": source["id"],
                "title": source["title"],
                "url": source["url"],
                "local_path": source["local_path"],
                "status": status,
                "authority": source.get("authority", "unknown"),
                "freshness_days": max_age,
                "last_verified_at": source.get("last_verified_at", DEFAULT_VERIFIED_AT),
                "age_days": age_days,
                "current_hash": current_hash,
                "stored_hash": source.get("source_hash"),
                "changed": bool(source.get("source_hash") and current_hash and source["source_hash"] != current_hash),
            }
        )

    changed_sources = [source["id"] for source in source_items if source["changed"]]
    source_to_nodes: dict[str, list[str]] = {}
    for citation in store.citations.values():
        source_to_nodes.setdefault(citation["source_id"], []).append(citation["node_id"])

    impacted_nodes = sorted(
        {
            node_id
            for source_id in stale_sources + changed_sources + missing_sources
            for node_id in source_to_nodes.get(source_id, [])
        }
    )
    uncited_nodes = sorted(
        node_id
        for node_id, node in store.nodes.items()
        if node_status(node, cited_node_ids) == "needs_citation"
    )
    fast_moving_uncited = sorted(
        node_id
        for node_id in uncited_nodes
        if store.nodes[node_id]["type"] in FAST_MOVING_TYPES
    )

    node_items = []
    for node in store.nodes.values():
        status = node_status(node, cited_node_ids)
        if node["id"] in impacted_nodes:
            status = "source_attention"
        node_items.append(
            {
                "id": node["id"],
                "label": node["label"],
                "type": node["type"],
                "status": status,
                "citation_count": sum(1 for citation in store.citations.values() if citation["node_id"] == node["id"]),
                "staleness_risk": "high" if node["type"] in FAST_MOVING_TYPES else "medium" if node["type"] in PRODUCTION_TYPES else "low",
            }
        )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "nodes": len(store.nodes),
            "sources": len(store.sources),
            "citations": len(store.citations),
            "uncited_production_nodes": len(uncited_nodes),
            "fast_moving_uncited_nodes": len(fast_moving_uncited),
            "stale_sources": len(stale_sources),
            "changed_sources": len(changed_sources),
            "missing_sources": len(missing_sources),
            "impacted_nodes": len(impacted_nodes),
        },
        "sources": source_items,
        "nodes": node_items,
        "uncited_nodes": uncited_nodes,
        "fast_moving_uncited_nodes": fast_moving_uncited,
        "stale_sources": stale_sources,
        "changed_sources": changed_sources,
        "missing_sources": missing_sources,
        "impacted_nodes": impacted_nodes,
    }


def write_report(report: dict[str, Any], path: Path = TRUST_REPORT_PATH) -> None:
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def run(write: bool = True) -> dict[str, Any]:
    report = build_report(GraphStore())
    if write:
        write_report(report)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate trust and freshness reports for the knowledge graph.")
    parser.add_argument("--no-write", action="store_true", help="Print the report without updating data/trust_report.json.")
    args = parser.parse_args()
    report = run(write=not args.no_write)
    print(json.dumps(report["summary"], indent=2))


if __name__ == "__main__":
    main()
