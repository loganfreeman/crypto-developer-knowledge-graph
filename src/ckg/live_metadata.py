from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

from .network_conditions import freshness_seconds, parse_time
from .store import DATA_DIR


LIVE_METADATA_PATH = DATA_DIR / "live_metadata.json"


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def rpc_url_for_target(target: dict[str, Any]) -> str | None:
    env_name = target.get("provider_url_env")
    if env_name:
        return os.environ.get(env_name)
    return target.get("provider_url")


def annotate_target(target: dict[str, Any], now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    item = dict(target)
    checked_at = parse_time(item.get("last_checked_at"))
    age_seconds = int((now - checked_at).total_seconds()) if checked_at else None
    max_age = freshness_seconds(item.get("freshness_policy", "daily"))

    if checked_at is None:
        freshness_status = "unknown"
    elif age_seconds is not None and age_seconds > max_age:
        freshness_status = "stale"
    elif item.get("status") == "live":
        freshness_status = "live"
    else:
        freshness_status = "cached"

    checks = item.get("checks", [])
    item["age_seconds"] = age_seconds
    item["freshness_status"] = freshness_status
    item["max_age_seconds"] = max_age
    item["summary"] = {
        "checks": len(checks),
        "verified": sum(1 for check in checks if check.get("verification") == "verified"),
        "unverified": sum(1 for check in checks if check.get("verification") == "unverified"),
        "failed": sum(1 for check in checks if check.get("verification") == "failed"),
    }
    return item


def load_live_metadata(path: Path = LIVE_METADATA_PATH) -> dict[str, Any]:
    payload = load_json(path)
    targets = [annotate_target(target) for target in payload.get("targets", [])]
    return {
        "generated_at": payload.get("generated_at"),
        "targets": targets,
        "summary": {
            "targets": len(targets),
            "verified_checks": sum(item["summary"]["verified"] for item in targets),
            "unverified_checks": sum(item["summary"]["unverified"] for item in targets),
            "failed_checks": sum(item["summary"]["failed"] for item in targets),
            "stale": sum(1 for item in targets if item["freshness_status"] == "stale"),
        },
    }


def targets_for_node(node_id: str, payload: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    payload = payload or load_live_metadata()
    return [target for target in payload["targets"] if target["node_id"] == node_id]


def json_rpc(url: str, method: str, params: list[Any] | None = None, timeout: int = 20) -> Any:
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}).encode("utf-8")
    request = Request(url, data=body, headers={"content-type": "application/json", "user-agent": "crypto-developer-knowledge-graph/0.1"})
    with urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if "error" in payload:
        raise RuntimeError(f"{method}: {payload['error']}")
    return payload.get("result")


def result_digest(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        return {
            "present": bool(value and value != "0x"),
            "byte_length": max((len(value) - 2) // 2, 0) if value.startswith("0x") else len(value),
            "prefix": value[:18],
        }
    if isinstance(value, dict):
        return {"present": True, "keys": sorted(value)[:12]}
    if isinstance(value, list):
        return {"present": True, "items": len(value)}
    return {"present": value is not None, "value": value}


def refresh_target(target: dict[str, Any]) -> dict[str, Any]:
    url = rpc_url_for_target(target)
    if not url:
        item = dict(target)
        item["status"] = "missing_provider"
        return item

    item = json.loads(json.dumps(target))
    for check in item.get("checks", []):
        method = check.get("rpc_method")
        if not method or method.startswith("local_"):
            continue
        params: list[Any] = []
        if method == "eth_getCode":
            params = [item["contract_address"], "latest"]
        try:
            result = json_rpc(url, method, params)
            digest = result_digest(result)
            check["observed"] = digest
            check["verification"] = "verified" if digest.get("present") == check.get("expected") else "failed"
        except Exception as exc:  # pragma: no cover - network/provider behavior
            check["observed"] = {"error": str(exc)}
            check["verification"] = "failed"
    item["status"] = "live"
    item["last_checked_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return item


def refresh_targets(path: Path = LIVE_METADATA_PATH, node_id: str | None = None, write: bool = False) -> dict[str, Any]:
    payload = load_json(path)
    refreshed = []
    for target in payload.get("targets", []):
        if node_id and target.get("node_id") != node_id:
            refreshed.append(target)
            continue
        refreshed.append(refresh_target(target))
    result = {
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "targets": refreshed,
    }
    if write:
        write_json(path, result)
    return {
        "generated_at": result["generated_at"],
        "targets": [annotate_target(target) for target in refreshed if not node_id or target.get("node_id") == node_id],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect or refresh live registry and ABI metadata checks.")
    parser.add_argument("node_id", nargs="?")
    parser.add_argument("--refresh", action="store_true", help="Call configured RPC endpoints and update observed checks in memory.")
    parser.add_argument("--write", action="store_true", help="Persist refreshed results to data/live_metadata.json.")
    args = parser.parse_args()

    if args.refresh:
        payload: Any = refresh_targets(node_id=args.node_id, write=args.write)
    else:
        payload = targets_for_node(args.node_id) if args.node_id else load_live_metadata()
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
