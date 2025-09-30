#!/usr/bin/env python3
import os
import json
import sys
import argparse
from pathlib import Path
import chromadb
from openai import OpenAI

def main():
    parser = argparse.ArgumentParser(description="Search ChromaDB with OpenAI embeddings")
    parser.add_argument("--query", required=True, help="Search query")
    parser.add_argument("--chroma_dir", required=True, help="ChromaDB storage directory")
    parser.add_argument("--n_results", type=int, default=5, help="Number of results to return")
    parser.add_argument("--filter_doc_id", help="Optional filter: doc_id")
    parser.add_argument("--filter_afi_number", help="Optional filter: afi_number")
    parser.add_argument("--min_score", type=float, default=0.05, help="Minimum similarity score (0–1) - matches RAG system threshold")
    parser.add_argument("--stats", action="store_true", help="Return collection stats instead of search")
    args = parser.parse_args()

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY not set", flush=True)
        exit(1)

    client = OpenAI(api_key=api_key)

    if not Path(args.chroma_dir).exists():
        print("ERROR: ChromaDB directory not found", flush=True)
        exit(1)

    chroma_client = chromadb.PersistentClient(path=args.chroma_dir)
    collection = chroma_client.get_collection("afi_documents_openai")

    # Collection stats mode
    if args.stats:
        stats = {
            "name": collection.name,
            "count": collection.count(),
            "metadata": collection.metadata
        }
        print(f"JSON_OUTPUT: {json.dumps(stats)}")
        return

    # Normalize query
    query_text = args.query.strip()
    if not query_text.lower().startswith("query:"):
        query_text = "query: " + query_text

    # Create query embedding
    embedding = client.embeddings.create(
        input=query_text,
        model="text-embedding-3-small"
    ).data[0].embedding

    # Apply filters
    filter_metadata = {}
    if args.filter_doc_id:
        filter_metadata["doc_id"] = args.filter_doc_id
    if args.filter_afi_number:
        filter_metadata["afi_number"] = args.filter_afi_number

    # Perform search
    results = collection.query(
        query_embeddings=[embedding],
        n_results=args.n_results,
        where=filter_metadata if filter_metadata else None
    )

    formatted = []
    for i in range(len(results["documents"][0])):
        distance = results["distances"][0][i]
        similarity = 1 - distance
        if similarity < args.min_score:
            continue
        formatted.append({
            "id": results["ids"][0][i],
            "text": results["documents"][0][i],
            "metadata": results["metadatas"][0][i],
            "similarity_score": similarity
        })

    output = {
        "success": True,
        "query": args.query,
        "total_matches": len(formatted),
        "results": formatted
    }
    print(f"JSON_OUTPUT: {json.dumps(output)}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        error_output = {
            "success": False,
            "error": str(e),
            "query": None,
            "total_matches": 0,
            "results": []
        }
        print(f"JSON_OUTPUT: {json.dumps(error_output)}", file=sys.stderr)
        exit(1)