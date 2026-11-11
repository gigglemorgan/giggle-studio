from __future__ import annotations

import ast
import operator
from typing import Any

from app.agent.registry import RiskLevel, ToolRegistry
from app.sandbox.paths import secure_path_resolve
from app.sandbox.runner import SandboxRunner
from app.services.workspace_service import WorkspaceService


@ToolRegistry.register(
    name="read_file",
    description="Reads content of a file within the workspace with optional line range.",
    risk_level=RiskLevel.SAFE,
    parameters={
        "type": "object",
        "properties": {
            "workspace_id": {"type": "string", "description": "Target workspace identifier"},
            "path": {"type": "string", "description": "Relative file path"},
            "start_line": {"type": "integer", "description": "Optional 1-based start line"},
            "end_line": {"type": "integer", "description": "Optional 1-based end line"},
        },
        "required": ["workspace_id", "path"],
    },
)
def read_file(
    workspace_id: str,
    path: str,
    start_line: int | None = None,
    end_line: int | None = None,
) -> str:
    content = WorkspaceService.read_file(workspace_id, path)
    if start_line is not None or end_line is not None:
        lines = content.splitlines()
        start = (start_line - 1) if start_line and start_line > 0 else 0
        end = end_line if end_line and end_line > 0 else len(lines)
        return "\n".join(lines[start:end])
    return content


@ToolRegistry.register(
    name="write_file",
    description="Writes or overwrites a file in the workspace.",
    risk_level=RiskLevel.WRITE,
    parameters={
        "type": "object",
        "properties": {
            "workspace_id": {"type": "string", "description": "Target workspace identifier"},
            "path": {"type": "string", "description": "Relative file path"},
            "content": {"type": "string", "description": "Full file content"},
        },
        "required": ["workspace_id", "path", "content"],
    },
)
def write_file(workspace_id: str, path: str, content: str) -> str:
    target = WorkspaceService.write_file(workspace_id, path, content)
    return f"Successfully wrote {len(content)} characters to {path} ({target})"


@ToolRegistry.register(
    name="edit_file",
    description="Replaces target substring with replacement in a workspace file.",
    risk_level=RiskLevel.WRITE,
    parameters={
        "type": "object",
        "properties": {
            "workspace_id": {"type": "string", "description": "Target workspace identifier"},
            "path": {"type": "string", "description": "Relative file path"},
            "target": {"type": "string", "description": "Exact text to replace"},
            "replacement": {"type": "string", "description": "Replacement text"},
        },
        "required": ["workspace_id", "path", "target", "replacement"],
    },
)
def edit_file(workspace_id: str, path: str, target: str, replacement: str) -> str:
    content = WorkspaceService.read_file(workspace_id, path)
    if target not in content:
        raise ValueError(f"Target text was not found in '{path}'.")
    new_content = content.replace(target, replacement, 1)
    WorkspaceService.write_file(workspace_id, path, new_content)
    return f"Successfully replaced target in '{path}'."


@ToolRegistry.register(
    name="list_dir",
    description="Lists files and subdirectories inside the workspace.",
    risk_level=RiskLevel.SAFE,
    parameters={
        "type": "object",
        "properties": {
            "workspace_id": {"type": "string", "description": "Target workspace identifier"},
            "path": {"type": "string", "description": "Subdirectory to list (default: '.')"},
        },
        "required": ["workspace_id"],
    },
)
def list_dir(workspace_id: str, path: str = ".") -> list[dict[str, Any]]:
    ws_dir = WorkspaceService.get_workspace_dir(workspace_id)
    target_dir = secure_path_resolve(ws_dir, path)
    if not target_dir.is_dir():
        raise ValueError(f"Path '{path}' is not a directory.")

    entries: list[dict[str, Any]] = []
    for item in sorted(target_dir.iterdir()):
        entries.append(
            {
                "name": item.name,
                "is_dir": item.is_dir(),
                "size_bytes": item.stat().st_size if item.is_file() else 0,
            }
        )
    return entries


@ToolRegistry.register(
    name="search_in_files",
    description="Searches for a text pattern across files in the workspace.",
    risk_level=RiskLevel.SAFE,
    parameters={
        "type": "object",
        "properties": {
            "workspace_id": {"type": "string", "description": "Target workspace identifier"},
            "query": {"type": "string", "description": "Text or keyword to search for"},
        },
        "required": ["workspace_id", "query"],
    },
)
def search_in_files(workspace_id: str, query: str) -> list[dict[str, Any]]:
    files = WorkspaceService.list_files(workspace_id)
    matches: list[dict[str, Any]] = []

    for f_info in files:
        f_path = f_info["path"]
        try:
            content = WorkspaceService.read_file(workspace_id, f_path)
        except Exception:
            continue
        for line_idx, line in enumerate(content.splitlines(), start=1):
            if query.lower() in line.lower():
                matches.append(
                    {
                        "path": f_path,
                        "line": line_idx,
                        "text": line.strip(),
                    }
                )
    return matches


@ToolRegistry.register(
    name="run_python",
    description="Executes a Python script securely in the Bubblewrap sandbox.",
    risk_level=RiskLevel.EXEC,
    parameters={
        "type": "object",
        "properties": {
            "workspace_id": {"type": "string", "description": "Target workspace identifier"},
            "code": {"type": "string", "description": "Python source code to execute"},
        },
        "required": ["workspace_id", "code"],
    },
)
def run_python(workspace_id: str, code: str) -> dict[str, Any]:
    ws_dir = WorkspaceService.get_workspace_dir(workspace_id)
    res = SandboxRunner.execute_python(code, cwd=ws_dir)
    return {
        "exit_code": res.exit_code,
        "stdout": res.stdout,
        "stderr": res.stderr,
        "duration_ms": round(res.duration_ms, 2),
        "timed_out": res.timed_out,
    }


@ToolRegistry.register(
    name="run_shell",
    description="Executes a shell command securely in the Bubblewrap sandbox.",
    risk_level=RiskLevel.EXEC,
    parameters={
        "type": "object",
        "properties": {
            "workspace_id": {"type": "string", "description": "Target workspace identifier"},
            "command": {"type": "string", "description": "Shell command to run in workspace"},
        },
        "required": ["workspace_id", "command"],
    },
)
def run_shell(workspace_id: str, command: str) -> dict[str, Any]:
    ws_dir = WorkspaceService.get_workspace_dir(workspace_id)
    res = SandboxRunner.execute_shell(command, cwd=ws_dir)
    return {
        "exit_code": res.exit_code,
        "stdout": res.stdout,
        "stderr": res.stderr,
        "duration_ms": round(res.duration_ms, 2),
        "timed_out": res.timed_out,
    }


# Safe AST math evaluator for calculator
_MATH_OPERATORS: dict[type[ast.AST], Any] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _eval_ast(node: ast.AST) -> float:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)
    if isinstance(node, ast.BinOp):
        op_func = _MATH_OPERATORS.get(type(node.op))
        if op_func is not None:
            left_val = _eval_ast(node.left)
            right_val = _eval_ast(node.right)
            res = op_func(left_val, right_val)
            return float(res)
    elif isinstance(node, ast.UnaryOp):
        uop_func = _MATH_OPERATORS.get(type(node.op))
        if uop_func is not None:
            op_val = _eval_ast(node.operand)
            res = uop_func(op_val)
            return float(res)
    raise ValueError(f"Unsupported math expression node: {type(node).__name__}")


@ToolRegistry.register(
    name="calculator",
    description="Safely computes mathematical expressions without running arbitrary code.",
    risk_level=RiskLevel.SAFE,
    parameters={
        "type": "object",
        "properties": {
            "expression": {"type": "string", "description": "Math expression, e.g. '2 ** 10 + 15'"},
        },
        "required": ["expression"],
    },
)
def calculator(expression: str) -> str:
    try:
        parsed = ast.parse(expression, mode="eval")
        result = _eval_ast(parsed.body)
        return str(result)
    except Exception as e:
        return f"Math evaluation error: {e}"
