from typing import Any, Dict, List, Optional

try:
    import chromadb  # type: ignore
except ImportError:  # pragma: no cover - optional dependency at this stage
    chromadb = None


class ThreatVectorStore:
    """
    Thin wrapper around ChromaDB for SentinelAI.

    In early stages this is intentionally minimal; we can evolve it into
    a full-featured abstraction once the schema stabilizes.
    """

    def __init__(self, collection_name: str = "sentinelai_threats") -> None:
        if chromadb is None:
            raise RuntimeError(
                "chromadb is not installed. Add it to backend/requirements.txt and pip install."
            )

        client = chromadb.Client()
        self.collection = client.get_or_create_collection(collection_name)

    def add_events(
        self,
        ids: List[str],
        embeddings: List[List[float]],
        metadatas: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        self.collection.add(ids=ids, embeddings=embeddings, metadatas=metadatas)

    def search_similar(
        self, query_embedding: List[float], n_results: int = 5
    ) -> Dict[str, Any]:
        return self.collection.query(query_embeddings=[query_embedding], n_results=n_results)
