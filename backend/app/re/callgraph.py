from __future__ import annotations

from collections import defaultdict
from typing import Any

from app.re.backends.base import FunctionAnalysis


class CallGraphBuilder:
    """Constructs directed call graphs and determines bottom-up topological analysis order."""

    @classmethod
    def build_graph(cls, functions: list[FunctionAnalysis]) -> dict[str, Any]:
        nodes = [{"id": f.name, "address": hex(f.address), "size": f.size} for f in functions]
        func_names = {f.name for f in functions}
        addr_map = {hex(f.address).lower(): f.name for f in functions}

        edges: list[dict[str, str]] = []
        adj: dict[str, set[str]] = defaultdict(set)
        in_degree: dict[str, int] = {f.name: 0 for f in functions}

        for f in functions:
            for callee in f.callees:
                # Match callee by name or address
                target = None
                if callee in func_names:
                    target = callee
                elif callee.lower() in addr_map:
                    target = addr_map[callee.lower()]

                if target and target != f.name:
                    if target not in adj[f.name]:
                        adj[f.name].add(target)
                        edges.append({"source": f.name, "target": target})
                        in_degree[target] = in_degree.get(target, 0) + 1

        # Determine bottom-up order (leaf functions with out-degree 0 first)
        out_degree = {f.name: len(adj[f.name]) for f in functions}
        leaves = [name for name, deg in out_degree.items() if deg == 0]

        return {
            "nodes": nodes,
            "edges": edges,
            "leaves": leaves,
            "total_functions": len(functions),
            "total_calls": len(edges),
        }
