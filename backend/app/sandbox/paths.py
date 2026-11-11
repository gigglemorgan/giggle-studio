import os
from pathlib import Path


class PathSecurityException(Exception):
    pass


def secure_path_resolve(workspace_root: Path, relative_or_abs_path: str) -> Path:
    """Safely resolves a path relative to workspace_root, strictly preventing
    path traversal ('../') and symlink escapes outside the workspace root.
    """
    root = workspace_root.resolve()
    # Normalize path
    clean_relative = os.path.normpath(relative_or_abs_path.strip().lstrip("/"))
    target = (root / clean_relative).resolve()

    # Enforce that target is strictly a subpath of workspace root
    try:
        target.relative_to(root)
    except ValueError as e:
        raise PathSecurityException(
            f"Path traversal blocked: target '{target}' escapes workspace root '{root}'"
        ) from e

    # Check symlinks if the target or its parents exist
    curr = target
    while curr != root:
        if curr.is_symlink():
            link_target = curr.readlink()
            resolved_link = (curr.parent / link_target).resolve()
            try:
                resolved_link.relative_to(root)
            except ValueError as e:
                raise PathSecurityException(
                    f"Symlink escape blocked: '{curr}' points outside workspace to '{resolved_link}'"
                ) from e
        curr = curr.parent

    return target
