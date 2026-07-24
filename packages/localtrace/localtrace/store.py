"""Append-only JSONL storage: the durable source of truth.

One JSON object per line, files named ``traces-YYYY-MM-DD.jsonl`` (UTC date)
under ``log_dir``. Rotation happens by date automatically and by size when
``max_file_mb`` is set; size-rotated files get a numeric suffix
(``traces-2026-07-21.001.jsonl``) and are optionally gzipped.
``retention_days`` prunes files older than N days.

The writer is thread-safe and opens the file per batch, so readers (DuckDB,
tail -f, another process) never contend with a long-lived handle.
"""
from __future__ import annotations

import gzip
import json
import logging
import re
import shutil
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable, Iterator, Optional

logger = logging.getLogger("localtrace")

_FILE_RE = re.compile(r"^traces-(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.jsonl(\.gz)?$")


class JSONLStore:
    """Thread-safe, append-only writer of one-JSON-object-per-line trace files."""

    def __init__(
        self,
        log_dir,
        max_file_mb: Optional[float] = None,
        retention_days: Optional[int] = None,
        gzip_rotated: bool = False,
    ) -> None:
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.max_file_mb = max_file_mb
        self.retention_days = retention_days
        self.gzip_rotated = gzip_rotated
        self._lock = threading.Lock()
        self._current_day: Optional[str] = None
        self._closed = False
        self._apply_retention()

    # -- write path ----------------------------------------------------------

    def write_lines(self, lines: Iterable[str]) -> None:
        """Append pre-serialized JSON lines. Safe to call from any thread."""
        lines = [line for line in lines if line]
        if not lines or self._closed:
            return
        with self._lock:
            path = self._prepare_active_file()
            with open(path, "a", encoding="utf-8", newline="") as fh:
                for line in lines:
                    fh.write(line)
                    fh.write("\n")

    def write_records(self, records: Iterable[dict]) -> None:
        """Convenience: serialize dicts and append them."""
        self.write_lines(json.dumps(r, ensure_ascii=False, default=str) for r in records)

    def close(self) -> None:
        self._closed = True

    # -- read helpers (the real read path is localtrace.query / DuckDB) -------

    def files(self) -> list[Path]:
        """All trace files in the log directory, oldest first."""
        if not self.log_dir.exists():
            return []
        return sorted(p for p in self.log_dir.iterdir() if _FILE_RE.match(p.name))

    def iter_records(self) -> Iterator[dict]:
        """Yield every stored record across all files (including gzipped ones)."""
        for path in self.files():
            opener = gzip.open if path.name.endswith(".gz") else open
            with opener(path, "rt", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if line:
                        yield json.loads(line)

    # -- rotation / retention --------------------------------------------------

    @staticmethod
    def _today() -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def active_path(self) -> Path:
        return self.log_dir / f"traces-{self._today()}.jsonl"

    def _prepare_active_file(self) -> Path:
        day = self._today()
        if day != self._current_day:
            self._current_day = day
            self._apply_retention()
            if self.gzip_rotated:
                self._gzip_older_days(day)
        path = self.log_dir / f"traces-{day}.jsonl"
        if (
            self.max_file_mb
            and path.exists()
            and path.stat().st_size >= self.max_file_mb * 1024 * 1024
        ):
            self._rotate_by_size(path, day)
        return path

    def _rotate_by_size(self, path: Path, day: str) -> None:
        n = 1
        while True:
            rotated = self.log_dir / f"traces-{day}.{n:03d}.jsonl"
            if not rotated.exists() and not Path(str(rotated) + ".gz").exists():
                break
            n += 1
        try:
            path.rename(rotated)
        except OSError:
            logger.exception("localtrace: could not rotate %s", path)
            return
        if self.gzip_rotated:
            self._gzip_file(rotated)

    def _gzip_file(self, path: Path) -> None:
        gz_path = Path(str(path) + ".gz")
        try:
            with open(path, "rb") as src, gzip.open(gz_path, "wb") as dst:
                shutil.copyfileobj(src, dst)
            path.unlink()
        except OSError:
            logger.exception("localtrace: failed to gzip %s", path)

    def _gzip_older_days(self, today: str) -> None:
        for path in self.files():
            match = _FILE_RE.match(path.name)
            if match and not match.group(3) and match.group(1) < today:
                self._gzip_file(path)

    def _apply_retention(self) -> None:
        if not self.retention_days:
            return
        cutoff = (
            datetime.now(timezone.utc) - timedelta(days=self.retention_days)
        ).strftime("%Y-%m-%d")
        for path in self.files():
            match = _FILE_RE.match(path.name)
            if match and match.group(1) < cutoff:
                try:
                    path.unlink()
                    logger.info("localtrace: deleted expired log %s", path.name)
                except OSError:
                    logger.warning("localtrace: could not delete expired log %s", path)
