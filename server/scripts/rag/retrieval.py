"""Document retrieval and semantic search helpers."""
from __future__ import annotations

import re
import sys
from collections import OrderedDict
from typing import Any, Dict, List, Optional, Tuple

from .config import EMBEDDING_MODEL, RAGConfig


class RetrievalEngine:
    """Encapsulates semantic search and content filtering."""

    def __init__(self, openai_client, collection: Any, config: RAGConfig) -> None:
        self._client = openai_client
        self._collection = collection
        self._config = config
        self._important_keywords = [keyword.lower() for keyword in config.important_keywords]
        self._toc_patterns = list(config.toc_patterns)
        self._query_rules = [
            {
                "triggers": [trigger.lower() for trigger in rule.get("triggers", [])],
                "additions": list(rule.get("additions", [])),
            }
            for rule in config.query_tweaks
        ]
        self._distance_metric = self._detect_distance_metric()
        self._embedding_cache_size = max(0, int(config.embedding_cache_size)) if config.embedding_cache_size else 0
        self._embedding_cache: "OrderedDict[Tuple[str, str], List[float]]" = OrderedDict()
        self._negative_similarity_warning_emitted = False

        if not self.silent:
            print(f"[RETRIEVAL] Distance metric detected: {self._distance_metric}")

    @property
    def silent(self) -> bool:
        return self._config.silent

    def enhance_query_for_search(self, query: str) -> str:
        query_lower = query.lower()
        enhancements: List[str] = []

        for rule in self._query_rules:
            triggers = rule["triggers"]
            additions = rule["additions"]
            if triggers and any(trigger in query_lower for trigger in triggers):
                enhancements.extend(additions)

        if enhancements:
            unique_enhancements = list(dict.fromkeys(enhancements))
            enhanced_query = f"{query} {' '.join(unique_enhancements)}"
            if not self.silent:
                print(f"[QUERY] Enhanced: '{query}' → '{enhanced_query}'")
            return enhanced_query
        return query

    def get_query_embedding(self, text: str, model: str) -> Optional[List[float]]:
        try:
            query_text = "query: " + text.strip()
            cache_key = (model, query_text)
            if self._embedding_cache_size:
                cached_embedding = self._embedding_cache.get(cache_key)
                if cached_embedding is not None:
                    self._embedding_cache.move_to_end(cache_key)
                    if not self.silent:
                        print("[CACHE] Using cached embedding for query")
                    return cached_embedding

            response = self._client.embeddings.create(
                input=query_text,
                model=model,
            )
            embedding = response.data[0].embedding

            if self._embedding_cache_size:
                self._embedding_cache[cache_key] = embedding
                self._embedding_cache.move_to_end(cache_key)
                if len(self._embedding_cache) > self._embedding_cache_size:
                    self._embedding_cache.popitem(last=False)

            return embedding
        except Exception as exc:
            message = f"[ERROR] Failed to get embedding: {exc}"
            if not self.silent:
                print(message)
            else:
                print(message, file=sys.stderr)
            return None

    def _is_content_useful(self, text: str) -> bool:
        if not text or len(text.strip()) < 10:
            return False

        text_lower = text.lower().strip()
        for pattern in self._toc_patterns:
            if re.match(pattern, text_lower):
                if not self.silent:
                    print(f"[FILTER] Excluding TOC/Header: {text[:50]}...")
                return False

        if any(keyword in text_lower for keyword in self._important_keywords):
            return True

        if len(text.strip()) < 30:
            if not self.silent:
                print(f"[FILTER] Excluding short content: {text[:50]}...")
            return False

        alpha_chars = sum(1 for c in text if c.isalpha())
        if alpha_chars < 10:
            if not self.silent:
                print(f"[FILTER] Excluding non-text content: {text[:50]}...")
            return False

        return True

    def search_documents(
        self,
        query: str,
        n_results: int,
        min_score: float,
        embedding_model: str,
        filter_metadata: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        enhanced_query = self.enhance_query_for_search(query)
        query_embedding = self.get_query_embedding(enhanced_query, embedding_model)
        if query_embedding is None:
            return []

        search_params: Dict[str, Any] = {
            "query_embeddings": [query_embedding],
            "n_results": min(n_results * 4, 25),
        }
        if filter_metadata:
            search_params["where"] = filter_metadata

        results = self._collection.query(**search_params)

        formatted_results: List[Dict[str, Any]] = []
        seen_texts = set()
        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]
        ids = results.get("ids", [[]])[0]

        for index, text in enumerate(documents):
            distance = distances[index] if index < len(distances) else None
            similarity_score = self._convert_distance_to_similarity(distance)
            if similarity_score < 0:
                if not self._negative_similarity_warning_emitted and not self.silent and distance is not None:
                    print(
                        f"[WARN] Negative similarity ({similarity_score:.3f}) computed from distance {distance:.3f}; clamping to 0."
                    )
                    self._negative_similarity_warning_emitted = True
                similarity_score = 0.0
            if similarity_score < min_score:
                continue

            if not self.silent:
                print(f"[DEBUG] Found document {index + 1}: {text[:100]}... (similarity: {similarity_score:.3f})")

            if not self._is_content_useful(text):
                continue

            metadata = metadatas[index]
            unique_key = f"{text[:100]}_{metadata.get('afi_number', '')}_{metadata.get('paragraph', '')}"
            if unique_key in seen_texts:
                continue
            seen_texts.add(unique_key)

            formatted_results.append(
                {
                    "id": ids[index],
                    "text": text,
                    "metadata": metadata,
                    "similarity_score": similarity_score,
                    "distance": distance,
                }
            )

        return formatted_results[:n_results]

    def _detect_distance_metric(self) -> str:
        metadata_sources: List[Dict[str, Any]] = []
        try:
            meta = getattr(self._collection, "metadata", None)
            if isinstance(meta, dict):
                metadata_sources.append(meta)
        except Exception:  # pragma: no cover - defensive
            pass

        for metadata in metadata_sources:
            for key in ("hnsw:space", "distance_function", "metric"):
                metric = metadata.get(key)
                if isinstance(metric, str):
                    return metric.lower()
        return "cosine"

    def _convert_distance_to_similarity(self, distance: Optional[float]) -> float:
        if distance is None:
            return 0.0

        metric = self._distance_metric
        if metric in {"cosine", "ip"}:
            return 1.0 - distance
        if metric in {"l2", "euclidean"}:
            return 1.0 / (1.0 + max(distance, 0.0))
        return 1.0 - distance

    def resolve_afi_filter(self, afi_number: Optional[str], folder: Optional[str]) -> Optional[str]:
        if not afi_number:
            return None

        candidate = afi_number.strip()
        if not candidate:
            return None

        test_filter = {"afi_number": candidate}
        if folder:
            test_filter["folder"] = folder
        test_results = self.search_documents(
            query="test",
            n_results=1,
            min_score=0.0,
            embedding_model=EMBEDDING_MODEL,
            filter_metadata=test_filter,
        )
        if test_results:
            return candidate

        if candidate.upper().startswith(("AFI", "DAFI")):
            return candidate

        variants = [f"AFI {candidate}", f"DAFI {candidate}"]
        for variant in variants:
            test_filter = {"afi_number": variant}
            if folder:
                test_filter["folder"] = folder
            test_results = self.search_documents(
                query="test",
                n_results=1,
                min_score=0.0,
                embedding_model=EMBEDDING_MODEL,
                filter_metadata=test_filter,
            )
            if test_results:
                return variant
        return afi_number
