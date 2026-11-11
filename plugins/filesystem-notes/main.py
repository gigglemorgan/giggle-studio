from pathlib import Path

NOTES_DIR = Path("./data/notes")
NOTES_DIR.mkdir(parents=True, exist_ok=True)


def save_note(title: str, content: str) -> str:
    """Saves note to scoped notes directory."""
    file_path = NOTES_DIR / f"{title}.md"
    file_path.write_text(content, encoding="utf-8")
    return f"Note '{title}' saved successfully."


def list_notes() -> list[str]:
    """Lists all note filenames."""
    return [p.stem for p in NOTES_DIR.glob("*.md")]
