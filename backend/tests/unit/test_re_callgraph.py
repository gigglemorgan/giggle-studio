from __future__ import annotations

from app.re.backends.base import FunctionAnalysis
from app.re.callgraph import CallGraphBuilder


def test_callgraph_construction():
    fn_leaf_1 = FunctionAnalysis(name="sub_leaf_1", address=0x1000, size=16, hash="h1", callees=[])
    fn_leaf_2 = FunctionAnalysis(name="sub_leaf_2", address=0x1020, size=16, hash="h2", callees=[])
    fn_mid = FunctionAnalysis(
        name="sub_mid", address=0x1040, size=32, hash="h3", callees=["sub_leaf_1"]
    )
    fn_main = FunctionAnalysis(
        name="main", address=0x1080, size=64, hash="h4", callees=["sub_mid", "sub_leaf_2"]
    )

    graph = CallGraphBuilder.build_graph([fn_leaf_1, fn_leaf_2, fn_mid, fn_main])

    assert graph["total_functions"] == 4
    assert graph["total_calls"] == 3

    # Leaf functions (no outgoing calls) must be sub_leaf_1 and sub_leaf_2
    assert "sub_leaf_1" in graph["leaves"]
    assert "sub_leaf_2" in graph["leaves"]
    assert "main" not in graph["leaves"]
