from __future__ import annotations

import re
from collections import Counter
from typing import Any

from .store import GraphStore


TOKEN_RE = re.compile(r"[a-z0-9_./:-]+")


def tokenize(text: str) -> list[str]:
    return TOKEN_RE.findall(text.lower())


def search_nodes(store: GraphStore, query: str, limit: int = 10) -> list[dict[str, Any]]:
    query_terms = tokenize(query)
    if not query_terms:
        return []

    scored: list[tuple[float, dict[str, Any]]] = []
    for node in store.nodes.values():
        haystack = " ".join(
            [
                node.get("id", ""),
                node.get("label", ""),
                node.get("type", ""),
                node.get("summary", ""),
                " ".join(node.get("tags", [])),
                " ".join(node.get("layers", [])),
                " ".join(node.get("contexts", [])),
                node.get("display_group", ""),
                " ".join(node.get("implementation_notes", [])),
            ]
        )
        terms = Counter(tokenize(haystack))
        score = 0.0
        for term in query_terms:
            if term == node.get("id", "").lower():
                score += 8
            if term in node.get("label", "").lower():
                score += 5
            score += terms.get(term, 0)
        if score:
            result = dict(node)
            result["_score"] = score
            scored.append((score, result))

    scored.sort(key=lambda item: (-item[0], item[1]["label"]))
    return [node for _, node in scored[:limit]]


def search_chunks(store: GraphStore, query: str, limit: int = 10) -> list[dict[str, Any]]:
    query_terms = tokenize(query)
    if not query_terms:
        return []

    scored: list[tuple[float, dict[str, Any]]] = []
    for chunk in store.chunks.values():
        haystack = " ".join([chunk.get("title", ""), chunk.get("source_id", ""), chunk.get("text", "")])
        terms = Counter(tokenize(haystack))
        score = 0.0
        for term in query_terms:
            if term in chunk.get("title", "").lower():
                score += 4
            score += terms.get(term, 0)
        if score:
            result = dict(chunk)
            result["_score"] = score
            scored.append((score, result))

    scored.sort(key=lambda item: (-item[0], item[1]["id"]))
    return [chunk for _, chunk in scored[:limit]]
