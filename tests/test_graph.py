from ckg.search import search_chunks, search_nodes
from ckg.store import GraphStore


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
