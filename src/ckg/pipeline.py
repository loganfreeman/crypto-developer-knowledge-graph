from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

from . import ingest
from .store import DATA_DIR, ROOT, GraphStore


EXPORT_DIR = DATA_DIR / "exports"
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536

NODE_KIND_BY_LEGACY_TYPE = {
    "CryptographicPrimitive": "Primitive",
    "ConsensusAlgorithm": "Primitive",
    "SerializationFormat": "Primitive",
    "Protocol": "Protocol",
    "Chain": "Protocol",
    "TokenStandard": "Protocol",
    "SmartContractStandard": "Protocol",
    "Runtime": "Protocol",
    "ProofSystem": "Protocol",
    "SDK": "Protocol",
    "Library": "Protocol",
    "Interface": "Protocol",
    "DeveloperTask": "Action",
    "RPCMethod": "Action",
    "RESTEndpoint": "Action",
    "WalletFeature": "Action",
    "ExampleApp": "Action",
    "CodeSnippet": "Action",
    "PayloadTemplate": "Action",
    "SigningIntegration": "Action",
    "ImplementationPattern": "Action",
    "ExecutionSandbox": "Action",
    "Concept": "Action",
    "Diagnostic": "Action",
    "NetworkCondition": "Action",
    "NetworkParameter": "Action",
    "LiveDataProvider": "Action",
    "SecurityRisk": "Vulnerability",
    "SecurityGuardrail": "Vulnerability",
}


def strict_node_kind(node: dict[str, Any]) -> str:
    legacy_type = node.get("type")
    if legacy_type not in NODE_KIND_BY_LEGACY_TYPE:
        raise ValueError(f"{node.get('id')}: unmapped node type {legacy_type}")
    return NODE_KIND_BY_LEGACY_TYPE[legacy_type]


def ordered_unique(values: Iterable[str | None]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def embedding_input_for_node(node: dict[str, Any], citations: list[dict[str, Any]] | None = None) -> str:
    parts = [
        node.get("label", ""),
        node.get("type", ""),
        node.get("summary", ""),
        "tags: " + ", ".join(node.get("tags", [])),
        "contexts: " + ", ".join(node.get("contexts", [])),
        "layers: " + ", ".join(node.get("layers", [])),
    ]
    if node.get("implementation_notes"):
        parts.append("implementation notes: " + " ".join(node["implementation_notes"]))
    if citations:
        parts.append("source claims: " + " ".join(citation.get("claim", "") for citation in citations))
    return "\n".join(part for part in parts if part).strip()


def theoretical_documentation_for_node(node: dict[str, Any], chunks_by_id: dict[str, dict[str, Any]], citations: list[dict[str, Any]]) -> str:
    cited_chunks = [chunks_by_id.get(citation.get("chunk_id")) for citation in citations]
    texts = [chunk["text"] for chunk in cited_chunks if chunk]
    if not texts:
        texts = [node.get("summary", "")]
    return "\n\n".join(texts).strip()


def hash_embedding(text: str, dimensions: int = EMBEDDING_DIMENSIONS) -> list[float]:
    """Deterministic local vector for pipeline smoke tests, not semantic search quality."""
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    values: list[float] = []
    counter = 0
    while len(values) < dimensions:
        block = hashlib.sha256(digest + counter.to_bytes(4, "big")).digest()
        values.extend(((byte / 127.5) - 1.0) for byte in block)
        counter += 1
    return values[:dimensions]


def maybe_embedding(text: str, mode: str) -> list[float] | None:
    if mode == "hash":
        return hash_embedding(text)
    return None


def node_row(
    node: dict[str, Any],
    chunks_by_id: dict[str, dict[str, Any]],
    citations_by_node: dict[str, list[dict[str, Any]]],
    embedding_mode: str,
) -> dict[str, Any]:
    citations = citations_by_node.get(node["id"], [])
    embedding_input = embedding_input_for_node(node, citations)
    theoretical_documentation = theoretical_documentation_for_node(node, chunks_by_id, citations)
    documentation_input = "\n".join([node.get("label", ""), theoretical_documentation]).strip()
    metadata = {
        "legacy_type": node.get("type"),
        "display_group": node.get("display_group"),
        "language": node.get("language"),
        "implementation_notes": node.get("implementation_notes", []),
        "embedding_input": embedding_input,
        "documentation_embedding_input": documentation_input,
    }
    return {
        "id": node["id"],
        "kind": strict_node_kind(node),
        "label": node["label"],
        "summary": node["summary"],
        "theoretical_documentation": theoretical_documentation,
        "metadata": {key: value for key, value in metadata.items() if value not in (None, [], "")},
        "tags": node.get("tags", []),
        "contexts": node.get("contexts", []),
        "layers": node.get("layers", []),
        "source_ids": ordered_unique(citation.get("source_id") for citation in citations),
        "embedding_model": EMBEDDING_MODEL,
        "embedding": maybe_embedding(embedding_input, embedding_mode),
        "documentation_embedding": maybe_embedding(documentation_input, embedding_mode),
    }


def edge_row(edge: Any) -> dict[str, Any]:
    return {
        "source_node_id": edge.source,
        "target_node_id": edge.target,
        "kind": edge.type,
        "context": edge.context,
        "layer": edge.layer,
        "confidence": edge.confidence or "medium",
        "developer_note": edge.developer_note,
        "metadata": {"evidence": edge.evidence or []},
    }


def snippet_rows_for_node(node: dict[str, Any], embedding_mode: str) -> list[dict[str, Any]]:
    snippets: list[dict[str, Any]] = []
    if node.get("code"):
        snippets.append(
            {
                "id": f"{node['id']}--primary",
                "node_id": node["id"],
                "title": node["label"],
                "language": node.get("language", "text"),
                "summary": node.get("summary", ""),
                "code": node["code"],
            }
        )
    for index, example in enumerate(node.get("multi_language_examples", []), start=1):
        language_slug = example.get("language", "text").lower().replace(" ", "-")
        snippets.append(
            {
                "id": f"{node['id']}--{language_slug}-{index}",
                "node_id": node["id"],
                "title": example.get("title") or node["label"],
                "language": example.get("language", "text"),
                "summary": example.get("summary", node.get("summary", "")),
                "code": example["code"],
            }
        )
    for snippet in snippets:
        embedding_input = "\n".join([snippet["title"], snippet["language"], snippet["summary"], snippet["code"]]).strip()
        snippet.update(
            {
                "runtime": None,
                "package_hints": [],
                "security_notes": [],
                "source_ids": node.get("citations", []),
                "metadata": {"embedding_input": embedding_input},
                "embedding_model": EMBEDDING_MODEL,
                "embedding": maybe_embedding(embedding_input, embedding_mode),
            }
        )
    return snippets


def document_chunk_row(chunk: dict[str, Any], citations_by_chunk: dict[str, list[dict[str, Any]]], embedding_mode: str) -> dict[str, Any]:
    citations = citations_by_chunk.get(chunk["id"], [])
    node_ids = ordered_unique(citation.get("node_id") for citation in citations)
    embedding_input = "\n".join([chunk["title"], chunk["text"]]).strip()
    return {
        "id": chunk["id"],
        "node_id": node_ids[0] if len(node_ids) == 1 else None,
        "source_id": chunk["source_id"],
        "source_url": chunk["url"],
        "title": chunk["title"],
        "chunk_text": chunk["text"],
        "claim": " ".join(citation.get("claim", "") for citation in citations).strip() or None,
        "metadata": {
            "ordinal": chunk.get("ordinal"),
            "node_ids": node_ids,
            "embedding_input": embedding_input,
        },
        "embedding_model": EMBEDDING_MODEL,
        "embedding": maybe_embedding(embedding_input, embedding_mode),
    }


def live_metadata_target_row(target: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": target["id"],
        "node_id": target["node_id"],
        "kind": target["kind"],
        "network": target["network"],
        "status": target.get("status", "cached"),
        "freshness_policy": target.get("freshness_policy", "daily"),
        "last_checked_at": target.get("last_checked_at"),
        "provider_id": target["provider_id"],
        "provider_url": target.get("provider_url"),
        "provider_url_env": target.get("provider_url_env"),
        "chain_id": target.get("chain_id"),
        "contract_address": target.get("contract_address"),
        "registry": target.get("registry", {}),
        "abi": target.get("abi", []),
        "source_ids": target.get("source_ids", []),
        "metadata": {
            "checks": len(target.get("checks", [])),
        },
    }


def live_metadata_check_rows(target: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "target_id": target["id"],
            "key": check["key"],
            "label": check["label"],
            "expected": check.get("expected"),
            "observed": check.get("observed"),
            "verification": check.get("verification", "unverified"),
            "rpc_method": check.get("rpc_method"),
            "developer_note": check.get("developer_note"),
            "checked_at": target.get("last_checked_at"),
            "metadata": {},
        }
        for check in target.get("checks", [])
    ]


def group_by(items: Iterable[dict[str, Any]], key: str) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        value = item.get(key)
        if value:
            grouped.setdefault(value, []).append(item)
    return grouped


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, separators=(",", ":")) + "\n")
            count += 1
    return count


def build_exports(export_dir: Path = EXPORT_DIR, embedding_mode: str = "none") -> dict[str, int]:
    if embedding_mode not in {"none", "hash"}:
        raise ValueError("embedding_mode must be 'none' or 'hash'")
    store = GraphStore()
    citations = list(store.citations.values())
    chunks = list(store.chunks.values())
    chunks_by_id = store.chunks
    citations_by_node = group_by(citations, "node_id")
    citations_by_chunk = group_by(citations, "chunk_id")

    node_rows = [
        node_row(node, chunks_by_id, citations_by_node, embedding_mode)
        for node in store.nodes.values()
    ]
    edge_rows = [edge_row(edge) for edge in store.edges]
    snippet_rows = [
        snippet
        for node in store.nodes.values()
        for snippet in snippet_rows_for_node(node, embedding_mode)
    ]
    chunk_rows = [document_chunk_row(chunk, citations_by_chunk, embedding_mode) for chunk in chunks]
    live_targets = store.live_metadata.get("targets", [])
    live_target_rows = [live_metadata_target_row(target) for target in live_targets]
    live_check_rows = [row for target in live_targets for row in live_metadata_check_rows(target)]

    return {
        "nodes": write_jsonl(export_dir / "nodes.jsonl", node_rows),
        "edges": write_jsonl(export_dir / "edges.jsonl", edge_rows),
        "code_snippets": write_jsonl(export_dir / "code_snippets.jsonl", snippet_rows),
        "document_chunks": write_jsonl(export_dir / "document_chunks.jsonl", chunk_rows),
        "live_metadata_targets": write_jsonl(export_dir / "live_metadata_targets.jsonl", live_target_rows),
        "live_metadata_checks": write_jsonl(export_dir / "live_metadata_checks.jsonl", live_check_rows),
    }


def run(fetch: bool = False, force: bool = False, export_dir: Path = EXPORT_DIR, embedding_mode: str = "none") -> dict[str, Any]:
    ingest_stats = ingest.run(fetch=fetch, force=force)
    export_stats = build_exports(export_dir=export_dir, embedding_mode=embedding_mode)
    try:
        display_export_dir = str(export_dir.relative_to(ROOT))
    except ValueError:
        display_export_dir = str(export_dir)
    return {"ingest": ingest_stats, "exports": export_stats, "export_dir": display_export_dir}


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the crypto developer knowledge graph ingestion pipeline.")
    parser.add_argument("--fetch", action="store_true", help="Fetch registered source URLs before chunking.")
    parser.add_argument("--force", action="store_true", help="Overwrite cached source documents when fetching.")
    parser.add_argument("--export-dir", type=Path, default=EXPORT_DIR, help="Directory for database-ready JSONL exports.")
    parser.add_argument(
        "--embedding-mode",
        choices=["none", "hash"],
        default="none",
        help="Use 'none' for null vectors or 'hash' for deterministic non-semantic test vectors.",
    )
    args = parser.parse_args()
    stats = run(fetch=args.fetch, force=args.force, export_dir=args.export_dir, embedding_mode=args.embedding_mode)
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
