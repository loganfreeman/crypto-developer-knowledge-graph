from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from .store import ROOT


DATA_DIR = ROOT / "data"
SOURCES_PATH = DATA_DIR / "sources.json"
CHUNKS_PATH = DATA_DIR / "chunks.json"
CITATIONS_PATH = DATA_DIR / "citations.json"
NODES_PATH = DATA_DIR / "nodes.json"


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "nav", "footer"}:
            self.skip_depth += 1
        if tag in {"h1", "h2", "h3"}:
            self.parts.append(f"\n\n# ")
        elif tag in {"p", "li", "pre", "blockquote"}:
            self.parts.append("\n\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "nav", "footer"} and self.skip_depth:
            self.skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self.skip_depth:
            value = data.strip()
            if value:
                self.parts.append(value)
                self.parts.append(" ")

    def text(self) -> str:
        return normalize_text("".join(self.parts))


@dataclass(frozen=True)
class Chunk:
    id: str
    source_id: str
    title: str
    url: str
    ordinal: int
    text: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "source_id": self.source_id,
            "title": self.title,
            "url": self.url,
            "ordinal": self.ordinal,
            "text": self.text,
        }


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def load_sources() -> list[dict[str, Any]]:
    return load_json(SOURCES_PATH)


def fetch_sources(sources: list[dict[str, Any]], force: bool = False) -> list[Path]:
    written: list[Path] = []
    for source in sources:
        path = ROOT / source["local_path"]
        if path.exists() and not force:
            continue
        request = Request(source["url"], headers={"user-agent": "crypto-developer-knowledge-graph/0.1"})
        with urlopen(request, timeout=20) as response:
            body = response.read().decode("utf-8", errors="replace")
            content_type = response.headers.get("content-type", "")
        if "html" in content_type:
            body = html_to_text(body)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")
        written.append(path)
    return written


def html_to_text(html: str) -> str:
    parser = TextExtractor()
    parser.feed(html)
    return parser.text()


def normalize_text(text: str) -> str:
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_sections(text: str) -> list[str]:
    sections: list[str] = []
    current: list[str] = []
    for line in normalize_text(text).splitlines():
        if line.startswith("#") and current:
            sections.append("\n".join(current).strip())
            current = [line]
        else:
            current.append(line)
    if current:
        sections.append("\n".join(current).strip())
    return [section for section in sections if section]


def chunk_text(text: str, max_chars: int = 900) -> list[str]:
    chunks: list[str] = []
    for section in split_sections(text):
        if len(section) <= max_chars:
            chunks.append(section)
            continue
        paragraphs = section.split("\n\n")
        current = ""
        for paragraph in paragraphs:
            candidate = f"{current}\n\n{paragraph}".strip()
            if len(candidate) > max_chars and current:
                chunks.append(current)
                current = paragraph
            else:
                current = candidate
        if current:
            chunks.append(current)
    return chunks


def build_chunks(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    for source in sources:
        path = ROOT / source["local_path"]
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        for ordinal, chunk in enumerate(chunk_text(text), start=1):
            chunks.append(
                Chunk(
                    id=f"{source['id']}#chunk-{ordinal}",
                    source_id=source["id"],
                    title=source["title"],
                    url=source["url"],
                    ordinal=ordinal,
                    text=chunk,
                ).as_dict()
            )
    return chunks


def source_lookup(sources: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for source in sources:
        lookup[source["id"]] = source
        lookup[source["url"]] = source
    return lookup


def normalize_anchor(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def best_chunk_id(source: dict[str, Any], chunks: list[dict[str, Any]]) -> str | None:
    source_chunks = [chunk for chunk in chunks if chunk["source_id"] == source["id"]]
    if not source_chunks:
        return None

    fragment = urlparse(source["url"]).fragment
    if fragment:
        needle = normalize_anchor(fragment)
        for chunk in source_chunks:
            if needle in normalize_anchor(chunk["text"]):
                return chunk["id"]

    return source_chunks[0]["id"]


def build_citations(nodes: list[dict[str, Any]], sources: list[dict[str, Any]], chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sources_by_key = source_lookup(sources)
    citations: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    for node in nodes:
        for raw_ref in node.get("citations", []):
            source = sources_by_key.get(raw_ref)
            if not source:
                continue
            key = (node["id"], source["id"])
            if key in seen:
                continue
            seen.add(key)
            citations.append(
                {
                    "id": f"{node['id']}::{source['id']}",
                    "node_id": node["id"],
                    "source_id": source["id"],
                    "source_url": source["url"],
                    "chunk_id": best_chunk_id(source, chunks),
                    "claim": node["summary"],
                    "status": "seeded",
                }
            )
    return citations


def run(fetch: bool = False, force: bool = False) -> dict[str, int]:
    sources = load_sources()
    if fetch:
        fetch_sources(sources, force)
    chunks = build_chunks(sources)
    nodes = load_json(NODES_PATH)
    citations = build_citations(nodes, sources, chunks)
    write_json(CHUNKS_PATH, chunks)
    write_json(CITATIONS_PATH, citations)
    return {"sources": len(sources), "chunks": len(chunks), "citations": len(citations)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build citation chunks for the crypto developer knowledge graph.")
    parser.add_argument("--fetch", action="store_true", help="Fetch source URLs into docs/sources before chunking.")
    parser.add_argument("--force", action="store_true", help="Overwrite cached source documents when fetching.")
    args = parser.parse_args()
    stats = run(fetch=args.fetch, force=args.force)
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
