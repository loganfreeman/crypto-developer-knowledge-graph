import pytest

from ckg.api import MAX_LIMIT, execute_api_query, execute_get, execute_post, graph_payload, node_context, parse_limit
from ckg.search import search_chunks, search_nodes
from ckg.pipeline import build_exports, strict_node_kind
from ckg.release_rig import run_release_rig
from ckg.store import GraphStore
from ckg.trace import format_trace, node_trace


def test_graph_validates():
    assert GraphStore().validate() == []


def test_wallet_path_includes_balance_api():
    goal = GraphStore().goal("build-wallet")
    assert goal is not None
    assert any(api["id"] == "eth-get-balance" for api in goal["apis"])


def test_search_finds_wallet_task():
    results = search_nodes(GraphStore(), "wallet")
    assert results
    assert any(result["id"] == "wallet-building" for result in results)


def test_citations_resolve_to_chunks():
    store = GraphStore()
    citations = store.node_citations("ethereum")
    assert citations
    assert citations[0]["source"]
    assert citations[0]["chunk"]


def test_chunk_search_finds_rpc_docs():
    results = search_chunks(GraphStore(), "signed transaction")
    assert any(result["source_id"] == "ethereum-json-rpc" for result in results)


def test_focused_horizon_includes_implementation_edges():
    horizon = GraphStore().horizon("cross-chain-state-verification")
    assert any(edge["type"] == "IMPLEMENTED_BY" for edge in horizon["relationships"])
    assert any(node["id"] == "merkle-proof-verification-pattern" for node in horizon["nodes"])


def test_trust_report_surfaces_uncited_production_nodes():
    report = GraphStore().trust_report
    assert report["summary"]["uncited_production_nodes"] > 0
    assert "bls12-381" in report["uncited_nodes"]


def test_network_conditions_attach_to_staking_nodes():
    store = GraphStore()
    conditions = store.node_network_conditions("polkadot-staking-nominations")
    assert conditions
    assert conditions[0]["freshness_status"] in {"cached", "live", "stale"}
    assert any(param["key"] == "active_validator_set_size" for param in conditions[0]["parameters"])


def test_live_metadata_attaches_to_serialization_and_abi_nodes():
    store = GraphStore()
    substrate_targets = store.node_live_metadata("substrate-scale-byte-template")
    erc20_targets = store.node_live_metadata("erc20-transfer-calldata-template")
    assert substrate_targets
    assert substrate_targets[0]["kind"] == "registry_track"
    assert erc20_targets
    assert erc20_targets[0]["kind"] == "contract_abi"
    assert any(check["key"] == "transfer_selector" for check in erc20_targets[0]["checks"])


def test_pipeline_maps_legacy_types_to_strict_node_kinds():
    store = GraphStore()
    assert strict_node_kind(store.nodes["hashing"]) == "Primitive"
    assert strict_node_kind(store.nodes["ethereum"]) == "Protocol"
    assert strict_node_kind(store.nodes["offline-transaction-signer"]) == "Action"
    assert strict_node_kind(store.nodes["replay-domain-guardrail"]) == "Vulnerability"


def test_pipeline_exports_database_rows(tmp_path):
    stats = build_exports(export_dir=tmp_path)
    assert stats["nodes"] == len(GraphStore().nodes)
    assert stats["edges"] == len(GraphStore().edges)
    assert stats["code_snippets"] > 0
    assert stats["document_chunks"] > 0
    assert stats["live_metadata_targets"] > 0
    assert stats["live_metadata_checks"] > 0
    assert (tmp_path / "nodes.jsonl").exists()
    assert (tmp_path / "edges.jsonl").exists()
    assert (tmp_path / "code_snippets.jsonl").exists()
    assert (tmp_path / "document_chunks.jsonl").exists()
    assert (tmp_path / "live_metadata_targets.jsonl").exists()
    assert (tmp_path / "live_metadata_checks.jsonl").exists()


def test_release_rig_extracts_structural_payloads_offline(tmp_path):
    report = run_release_rig(snapshot_path=tmp_path / "snapshots.json")
    assert report["summary"]["payloads"] >= 3
    assert report["summary"]["incomplete"] == 0
    payload_ids = {payload["payload_id"] for payload in report["payloads"]}
    assert "substrate-extrinsic-scale-payload" in payload_ids
    assert "solana-versioned-message-payload" in payload_ids
    assert "helios-consensus-ssz-payload" in payload_ids
    substrate = next(payload for payload in report["payloads"] if payload["payload_id"] == "substrate-extrinsic-scale-payload")
    assert substrate["serialization"] == "SCALE"
    assert substrate["structural_hash"]


def test_release_rig_flags_removed_structural_signals(tmp_path):
    snapshot_path = tmp_path / "snapshots.json"
    snapshot_path.write_text(
        """
{
  "payloads": {
    "substrate::substrate-extrinsic-scale-payload": {
      "release": "previous",
      "structural_hash": "previous-hash",
      "signals": [
        { "name": "UncheckedExtrinsic", "present": true },
        { "name": "RemovedField", "present": true }
      ]
    }
  }
}
""".strip()
        + "\n",
        encoding="utf-8",
    )
    report = run_release_rig(snapshot_path=snapshot_path)
    substrate_diff = next(diff for diff in report["diffs"] if diff["payload_id"] == "substrate-extrinsic-scale-payload")
    assert substrate_diff["breaking"] is True
    assert "RemovedField" in substrate_diff["removed_signals"]


def test_api_graph_payload_is_frontend_and_curl_ready():
    payload = graph_payload(GraphStore())
    assert payload["nodes"]
    assert payload["relationships"]
    assert payload["goals"]
    assert payload["network_conditions"]["conditions"]
    assert payload["live_metadata"]["targets"]
    assert payload["serialization_sandboxes"]["sandboxes"]
    assert any(item["codec"] == "type-alignment" for item in payload["serialization_sandboxes"]["sandboxes"])


def test_api_node_context_and_query_trace():
    store = GraphStore()
    context = node_context(store, "substrate-scale-byte-template")
    assert context["node"]["id"] == "substrate-scale-byte-template"
    assert context["horizon"]["relationships"]
    assert context["citations"]
    assert context["live_metadata"]
    assert context["serialization_sandboxes"]

    trace = execute_api_query(store, {"type": "trace", "q": "Filecoin CBOR tuple misalignment", "limit": 4})
    assert trace["nodes"]
    assert trace["relationships"]
    assert trace["code_solutions"]


def test_api_query_limits_are_bounded_and_validated():
    assert parse_limit("3") == 3
    assert parse_limit(str(MAX_LIMIT + 100)) == MAX_LIMIT
    with pytest.raises(ValueError, match="at least 1"):
        parse_limit("0")
    with pytest.raises(ValueError, match="integer"):
        parse_limit("many")


def test_get_route_dispatch_handles_core_api_paths():
    health = execute_get("api/health", {})
    assert health["ok"] is True
    assert health["nodes"] == len(GraphStore().nodes)

    search = execute_get("api/search", {"q": ["wallet"], "limit": ["2"]})
    assert search["query"] == "wallet"
    assert len(search["results"]) <= 2

    node = execute_get("api/nodes/ethereum", {})
    assert node["id"] == "ethereum"

    context = execute_get("api/nodes/substrate-scale-byte-template/context", {})
    assert context["node"]["id"] == "substrate-scale-byte-template"

    goal = execute_get("api/goals/build-wallet", {})
    assert goal["id"] == "build-wallet"


def test_reload_route_refreshes_global_store():
    payload = execute_post("/api/reload", {})
    assert payload["ok"] is True
    assert payload["reloaded"] is True
    assert payload["nodes"] == len(GraphStore().nodes)


def test_trace_builder_endpoint_returns_frontend_path_contract():
    payload = execute_post("/api/trace-builder", {"q": "Go concurrent Turnkey signer", "goal_id": "build-offline-signer", "limit": 5})
    assert payload["id"] == "api-trace-builder"
    assert payload["prompt"] == "Go concurrent Turnkey signer"
    assert payload["focusNodeId"]
    assert payload["highlightedNodeIds"]
    assert payload["architecturalSteps"]
    assert payload["trace"]["nodes"]


def test_trace_returns_contextual_mapping_and_code_solutions():
    payload = node_trace(GraphStore(), "Filecoin CBOR tuple misalignment")
    node_ids = {node["id"] for node in payload["nodes"]}
    assert "filecoin-cbor-byte-template" in node_ids
    assert "dag-cbor" in node_ids
    assert "bad-signature-diagnostic" in node_ids
    assert payload["relationships"]
    assert payload["code_solutions"]
    formatted = format_trace(payload)
    assert "Contextual Graph Mapping" in formatted
    assert "Code Solutions" in formatted
