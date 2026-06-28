from __future__ import annotations

import argparse
import fnmatch
import hashlib
import io
import json
import os
import re
import tarfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.request import Request, urlopen

from .store import DATA_DIR


CONFIG_PATH = DATA_DIR / "protocol_release_sources.json"
CACHE_DIR = DATA_DIR / "release_cache"
SNAPSHOT_PATH = DATA_DIR / "protocol_release_snapshots.json"
REPORT_PATH = DATA_DIR / "protocol_release_report.json"
USER_AGENT = "crypto-developer-knowledge-graph-release-rig/0.1"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path, default: Any | None = None) -> Any:
    if not path.exists():
        return default
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def github_json(path: str, token: str | None = None) -> Any:
    headers = {
        "accept": "application/vnd.github+json",
        "user-agent": USER_AGENT,
    }
    if token:
        headers["authorization"] = f"Bearer {token}"
    request = Request(f"https://api.github.com{path}", headers=headers)
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def github_bytes(url: str, token: str | None = None) -> bytes:
    headers = {"user-agent": USER_AGENT}
    if token:
        headers["authorization"] = f"Bearer {token}"
    request = Request(url, headers=headers)
    with urlopen(request, timeout=60) as response:
        return response.read()


def release_cache_path(source_id: str) -> Path:
    return CACHE_DIR / f"{source_id}-releases.json"


def tarball_cache_path(source_id: str, tag_name: str) -> Path:
    safe_tag = re.sub(r"[^A-Za-z0-9_.-]+", "-", tag_name)
    return CACHE_DIR / f"{source_id}-{safe_tag}.tar.gz"


def configured_sources(config_path: Path = CONFIG_PATH) -> list[dict[str, Any]]:
    payload = load_json(config_path, {"sources": []})
    return payload.get("sources", [])


def fetch_releases(source: dict[str, Any], refresh: bool = False, token: str | None = None) -> list[dict[str, Any]]:
    cache_path = release_cache_path(source["id"])
    if not refresh:
        cached = load_json(cache_path)
        if cached:
            return cached

    repo = source["repository"]
    limit = int(source.get("release_limit", 3))
    try:
        releases = github_json(f"/repos/{repo}/releases?per_page={limit}", token=token)
        if not releases:
            releases = github_json(f"/repos/{repo}/tags?per_page={limit}", token=token)
        normalized = [
            {
                "tag_name": item.get("tag_name") or item.get("name"),
                "name": item.get("name") or item.get("tag_name"),
                "published_at": item.get("published_at") or item.get("created_at"),
                "tarball_url": item.get("tarball_url") or f"https://api.github.com/repos/{repo}/tarball/{item.get('name')}",
                "html_url": item.get("html_url"),
            }
            for item in releases[:limit]
            if item.get("tag_name") or item.get("name")
        ]
        write_json(cache_path, normalized)
        return normalized
    except Exception:
        cached = load_json(cache_path)
        if cached:
            return cached
        seed = source.get("seed_release")
        return [seed] if seed else []


def source_file_matches(path: str, patterns: Iterable[str]) -> bool:
    normalized = path.lstrip("/")
    return any(
        fnmatch.fnmatch(normalized, pattern) or fnmatch.fnmatch(f"root/{normalized}", pattern)
        for pattern in patterns
    )


def seed_files(source: dict[str, Any], release: dict[str, Any]) -> list[dict[str, str]]:
    if release.get("files"):
        return release["files"]
    seed = source.get("seed_release", {})
    if release.get("tag_name") == seed.get("tag_name"):
        return seed.get("files", [])
    return []


def tarball_files(source: dict[str, Any], release: dict[str, Any], refresh: bool, token: str | None) -> list[dict[str, str]]:
    tarball_url = release.get("tarball_url")
    tag_name = release.get("tag_name")
    if not tarball_url or not tag_name:
        return []

    cache_path = tarball_cache_path(source["id"], tag_name)
    if refresh or not cache_path.exists():
        try:
            payload = github_bytes(tarball_url, token=token)
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_bytes(payload)
        except Exception:
            return []

    files: list[dict[str, str]] = []
    try:
        with tarfile.open(fileobj=io.BytesIO(cache_path.read_bytes()), mode="r:gz") as archive:
            for member in archive.getmembers():
                if not member.isfile() or not source_file_matches(member.name, source.get("file_patterns", [])):
                    continue
                extracted = archive.extractfile(member)
                if not extracted:
                    continue
                text = extracted.read().decode("utf-8", errors="replace")
                files.append({"path": member.name, "text": text})
    except (tarfile.TarError, OSError):
        return []
    return files


def release_files(source: dict[str, Any], release: dict[str, Any], refresh: bool, token: str | None) -> list[dict[str, str]]:
    files = tarball_files(source, release, refresh=refresh, token=token)
    if files:
        return files
    return [
        item
        for item in seed_files(source, release)
        if source_file_matches(item.get("path", ""), source.get("file_patterns", []))
    ]


def find_signal(files: list[dict[str, str]], signal: dict[str, Any]) -> dict[str, Any]:
    pattern = signal["pattern"]
    regex = re.compile(pattern)
    matches: list[dict[str, Any]] = []
    for file_item in files:
        for line_number, line in enumerate(file_item["text"].splitlines(), start=1):
            if not regex.search(line):
                continue
            matches.append(
                {
                    "path": file_item["path"],
                    "line": line_number,
                    "text": line.strip()[:240],
                }
            )
            break
    return {
        "name": signal["name"],
        "pattern": pattern,
        "required": bool(signal.get("required", False)),
        "present": bool(matches),
        "matches": matches[:5],
    }


def structural_hash(payload: dict[str, Any]) -> str:
    digest_input = {
        "payload_id": payload["payload_id"],
        "serialization": payload["serialization"],
        "signals": [
            {
                "name": signal["name"],
                "present": signal["present"],
                "paths": [match["path"] for match in signal.get("matches", [])],
            }
            for signal in payload["signals"]
        ],
    }
    encoded = json.dumps(digest_input, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def build_payload(source: dict[str, Any], release: dict[str, Any], payload_spec: dict[str, Any], files: list[dict[str, str]]) -> dict[str, Any]:
    signals = [find_signal(files, signal) for signal in payload_spec.get("signals", [])]
    missing_required = [signal["name"] for signal in signals if signal["required"] and not signal["present"]]
    payload = {
        "source_id": source["id"],
        "repository": source["repository"],
        "release": release.get("tag_name"),
        "published_at": release.get("published_at"),
        "payload_id": payload_spec["id"],
        "node_id": payload_spec["node_id"],
        "serialization": payload_spec["serialization"],
        "files_scanned": len(files),
        "signals": signals,
        "missing_required": missing_required,
        "status": "complete" if not missing_required else "incomplete",
    }
    payload["structural_hash"] = structural_hash(payload)
    return payload


def previous_payload(snapshot: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any] | None:
    key = f"{payload['source_id']}::{payload['payload_id']}"
    return snapshot.get("payloads", {}).get(key)


def diff_payload(previous: dict[str, Any] | None, current: dict[str, Any]) -> dict[str, Any]:
    current_present = {signal["name"] for signal in current["signals"] if signal["present"]}
    previous_present = {
        signal["name"]
        for signal in (previous or {}).get("signals", [])
        if signal.get("present")
    }
    added = sorted(current_present - previous_present)
    removed = sorted(previous_present - current_present)
    hash_changed = bool(previous and previous.get("structural_hash") != current.get("structural_hash"))
    missing_required = current.get("missing_required", [])
    breaking = bool(removed or missing_required)
    return {
        "payload_id": current["payload_id"],
        "source_id": current["source_id"],
        "release": current["release"],
        "previous_release": previous.get("release") if previous else None,
        "hash_changed": hash_changed,
        "added_signals": added,
        "removed_signals": removed,
        "missing_required": missing_required,
        "breaking": breaking,
        "severity": "breaking" if breaking else ("changed" if hash_changed or added else "unchanged"),
    }


def snapshot_from_payloads(payloads: list[dict[str, Any]]) -> dict[str, Any]:
    latest: dict[str, Any] = {}
    for payload in payloads:
        key = f"{payload['source_id']}::{payload['payload_id']}"
        if key not in latest:
            latest[key] = payload
    return {"generated_at": utc_now(), "payloads": latest}


def run_release_rig(
    config_path: Path = CONFIG_PATH,
    snapshot_path: Path = SNAPSHOT_PATH,
    refresh: bool = False,
    write_snapshot: bool = False,
    write_report: bool = False,
    token: str | None = None,
) -> dict[str, Any]:
    sources = configured_sources(config_path)
    snapshot = load_json(snapshot_path, {"payloads": {}})
    payloads: list[dict[str, Any]] = []
    diffs: list[dict[str, Any]] = []

    for source in sources:
        releases = fetch_releases(source, refresh=refresh, token=token)
        for release in releases[: int(source.get("release_limit", 3))]:
            files = release_files(source, release, refresh=refresh, token=token)
            for payload_spec in source.get("payloads", []):
                payload = build_payload(source, release, payload_spec, files)
                payloads.append(payload)
                previous = previous_payload(snapshot, payload)
                diffs.append(diff_payload(previous, payload))

    report = {
        "generated_at": utc_now(),
        "mode": "refresh" if refresh else "offline",
        "sources": len(sources),
        "payloads": payloads,
        "diffs": diffs,
        "summary": {
            "payloads": len(payloads),
            "breaking": sum(1 for item in diffs if item["breaking"]),
            "changed": sum(1 for item in diffs if item["severity"] == "changed"),
            "unchanged": sum(1 for item in diffs if item["severity"] == "unchanged"),
            "incomplete": sum(1 for item in payloads if item["status"] == "incomplete"),
        },
    }

    if write_snapshot:
        write_json(snapshot_path, snapshot_from_payloads(payloads))
    if write_report:
        write_json(REPORT_PATH, report)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Crawl protocol releases and extract structural serialization payloads.")
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
    parser.add_argument("--snapshot", type=Path, default=SNAPSHOT_PATH)
    parser.add_argument("--refresh", action="store_true", help="Fetch GitHub releases and tarballs before scanning.")
    parser.add_argument("--write-snapshot", action="store_true", help="Persist latest structural hashes for future diffing.")
    parser.add_argument("--write-report", action="store_true", help="Write data/protocol_release_report.json.")
    parser.add_argument("--token-env", default="GITHUB_TOKEN", help="Environment variable containing an optional GitHub token.")
    args = parser.parse_args()

    token = os.environ.get(args.token_env) if args.token_env else None
    report = run_release_rig(
        config_path=args.config,
        snapshot_path=args.snapshot,
        refresh=args.refresh,
        write_snapshot=args.write_snapshot,
        write_report=args.write_report,
        token=token,
    )
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
