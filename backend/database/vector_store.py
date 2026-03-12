import hashlib
import math
import os
import json
from typing import Any, Dict, List, Optional, Tuple

try:
    import chromadb  # type: ignore
except ImportError:  # pragma: no cover - optional dependency at this stage
    chromadb = None


def fingerprint_text(text: str) -> str:
    """
    Deterministic key for an event's canonical text.

    Used for exact cache hits and as the primary id in Chroma.
    """
    normalized = " ".join(text.split()).strip().lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def embed_text(text: str, dims: int = 256) -> List[float]:
    """
    Lightweight, deterministic embedding for near-duplicate matching.

    This is NOT a semantic embedding. It's a fast hashing-based vector that
    provides reasonable behavior for near-identical strings (small edits).
    """
    vec = [0.0] * dims
    s = " ".join(text.split()).strip().lower()
    if not s:
        return vec

    # Character 3-grams hashing trick
    padded = f"  {s}  "
    for i in range(len(padded) - 2):
        gram = padded[i : i + 3]
        h = int(hashlib.md5(gram.encode("utf-8")).hexdigest(), 16)
        idx = h % dims
        vec[idx] += 1.0

    # L2 normalize
    norm = math.sqrt(sum(v * v for v in vec))
    if norm > 0:
        vec = [v / norm for v in vec]
    return vec


class ThreatVectorStore:
    """
    Thin wrapper around ChromaDB for SentinelAI.

    In early stages this is intentionally minimal; we can evolve it into
    a full-featured abstraction once the schema stabilizes.
    """

    def __init__(
        self,
        collection_name: str = "sentinelai_threats",
        persist_path: Optional[str] = None,
    ) -> None:
        if chromadb is None:
            raise RuntimeError(
                "chromadb is not installed. Add it to backend/requirements.txt and pip install."
            )

        # Persist by default so repeat-offender cache survives restarts.
        if persist_path is None:
            persist_path = os.environ.get(
                "SENTINELAI_CHROMA_PATH",
                os.path.join(os.path.dirname(__file__), ".chroma"),
            )

        client = chromadb.PersistentClient(path=persist_path)
        self.collection = client.get_or_create_collection(collection_name)

    def add_events(
        self,
        ids: List[str],
        embeddings: List[List[float]],
        metadatas: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        self.collection.add(ids=ids, embeddings=embeddings, metadatas=metadatas)

    def upsert_event(
        self,
        *,
        event_id: str,
        embedding: List[float],
        metadata: Dict[str, Any],
    ) -> None:
        # Chroma supports upsert via add; if id exists, it will raise unless we delete first.
        # For this stage, do a best-effort delete then add.
        try:
            self.collection.delete(ids=[event_id])
        except Exception:
            pass
        self.collection.add(ids=[event_id], embeddings=[embedding], metadatas=[metadata])

    def get_metadata_by_id(self, event_id: str) -> Optional[Dict[str, Any]]:
        res = self.collection.get(ids=[event_id], include=["metadatas"])
        metadatas = res.get("metadatas") or []
        if not metadatas:
            return None
        return metadatas[0]

    def search_similar(
        self, query_embedding: List[float], n_results: int = 5
    ) -> Dict[str, Any]:
        return self.collection.query(query_embeddings=[query_embedding], n_results=n_results)

    def find_cached_alert(
        self,
        normalized_text: str,
        *,
        near_duplicate_threshold: float = 0.08,
    ) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """
        Optimize-first cache lookup.

        Returns:
            (is_repeat_offender, cached_alert_dict_or_none)
        """
        key = fingerprint_text(normalized_text)

        # 1) Exact hit by fingerprint
        meta = self.get_metadata_by_id(key)
        if meta:
            alert_json = meta.get("alert_json")
            if isinstance(alert_json, str) and alert_json.strip():
                try:
                    parsed = json.loads(alert_json)
                    if isinstance(parsed, dict):
                        return True, parsed
                except Exception:
                    pass

        # 2) Near-duplicate hit by embedding similarity
        emb = embed_text(normalized_text)
        try:
            res = self.collection.query(
                query_embeddings=[emb],
                n_results=1,
                include=["metadatas", "distances"],
            )
        except ValueError as e:
            # Some Chroma versions raise if "ids" ends up in the include set
            # internally. Fall back to defaults.
            if "got ids" not in str(e):
                raise
            res = self.collection.query(query_embeddings=[emb], n_results=1)
        ids = (res.get("ids") or [[]])[0]
        distances = (res.get("distances") or [[]])[0]
        metadatas = (res.get("metadatas") or [[]])[0]

        if not ids or not distances or not metadatas:
            return False, None

        best_distance = distances[0]
        best_meta = metadatas[0]
        if best_distance is not None and best_distance <= near_duplicate_threshold:
            alert_json = best_meta.get("alert_json")
            if isinstance(alert_json, str) and alert_json.strip():
                try:
                    parsed = json.loads(alert_json)
                    if isinstance(parsed, dict):
                        return True, parsed
                except Exception:
                    pass

        return False, None
