from __future__ import annotations

import argparse
import fnmatch
import json
import re
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from xml.etree import ElementTree

from . import ingest
from .store import DATA_DIR, ROOT


CONFIG_PATH = DATA_DIR / "upstream_feeds.json"
SOURCES_PATH = DATA_DIR / "sources.json"
DISCOVERY_REPORT_PATH = DATA_DIR / "source_discovery_report.json"
USER_AGENT = "crypto-developer-knowledge-graph-source-discovery/0.1"


@dataclass(frozen=True)
class SourceCandidate:
    id: str
    title: str
    url: str
    authority: str
    protocols: list[str]
    freshness_policy: str
    local_path: str
    discovered_by: str
    upstream_kind: str

    def as_source(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "url": self.url,
            "authority": self.authority,
            "protocols": self.protocols,
            "freshness_policy": self.freshness_policy,
            "local_path": self.local_path,
            "discovered_by": self.discovered_by,
            "upstream_kind": self.upstream_kind,
        }


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "a":
            return
        for key, value in attrs:
            if key == "href" and value:
                self.links.append(value)


def load_json(path: Path, default: Any | None = None) -> Any:
    if not path.exists():
        return default
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def fetch_text(url: str) -> str:
    request = Request(url, headers={"user-agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def fetch_json(url: str) -> Any:
    return json.loads(fetch_text(url))


def slugify(value: str) -> str:
    parsed = urlparse(value)
    seed = f"{parsed.netloc}-{parsed.path}".strip("-/") or value
    seed = re.sub(r"\.(html|md|pdf|mediawiki)$", "", seed, flags=re.IGNORECASE)
    return re.sub(r"[^a-z0-9]+", "-", seed.lower()).strip("-")


def title_from_url(url: str) -> str:
    path = urlparse(url).path.strip("/")
    if not path:
        return urlparse(url).netloc
    return path.rsplit("/", 1)[-1].replace("-", " ").replace("_", " ").title()


def candidate_from_url(feed: dict[str, Any], url: str, title: str | None = None, protocols: list[str] | None = None) -> SourceCandidate:
    source_id = slugify(url)
    return SourceCandidate(
        id=source_id,
        title=title or title_from_url(url),
        url=url,
        authority=feed.get("authority", "unknown"),
        protocols=protocols if protocols is not None else feed.get("protocols", []),
        freshness_policy=feed.get("freshness_policy", "monthly"),
        local_path=f"docs/sources/discovered/{source_id}.md",
        discovered_by=feed["id"],
        upstream_kind=feed["kind"],
    )


def static_candidates(feed: dict[str, Any]) -> list[SourceCandidate]:
    candidates: list[SourceCandidate] = []
    for item in feed.get("urls", []):
        candidates.append(candidate_from_url(feed, item["url"], title=item.get("title"), protocols=item.get("protocols")))
    for url in feed.get("seed_urls", []):
        candidates.append(candidate_from_url(feed, url))
    return candidates


def eip_candidates(feed: dict[str, Any], fetch: bool) -> list[SourceCandidate]:
    if not fetch:
        return static_candidates(feed)
    html = fetch_text(feed["url"])
    parser = LinkParser()
    parser.feed(html)
    urls = []
    for link in parser.links:
        if re.search(r"/EIPS/eip-\d+$", link):
            urls.append(link if link.startswith("http") else f"https://eips.ethereum.org{link}")
    return [candidate_from_url(feed, url) for url in sorted(set(urls))]


def discourse_candidates(feed: dict[str, Any], fetch: bool) -> list[SourceCandidate]:
    if not fetch:
        return static_candidates(feed)
    payload = fetch_json(feed["url"])
    base = feed["url"].split("/latest.json", 1)[0]
    candidates = []
    for topic in payload.get("topic_list", {}).get("topics", []):
        slug = topic.get("slug")
        topic_id = topic.get("id")
        if not slug or not topic_id:
            continue
        candidates.append(candidate_from_url(feed, f"{base}/t/{slug}/{topic_id}", title=topic.get("title")))
    return candidates


def sitemap_candidates(feed: dict[str, Any], fetch: bool) -> list[SourceCandidate]:
    if not fetch:
        return static_candidates(feed)
    candidates: list[SourceCandidate] = []
    for sitemap in feed.get("sitemaps", []):
        text = fetch_text(sitemap["url"])
        root = ElementTree.fromstring(text)
        urls = [item.text or "" for item in root.findall(".//{*}loc")]
        include = [value.lower() for value in sitemap.get("include", [])]
        for url in urls:
            if include and not any(token in url.lower() for token in include):
                continue
            candidates.append(candidate_from_url(feed, url, protocols=sitemap.get("protocols", feed.get("protocols", []))))
    return candidates


def github_tree_candidates(feed: dict[str, Any], fetch: bool) -> list[SourceCandidate]:
    if not fetch:
        return static_candidates(feed)
    candidates: list[SourceCandidate] = []
    for repo_config in feed.get("repositories", []):
        repo = repo_config["repo"]
        branch = repo_config.get("branch", "master")
        payload = fetch_json(f"https://api.github.com/repos/{repo}/git/trees/{branch}?recursive=1")
        for item in payload.get("tree", []):
            path = item.get("path", "")
            if item.get("type") != "blob":
                continue
            if not any(fnmatch.fnmatch(path, pattern) for pattern in repo_config.get("include", [])):
                continue
            url = f"https://github.com/{repo}/blob/{branch}/{path}"
            candidates.append(candidate_from_url(feed, url, title=path.rsplit("/", 1)[-1], protocols=repo_config.get("protocols", [])))
    return candidates


def discover_candidates(config: dict[str, Any], fetch: bool = False) -> list[dict[str, Any]]:
    handlers = {
        "static_urls": static_candidates,
        "eip_index": eip_candidates,
        "discourse_latest": discourse_candidates,
        "sitemap": sitemap_candidates,
        "github_tree": github_tree_candidates,
    }
    candidates: list[SourceCandidate] = []
    for feed in config.get("feeds", []):
        handler = handlers.get(feed.get("kind"))
        if not handler:
            continue
        candidates.extend(handler(feed, fetch) if feed.get("kind") != "static_urls" else handler(feed))

    deduped: dict[str, dict[str, Any]] = {}
    for candidate in candidates:
        deduped.setdefault(candidate.url, candidate.as_source())
    return sorted(deduped.values(), key=lambda item: (item["discovered_by"], item["id"]))


def upsert_sources(existing: list[dict[str, Any]], candidates: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    existing_by_url = {source["url"]: source for source in existing}
    existing_ids = {source["id"] for source in existing}
    merged = list(existing)
    added: list[dict[str, Any]] = []
    for candidate in candidates:
        if candidate["url"] in existing_by_url:
            continue
        item = dict(candidate)
        base_id = item["id"]
        suffix = 2
        while item["id"] in existing_ids:
            item["id"] = f"{base_id}-{suffix}"
            suffix += 1
        existing_ids.add(item["id"])
        merged.append(item)
        added.append(item)
    return merged, added


def run(
    fetch: bool = False,
    write_report: bool = True,
    promote: bool = False,
    fetch_docs: bool = False,
    rebuild_citations: bool = False,
) -> dict[str, Any]:
    config = load_json(CONFIG_PATH, {"feeds": []})
    existing = load_json(SOURCES_PATH, [])
    candidates = discover_candidates(config, fetch=fetch)
    merged, added = upsert_sources(existing, candidates)
    fetched_docs: list[str] = []
    ingest_stats: dict[str, int] | None = None

    if fetch_docs:
        fetch_targets = added if promote else candidates
        fetched_docs = [str(path.relative_to(ROOT)) for path in ingest.fetch_sources(fetch_targets, force=False)]

    if promote and added:
        write_json(SOURCES_PATH, merged)

    if rebuild_citations:
        ingest_stats = ingest.run(fetch=False)

    report = {
        "feeds": len(config.get("feeds", [])),
        "candidates": len(candidates),
        "existing_sources": len(existing),
        "new_sources": len(added),
        "promoted": bool(promote),
        "fetched_docs": fetched_docs,
        "rebuilt_citations": ingest_stats,
        "added": added,
    }
    if write_report:
        write_json(DISCOVERY_REPORT_PATH, report)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Discover upstream source candidates for the crypto developer knowledge graph.")
    parser.add_argument("--fetch", action="store_true", help="Fetch live upstream indexes instead of using configured seed URLs.")
    parser.add_argument("--no-write-report", action="store_true", help="Do not write data/source_discovery_report.json.")
    parser.add_argument("--promote", action="store_true", help="Append newly discovered sources to data/sources.json.")
    parser.add_argument("--fetch-docs", action="store_true", help="Fetch discovered source documents into docs/sources/discovered.")
    parser.add_argument("--rebuild-citations", action="store_true", help="Rebuild data/chunks.json and data/citations.json after promotion/fetching.")
    args = parser.parse_args()
    print(json.dumps(
        run(
            fetch=args.fetch,
            write_report=not args.no_write_report,
            promote=args.promote,
            fetch_docs=args.fetch_docs,
            rebuild_citations=args.rebuild_citations,
        ),
        indent=2,
    ))


if __name__ == "__main__":
    main()
