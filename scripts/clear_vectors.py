#!/usr/bin/env python3
"""
Clear all vectors from the SentinelAI ChromaDB collection.

Run from repo root:
  python scripts/clear_vectors.py

Or from anywhere with PYTHONPATH set to repo root:
  python scripts/clear_vectors.py
"""
import os
import sys

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from backend.database.vector_store import ThreatVectorStore


def main() -> None:
    store = ThreatVectorStore()
    removed = store.delete_all()
    print(f"Cleared {removed} entries from ChromaDB.")


if __name__ == "__main__":
    main()
