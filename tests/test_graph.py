from ckg.search import search_nodes
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
