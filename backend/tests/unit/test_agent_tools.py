from __future__ import annotations

from pathlib import Path

from app.agent.tools.builtin import (
    calculator,
    edit_file,
    list_dir,
    read_file,
    search_in_files,
    write_file,
)
from app.services.workspace_service import WorkspaceService


def test_agent_file_tools(tmp_path: Path):
    ws_id = "test-agent-ws"
    # Ensure clean workspace dir
    ws_dir = WorkspaceService.get_workspace_dir(ws_id)
    ws_dir.mkdir(parents=True, exist_ok=True)

    # 1. Write file
    res_w = write_file(ws_id, "test.txt", "line 1\nline 2\nline 3\n")
    assert "Successfully wrote" in res_w
    assert (ws_dir / "test.txt").exists()

    # 2. Read file with line range
    content_full = read_file(ws_id, "test.txt")
    assert "line 1\nline 2\nline 3" in content_full

    content_subset = read_file(ws_id, "test.txt", start_line=2, end_line=3)
    assert content_subset == "line 2\nline 3"

    # 3. Edit file
    res_e = edit_file(ws_id, "test.txt", target="line 2", replacement="modified line 2")
    assert "Successfully replaced" in res_e
    assert "modified line 2" in (ws_dir / "test.txt").read_text()

    # 4. List dir
    entries = list_dir(ws_id, ".")
    names = [e["name"] for e in entries]
    assert "test.txt" in names

    # 5. Search in files
    matches = search_in_files(ws_id, "modified")
    assert len(matches) == 1
    assert matches[0]["path"] == "test.txt"
    assert matches[0]["line"] == 2


def test_agent_calculator():
    assert calculator("2 + 2") == "4.0"
    assert calculator("10 * (5 - 2)") == "30.0"
    assert calculator("2 ** 8") == "256.0"
    err = calculator("import os; os.system('ls')")
    assert "Math evaluation error" in err
