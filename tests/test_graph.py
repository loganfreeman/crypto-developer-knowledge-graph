from ckg.search import search_chunks, search_nodes
from ckg.pipeline import build_exports, strict_node_kind
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
