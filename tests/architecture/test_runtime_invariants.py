"""Runtime invariants AGENTS.md states for the whole tree.

Imports happen at module level (AGENTS §12): a function-level import hides a
dependency and usually papers over a cycle. Any genuinely necessary exception
is listed here with its reason; today there are none.
"""

from __future__ import annotations

import ast
from pathlib import Path

SRC = Path(__file__).resolve().parents[2] / "src"

# (file relative to src, function name) -> the reason the exception is allowed.
ALLOWED_FUNCTION_LEVEL_IMPORTS: dict[tuple[str, str], str] = {}


def test_every_import_sits_at_module_level() -> None:
    offending: list[str] = []
    for path in sorted(SRC.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for item in ast.walk(node):
                if isinstance(item, (ast.Import, ast.ImportFrom)):
                    key = (str(path.relative_to(SRC)), node.name)
                    if key not in ALLOWED_FUNCTION_LEVEL_IMPORTS:
                        offending.append(f"{key[0]}:{item.lineno} in {node.name}()")
    assert not offending, "Function-level imports without a listed reason:\n" + "\n".join(offending)
