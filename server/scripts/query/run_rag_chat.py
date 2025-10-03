#!/usr/bin/env python3
"""
Command-line entry point for the AFI/DAFI RAG chat system.
Wires together modular retrieval, filtering, and generation helpers located in
``server/scripts/rag``.

Usage:
    python run_rag_chat.py --query "What is the guidance for male hair?" --json
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Ensure the parent scripts directory is on the Python path so we can import the
# ``rag`` package regardless of where this script lives.
CURRENT_DIR = Path(__file__).resolve().parent
SCRIPTS_ROOT = CURRENT_DIR.parent
if str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))

# Disable symlinks warning for Windows compatibility
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

import argparse
import json
import uuid
from time import perf_counter
from typing import Any, Dict, List, Optional

import chromadb
from openai import OpenAI

from rag.cli import build_parser
from rag.config import (
    DEFAULT_MIN_SIMILARITY,
    DEFAULT_MAX_COMPLETION_TOKENS,
    EMBEDDING_MODEL,
    RAGConfig,
)
from rag.filtering import RelevanceFilter
from rag.generation import ResponseGenerator
from rag.retrieval import RetrievalEngine
from rag.utils import (
    format_source_label,
    load_environment,
    truncate_context_if_needed,
)


class RAGChatSystem:
    """High-level orchestrator that connects retrieval, filtering, and generation."""

    def __init__(self, config: RAGConfig) -> None:
        self.config = config

        load_environment(self.config)

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")

        self.openai_client = OpenAI(api_key=api_key)

        if not self.config.chroma_dir.exists():
            raise FileNotFoundError(f"ChromaDB directory does not exist: {self.config.chroma_dir}")

        self.chroma_client = chromadb.PersistentClient(path=str(self.config.chroma_dir))
        self.collection_name = "afi_documents_openai"
        try:
            self.collection = self.chroma_client.get_collection(self.collection_name)
            if not self.config.silent:
                print(f"✅ Connected to ChromaDB collection: {self.collection_name}")
        except Exception as exc:  # pragma: no cover - defensive
            raise RuntimeError(f"Could not find collection '{self.collection_name}': {exc}")

        self.retrieval_engine = RetrievalEngine(self.openai_client, self.collection, self.config)
        self.relevance_filter = RelevanceFilter(self.openai_client, self.config)
        self.response_generator = ResponseGenerator(self.openai_client, self.config)

    @property
    def silent(self) -> bool:
        return self.config.silent

    def retrieve_docs(
        self,
        user_query: str,
        n_results: int,
        filter_metadata: Optional[Dict[str, Any]] = None,
        min_score: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        score_threshold = self.config.min_similarity_score if min_score is None else min_score
        return self.retrieval_engine.search_documents(
            query=user_query,
            n_results=n_results,
            min_score=score_threshold,
            embedding_model=EMBEDDING_MODEL,
            filter_metadata=filter_metadata,
        )

    def filter_docs(self, user_query: str, documents: List[Dict[str, Any]], model: str) -> List[Dict[str, Any]]:
        return self.relevance_filter.filter(user_query, documents, model)

    def generate_answer(
        self,
        user_query: str,
        context: str,
        model: str,
        sources: List[Dict[str, Any]],
        knowledge_only: bool,
        procedural_mode: bool = False,
    ) -> tuple[str, str]:
        return self.response_generator.generate(
            user_query=user_query,
            context=context,
            model=model,
            sources=sources,
            knowledge_only=knowledge_only,
            procedural_mode=procedural_mode,
        )

    def _prepare_filter_metadata(
        self,
        afi_number: Optional[str],
        chapter: Optional[str],
        folder: Optional[str],
    ) -> Dict[str, Any]:
        metadata: Dict[str, Any] = {}
        if afi_number:
            resolved = self.retrieval_engine.resolve_afi_filter(afi_number, folder)
            metadata["afi_number"] = resolved
        if chapter:
            metadata["chapter"] = chapter
        if folder:
            metadata["folder"] = folder
        return metadata

    def generate_rag_response(
        self,
        user_query: str,
        n_results: int = 10,
        afi_number: Optional[str] = None,
        chapter: Optional[str] = None,
        folder: Optional[str] = None,
        model: str = "gpt-5",
        min_score: Optional[float] = None,
        use_filter: Optional[bool] = None,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        request_id = str(uuid.uuid4())
        overall_start = perf_counter()
        knowledge_fallback = False

        effective_min_score = self.config.min_similarity_score if min_score is None else min_score
        apply_filter = self.config.use_filter if use_filter is None else use_filter
        max_tokens = max_tokens or self.config.default_max_tokens

        # Update config so downstream components honour the runtime token limit
        self.config.default_max_tokens = max_tokens
        context_token_limit = max_tokens * self.config.context_token_multiplier

        if not self.silent:
            print(f"🔍 Stage 1: Searching for relevant content (retrieving top {n_results} candidates)...")

        filter_metadata = self._prepare_filter_metadata(afi_number, chapter, folder)
        retrieval_start = perf_counter()
        search_results = self.retrieve_docs(
            user_query=user_query,
            n_results=n_results,
            filter_metadata=filter_metadata or None,
            min_score=effective_min_score,
        )
        retrieval_duration_ms = round((perf_counter() - retrieval_start) * 1000, 2)

        if not search_results:
            knowledge_fallback = True
            if not self.silent:
                print("ℹ️  No AFI/DAFI context found; falling back to model knowledge.")

            generation_start = perf_counter()
            generated_answer, generation_model_used = self.generate_answer(
                user_query=user_query,
                context="",
                model=model,
                sources=[],
                knowledge_only=True,
            )
            generation_duration_ms = round((perf_counter() - generation_start) * 1000, 2)
            total_duration_ms = round((perf_counter() - overall_start) * 1000, 2)

            return {
                "success": True,
                "query": user_query,
                "response": generated_answer,
                "answer": generated_answer,
                "raw_answer": generated_answer,
                "sources": [],
                "context": [],
                "search_results_count": 0,
                "filtered_results_count": 0,
                "model": generation_model_used,
                "model_used": generation_model_used,
                "embedding_model": EMBEDDING_MODEL,
                "hybrid_mode": self.config.hybrid_mode,
                "relevance_filter_fallback": False,
                "context_truncated": False,
                "context_length": 0,
                "context_length_tokens": 0,
                "context_token_limit": context_token_limit,
                "knowledge_fallback": True,
                "request_id": request_id,
                "timings": {
                    "total_ms": total_duration_ms,
                    "generation_ms": generation_duration_ms,
                },
            }

        if not self.silent:
            print(f"✅ Retrieved {len(search_results)} candidates in {retrieval_duration_ms} ms")

        # Detect procedural intent and adjust retrieval depth if needed
        procedural_mode = self.retrieval_engine.detect_procedural_intent(user_query, search_results)
        if procedural_mode:
            apply_filter = False

        if procedural_mode and n_results < 8:
            if not self.silent:
                print(f"🔧 Procedural mode detected; expanding retrieval to ≥8 results...")
            # Re-retrieve with higher n_results for exhaustive step coverage
            retrieval_start = perf_counter()
            search_results = self.retrieve_docs(
                user_query=user_query,
                n_results=max(8, n_results),
                filter_metadata=filter_metadata or None,
                min_score=effective_min_score,
            )
            retrieval_duration_ms = round((perf_counter() - retrieval_start) * 1000, 2)
            if not self.silent:
                print(f"✅ Re-retrieved {len(search_results)} candidates in {retrieval_duration_ms} ms")

        if procedural_mode and self.config.neighbor_hops > 0:
            expanded_results = self.retrieval_engine.expand_with_neighbors(search_results, hops=self.config.neighbor_hops)
            if expanded_results:
                if not self.silent:
                    print(f"🔗 Neighbor expansion added {len(expanded_results) - len(search_results)} paragraphs")
                search_results = expanded_results

        filtered_results = search_results
        filter_duration_ms = None

        if apply_filter:
            if not self.silent:
                print("🧹 Stage 2: Applying relevance filter...")
            filter_start = perf_counter()
            filtered_results = self.filter_docs(user_query, search_results, model=model)
            filter_duration_ms = round((perf_counter() - filter_start) * 1000, 2)

            if not filtered_results:
                knowledge_fallback = True
                if not self.silent:
                    print("⚠️  Filter removed all candidates; falling back to model knowledge.")

                generation_start = perf_counter()
                generated_answer, generation_model_used = self.generate_answer(
                    user_query=user_query,
                    context="",
                    model=model,
                    sources=[],
                    knowledge_only=True,
                )
                generation_duration_ms = round((perf_counter() - generation_start) * 1000, 2)
                total_duration_ms = round((perf_counter() - overall_start) * 1000, 2)

                return {
                    "success": True,
                    "query": user_query,
                    "response": generated_answer,
                    "answer": generated_answer,
                    "raw_answer": generated_answer,
                    "sources": [],
                    "context": [],
                    "search_results_count": len(search_results),
                    "filtered_results_count": 0,
                    "model": generation_model_used,
                    "model_used": generation_model_used,
                    "embedding_model": EMBEDDING_MODEL,
                    "hybrid_mode": self.config.hybrid_mode,
                    "relevance_filter_fallback": True,
                    "context_truncated": False,
                    "context_length": 0,
                    "context_length_tokens": 0,
                    "context_token_limit": context_token_limit,
                    "knowledge_fallback": True,
                    "request_id": request_id,
                    "timings": {
                        "total_ms": total_duration_ms,
                        "retrieval_ms": retrieval_duration_ms,
                        "filter_ms": filter_duration_ms,
                        "generation_ms": generation_duration_ms,
                    },
                }

        if not self.silent:
            print(f"🧠 Stage 3: Generating answer with top {len(filtered_results)} passages...")

        sources = []
        context_entries = []
        for index, doc in enumerate(filtered_results, start=1):
            metadata = doc["metadata"]
            sources.append(
                {
                    "reference": index,
                    "afi_number": metadata.get("afi_number", "Unknown"),
                    "chapter": metadata.get("chapter", ""),
                    "paragraph": metadata.get("paragraph", ""),
                    "similarity_score": doc.get("similarity", 0.0),
                    "weighted_score": doc.get("weighted_score"),
                    "text_preview": doc["text"][:200],
                    "text": doc["text"],
                    "metadata": metadata,
                }
            )

            context_entries.append(
                {
                    "reference": index,
                    "text": doc["text"],
                    "metadata": metadata,
                    "similarity_score": doc.get("similarity", 0.0),
                    "weighted_score": doc.get("weighted_score"),
                }
            )

        combined_context = "\n\n".join(entry["text"] for entry in filtered_results)
        combined_context, was_truncated, token_length = truncate_context_if_needed(
            combined_context,
            token_limit=context_token_limit,
            model=model,
            silent=self.silent,
        )

        generation_start = perf_counter()
        generated_answer, generation_model_used = self.generate_answer(
            user_query=user_query,
            context=combined_context,
            model=model,
            sources=sources,
            knowledge_only=False,
            procedural_mode=procedural_mode,
        )
        generation_duration_ms = round((perf_counter() - generation_start) * 1000, 2)
        total_duration_ms = round((perf_counter() - overall_start) * 1000, 2)

        return {
            "success": True,
            "query": user_query,
            "response": generated_answer,
            "answer": generated_answer,
            "raw_answer": generated_answer,
            "sources": sources,
            "context": context_entries,
            "search_results_count": len(search_results),
            "filtered_results_count": len(filtered_results),
            "model": generation_model_used,
            "model_used": generation_model_used,
            "embedding_model": EMBEDDING_MODEL,
            "hybrid_mode": self.config.hybrid_mode,
            "context_truncated": was_truncated,
            "context_length": token_length,
            "context_token_limit": context_token_limit,
            "knowledge_fallback": knowledge_fallback,
            "request_id": request_id,
            "timings": {
                "total_ms": total_duration_ms,
                "retrieval_ms": retrieval_duration_ms,
                "filter_ms": filter_duration_ms,
                "generation_ms": generation_duration_ms,
            },
        }


def main() -> None:
    parser = build_parser(argparse)
    args = parser.parse_args()

    if args.json:
        # JSON output requested; ensure silent mode to avoid noisy prints
        args.silent = True

    config = RAGConfig(
        chroma_dir=Path(args.chroma_dir),
        min_similarity_score=args.min_score or DEFAULT_MIN_SIMILARITY,
        hybrid_mode=args.hybrid,
        silent=args.silent,
        use_filter=not args.no_filter,
        default_max_tokens=args.max_tokens or DEFAULT_MAX_COMPLETION_TOKENS,
    )

    rag_system = RAGChatSystem(config)
    response = rag_system.generate_rag_response(
        user_query=args.query,
        n_results=args.n_results,
        afi_number=args.afi_number,
        chapter=args.chapter,
        folder=args.folder,
        model=args.model,
        min_score=args.min_score,
        use_filter=None if args.no_filter is None else not args.no_filter,
        max_tokens=args.max_tokens,
    )

    if args.json:
        print(json.dumps(response, ensure_ascii=False))
    else:
        print("\n=== RAG Answer ===")
        print(response.get("response", "No answer generated."))

        if response.get("sources"):
            print("\nSources:")
            for source in response["sources"]:
                label = format_source_label(source)
                score = source.get("similarity_score", 0.0)
                print(f"- {label} (score: {score:.3f})")

        if response.get("context_truncated"):
            print("\n⚠️  Context was truncated to fit token limits.")


if __name__ == "__main__":
    main()
