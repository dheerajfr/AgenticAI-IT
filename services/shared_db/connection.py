import sqlite3
import os

# Allow overriding DB path via environment variable (useful for container volumes)
DB_PATH = os.environ.get("DATABASE_PATH", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "source.db")))

def get_db_path() -> str:
    return DB_PATH

def get_db() -> sqlite3.Connection:
    """Returns a new connection to the shared SQLite database."""
    conn = sqlite3.connect(DB_PATH)
    # Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

