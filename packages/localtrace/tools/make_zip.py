"""Build a clean, shareable source zip of this repo.

    python tools/make_zip.py

Produces dist/localtrace-<version>-src.zip containing the package source,
examples, tests, and README under a top-level localtrace-<version>/ folder --
with environments, caches, logs, and build artifacts excluded.
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))
from localtrace import __version__  # noqa: E402

EXCLUDED_DIRS = {
    ".venv", "venv", "__pycache__", ".pytest_cache", ".git",
    "dist", "build", "localtrace_logs", ".idea", ".vscode",
}
EXCLUDED_SUFFIXES = (".pyc", ".pyo", ".zip", ".whl")


def _included(path: Path) -> bool:
    if any(part in EXCLUDED_DIRS or part.endswith(".egg-info") for part in path.parts):
        return False
    return path.suffix not in EXCLUDED_SUFFIXES


def main() -> None:
    out_dir = REPO / "dist"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / f"localtrace-{__version__}-src.zip"
    prefix = f"localtrace-{__version__}"
    files = sorted(
        p for p in REPO.rglob("*")
        if p.is_file() and _included(p.relative_to(REPO))
    )
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in files:
            zf.write(path, f"{prefix}/{path.relative_to(REPO).as_posix()}")
    size_kb = out.stat().st_size / 1024
    print(f"wrote {out} ({size_kb:.0f} KB, {len(files)} files)")
    for path in files:
        print("  ", path.relative_to(REPO).as_posix())


if __name__ == "__main__":
    main()
