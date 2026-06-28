from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .store import DATA_DIR, ROOT


NETWORK_CONDITIONS_PATH = DATA_DIR / "network_conditions.json"


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def freshness_seconds(policy: str) -> int:
    return {
        "hourly": 60 * 60,
        "daily": 24 * 60 * 60,
        "weekly": 7 * 24 * 60 * 60,
        "monthly": 30 * 24 * 60 * 60,
    }.get(policy, 24 * 60 * 60)


def annotate_condition(condition: dict[str, Any], now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    item = dict(condition)
    updated_at = parse_time(item.get("last_updated_at"))
    age_seconds = int((now - updated_at).total_seconds()) if updated_at else None
    max_age = freshness_seconds(item.get("freshness_policy", "daily"))

    if updated_at is None:
        freshness_status = "unknown"
    elif age_seconds is not None and age_seconds > max_age:
        freshness_status = "stale"
    elif item.get("status") == "live":
        freshness_status = "live"
    else:
        freshness_status = "cached"

    item["age_seconds"] = age_seconds
    item["freshness_status"] = freshness_status
    item["max_age_seconds"] = max_age
    return item


def load_conditions(path: Path = NETWORK_CONDITIONS_PATH) -> dict[str, Any]:
    payload = load_json(path)
    conditions = [annotate_condition(condition) for condition in payload.get("conditions", [])]
    return {
        "generated_at": payload.get("generated_at"),
        "conditions": conditions,
        "summary": {
            "conditions": len(conditions),
            "live": sum(1 for item in conditions if item["freshness_status"] == "live"),
            "cached": sum(1 for item in conditions if item["freshness_status"] == "cached"),
            "stale": sum(1 for item in conditions if item["freshness_status"] == "stale"),
        },
    }


def conditions_for_node(node_id: str, payload: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    payload = payload or load_conditions()
    return [condition for condition in payload["conditions"] if condition["node_id"] == node_id]


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect cached live network conditions.")
    parser.add_argument("node_id", nargs="?")
    args = parser.parse_args()
    payload = load_conditions()
    result: Any = conditions_for_node(args.node_id, payload) if args.node_id else payload
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
