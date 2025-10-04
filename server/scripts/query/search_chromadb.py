#!/usr/bin/env python3
"""Exhaustive semantic search helper for the AFI corpus.

Given a natural-language query, the script retrieves the most similar
paragraphs from ChromaDB and then expands each hit to include its direct and
indirect descendants (e.g. paragraph ``8.9.2`` pulls in ``8.9.2.1`` and
``8.9.2.1.1``).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import chromadb
from openai import OpenAI


@dataclass
class ParagraphEntry:
    id: str
    text: str
    metadata: Dict[str, object]

    @property
    def paragraph_id(self) -> Optional[str]:
        value = self.metadata.get("paragraph") if self.metadata else None
        if isinstance(value, str):
            return value.strip()
        return None

    @property
    def afi_number(self) -> Optional[str]:
        value = self.metadata.get("afi_number") if self.metadata else None
        if isinstance(value, str):
            return value.strip()
        return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Search ChromaDB with OpenAI embeddings")
    parser.add_argument("--query", required=True, help="Search query")
    parser.add_argument("--chroma_dir", required=True, help="ChromaDB storage directory")
    parser.add_argument("--n_results", type=int, default=60, help="Base semantic hits to retrieve before expansion")
    parser.add_argument("--filter_doc_id", action="append", help="Optional filter: doc_id (repeatable)")
    parser.add_argument("--filter_afi_number", help="Optional filter: afi_number")
    parser.add_argument("--min_score", type=float, default=0.05, help="Minimum cosine similarity for a seed match (0–1)")
    parser.add_argument("--max_expansion_depth", type=int, default=3, help="Maximum descendant depth to expand (0=no expansion)")
    parser.add_argument("--stats", action="store_true", help="Return collection stats instead of search")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging to stderr")
    return parser.parse_args()


def normalize_paragraph_parts(paragraph: str) -> Tuple[str, ...]:
    cleaned = paragraph.strip()
    if not cleaned:
        return ()
    cleaned = cleaned.replace("(Added)", "")
    cleaned = cleaned.replace("(Added-ANG)", "")
    cleaned = cleaned.replace("(T-0)", "").replace("(T-1)", "").replace("(T-2)", "").replace("(T-3)", "")
    cleaned = cleaned.replace("(Mandatory)", "")
    parts = []
    for raw in cleaned.split('.'):
        token = raw.strip()
        if not token:
            continue
        token = re.sub(r"[^0-9A-Za-z-]", "", token)
        if token:
            parts.append(token)
    return tuple(parts)


def is_descendant(candidate: Sequence[str], ancestor: Sequence[str]) -> bool:
    if not ancestor:
        return False
    if len(candidate) <= len(ancestor):
        return candidate == tuple(ancestor)
    return tuple(candidate[: len(ancestor)]) == tuple(ancestor)


def load_afi_entries(collection: chromadb.api.models.Collection.Collection, afi_number: str) -> List[ParagraphEntry]:
    # Note: 'ids' is always returned by Chroma and is not a valid value for the
    # 'include' parameter. Only request 'documents' and 'metadatas' here.
    raw = collection.get(
        where={"afi_number": afi_number},
        include=["documents", "metadatas"],
        limit=10000,
    )

    documents = raw.get("documents") or []
    metadatas = raw.get("metadatas") or []
    ids = raw.get("ids") or []

    entries: List[ParagraphEntry] = []
    for doc, meta, identifier in zip(documents, metadatas, ids):
        if not isinstance(doc, str) or not isinstance(meta, dict) or not isinstance(identifier, str):
            continue
        entries.append(ParagraphEntry(id=identifier, text=doc, metadata=meta))

    def sort_key(entry: ParagraphEntry) -> Tuple[int, Tuple[str, ...], str]:
        paragraph_id = entry.paragraph_id or "zzzz"
        parts = normalize_paragraph_parts(paragraph_id)
        return (len(parts), parts, paragraph_id)

    entries.sort(key=sort_key)
    return entries


def expand_with_descendants(
    collection: chromadb.api.models.Collection.Collection,
    seeds: List[Dict[str, object]],
    max_depth: int = 3,
    verbose: bool = False,
) -> List[Dict[str, object]]:
    afi_cache: Dict[str, List[ParagraphEntry]] = {}
    seen_ids: set[str] = set()
    expanded: List[Dict[str, object]] = []

    # Sort seeds by descending similarity so that higher-confidence matches stay near the top
    sorted_seeds = sorted(
        seeds,
        key=lambda item: float(item.get("similarity_score", 0.0)),
        reverse=True,
    )

    for seed in sorted_seeds:
        metadata = seed.get("metadata") or {}
        if not isinstance(metadata, dict):
            metadata = {}

        paragraph = metadata.get("paragraph") if isinstance(metadata.get("paragraph"), str) else None
        afi_number = metadata.get("afi_number") if isinstance(metadata.get("afi_number"), str) else None

        seed_id = seed.get("id")
        if isinstance(seed_id, str) and seed_id not in seen_ids:
            expanded.append(seed)
            seen_ids.add(seed_id)

        if not paragraph or not afi_number:
            # Can't expand without both AFI number and paragraph identifier
            continue

        if afi_number not in afi_cache:
            afi_cache[afi_number] = load_afi_entries(collection, afi_number)

        ancestor_parts = normalize_paragraph_parts(paragraph)
        if not ancestor_parts:
            continue

        seed_similarity = float(seed.get("similarity_score", 0.0))

        for entry in afi_cache[afi_number]:
            candidate_paragraph = entry.paragraph_id
            if not candidate_paragraph:
                continue

            candidate_parts = normalize_paragraph_parts(candidate_paragraph)
            if not candidate_parts:
                continue

            if not is_descendant(candidate_parts, ancestor_parts):
                continue

            # Skip the seed paragraph itself; we already added it
            if entry.id in seen_ids:
                continue

            depth = max(len(candidate_parts) - len(ancestor_parts), 0)
            
            # Respect max_depth limit
            if depth > max_depth:
                continue
            
            similarity_penalty = min(depth * 0.01, 0.15)  # Increased penalty for deeper descendants
            adjusted_similarity = max(seed_similarity - similarity_penalty, 0.0)

            expanded.append(
                {
                    "id": entry.id,
                    "text": entry.text,
                    "metadata": entry.metadata,
                    "similarity_score": adjusted_similarity,
                }
            )
            seen_ids.add(entry.id)

    if verbose:
        print(f"[EXPAND] Expanded {len(seeds)} seeds to {len(expanded)} results (max_depth={max_depth})", file=sys.stderr)

    return expanded


def keyword_fallback_search(
    collection: chromadb.api.models.Collection.Collection,
    query: str,
    n_results: int = 60,
    where_filters: Optional[dict] = None,
    scan_limit: int = 20000,
    verbose: bool = False,
) -> List[Dict[str, object]]:
    """Improved substring fallback search with multi-term proximity scoring.

    For multi-word queries, heavily favor documents where terms appear close together.
    """
    text = (query or "").strip()
    if not text:
        return []

    # Split into lowercase keyword tokens, filter out stopwords
    stopwords = {"the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by"}
    terms = [t.lower() for t in re.split(r"\s+", text) if t and t.lower() not in stopwords]
    if not terms:
        return []

    if verbose:
        print(f"[FALLBACK] Keyword search for terms: {terms}", file=sys.stderr)

    raw = collection.get(
        where=where_filters if where_filters else None,
        include=["documents", "metadatas"],
        limit=max(scan_limit, n_results),
    )

    documents = raw.get("documents") or []
    metadatas = raw.get("metadatas") or []
    ids = raw.get("ids") or []

    # Ensure aligned lengths for zipping; if ids are missing, synthesize them
    count = min(len(documents), len(metadatas))
    if not ids or len(ids) < count:
        ids = [f"kw-{i}" for i in range(count)]

    scored: List[Tuple[float, Dict[str, object]]] = []
    for i in range(count):
        doc = documents[i]
        meta = metadatas[i]
        identifier = ids[i]
        if not isinstance(doc, str) or not isinstance(meta, dict) or not isinstance(identifier, str):
            continue
        lower = doc.lower()
        
        # Count matched terms
        matches = sum(1 for t in terms if t in lower)
        
        # For multi-word queries, require at least 2 terms or all terms for single pairs
        if len(terms) >= 2:
            if matches < min(2, len(terms)):
                continue  # Skip docs that don't have enough terms
        
        if matches == 0:
            continue
        
        # Boost score if terms appear close together (within 50 chars)
        proximity_bonus = 0.0
        if len(terms) >= 2 and matches >= 2:
            # Find positions of all term occurrences
            positions = []
            for term in terms:
                start = 0
                while True:
                    idx = lower.find(term, start)
                    if idx == -1:
                        break
                    positions.append((idx, term))
                    start = idx + 1
            
            # Check for close proximity
            positions.sort()
            for j in range(len(positions) - 1):
                dist = positions[j + 1][0] - positions[j][0]
                if dist < 50:  # Terms within 50 chars
                    proximity_bonus += 0.15
                    break  # Only count once per doc
        
        # Score: base on match count, boost for proximity and all-terms match
        score = matches
        if matches == len(terms):
            score += 2.0  # Big boost for matching all terms
        score += proximity_bonus
        
        # Map to similarity in [0.05, 0.40]
        similarity = min(0.05 + 0.08 * score, 0.40)
        
        scored.append(
            (
                score,
                {
                    "id": identifier,
                    "text": doc,
                    "metadata": meta,
                    "similarity_score": similarity,
                },
            )
        )

    # Sort by score descending and trim
    scored.sort(key=lambda x: x[0], reverse=True)
    results = [item for _, item in scored[:n_results]]
    
    if verbose:
        print(f"[FALLBACK] Found {len(results)} keyword matches", file=sys.stderr)
    
    return results


def main() -> None:
    args = parse_args()

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY not set", flush=True)
        sys.exit(1)

    client = OpenAI(api_key=api_key)

    chroma_path = Path(args.chroma_dir)
    if not chroma_path.exists():
        print("ERROR: ChromaDB directory not found", flush=True)
        sys.exit(1)

    chroma_client = chromadb.PersistentClient(path=str(chroma_path))
    collection = chroma_client.get_collection("afi_documents_openai")

    if args.stats:
        stats = {
            "name": collection.name,
            "count": collection.count(),
            "metadata": collection.metadata,
        }
        print(f"JSON_OUTPUT: {json.dumps(stats)}")
        return

    query_text = args.query.strip()
    if not query_text:
        raise ValueError("Query cannot be empty")
    if not query_text.lower().startswith("query:"):
        query_text = "query: " + query_text

    embedding = client.embeddings.create(
        input=query_text,
        model="text-embedding-3-small",
    ).data[0].embedding

    where_filters = {}
    if args.filter_doc_id:
        if len(args.filter_doc_id) == 1:
            where_filters["doc_id"] = args.filter_doc_id[0]
        else:
            where_filters["doc_id"] = {"$in": args.filter_doc_id}
    if args.filter_afi_number:
        where_filters["afi_number"] = args.filter_afi_number

    query_results = collection.query(
        query_embeddings=[embedding],
        n_results=max(args.n_results, 10),
        where=where_filters if where_filters else None,
    )

    seeds: List[Dict[str, object]] = []

    documents = query_results.get("documents") or []
    metadatas = query_results.get("metadatas") or []
    ids = query_results.get("ids") or []
    distances = query_results.get("distances") or []

    # If no results or the first result list is empty, fall back
    if not documents or (isinstance(documents, list) and len(documents) > 0 and not documents[0]):
        if args.verbose:
            print(f"[VECTOR] No vector results, using keyword fallback", file=sys.stderr)
        # Fallback to keyword scan if vector search returned no candidates
        fallback = keyword_fallback_search(
            collection,
            args.query,
            n_results=max(args.n_results, 30),
            where_filters=where_filters if where_filters else None,
            verbose=args.verbose,
        )
        output = {
            "success": True,
            "query": args.query,
            "total_matches": len(fallback),
            "results": fallback,
        }
        print(f"JSON_OUTPUT: {json.dumps(output)}")
        return

    for doc, meta, identifier, distance in zip(
        documents[0],
        metadatas[0],
        ids[0],
        distances[0],
    ):
        if not isinstance(doc, str) or not isinstance(meta, dict) or not isinstance(identifier, str):
            continue

        # Convert Chroma cosine distance to a bounded similarity [0,1]
        # Chroma may return distances in [0,2] (1 - cosSim). Clamp to valid range.
        similarity = 1.0 - float(distance)
        similarity = max(min(similarity, 1.0), 0.0)  # Clamp to [0, 1]
        
        if similarity < args.min_score:
            continue

        seeds.append(
            {
                "id": identifier,
                "text": doc,
                "metadata": meta,
                "similarity_score": similarity,
            }
        )
    
    if args.verbose:
        print(f"[VECTOR] Found {len(seeds)} seeds above min_score={args.min_score}", file=sys.stderr)

    # If no seeds survived thresholding, try a keyword fallback across the corpus
    if not seeds:
        if args.verbose:
            print(f"[VECTOR] No seeds above threshold, using keyword fallback", file=sys.stderr)
        fallback = keyword_fallback_search(
            collection,
            args.query,
            n_results=max(args.n_results, 30),
            where_filters=where_filters if where_filters else None,
            verbose=args.verbose,
        )
        output = {
            "success": True,
            "query": args.query,
            "total_matches": len(fallback),
            "results": fallback,
        }
        print(f"JSON_OUTPUT: {json.dumps(output)}")
        return

    ordered_results = expand_with_descendants(
        collection, 
        seeds, 
        max_depth=args.max_expansion_depth,
        verbose=args.verbose
    )

    output = {
        "success": True,
        "query": args.query,
        "total_matches": len(ordered_results),
        "results": ordered_results,
    }

    print(f"JSON_OUTPUT: {json.dumps(output)}")


if __name__ == "__main__":
    try:
        main()
    except Exception as err:  # pragma: no cover - CLI safety
        error_output = {
            "success": False,
            "error": str(err),
            "query": None,
            "total_matches": 0,
            "results": [],
        }
        print(f"JSON_OUTPUT: {json.dumps(error_output)}", file=sys.stderr)
        sys.exit(1)
