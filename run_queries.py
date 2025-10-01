#!/usr/bin/env python3
from pathlib import Path
import sys

sys.path.insert(0, str(Path("server")))

from scripts.query.run_rag_chat import RAGChatSystem


def main():
    rag = RAGChatSystem("chroma_storage_openai", silent=False, hybrid_mode=True)
    model = "gpt-5"
    queries = [
        "i found fod in a tool box what does this violate?"
    ]

    for q in queries:
        print("\n=== QUERY:", q)
        result = rag.generate_rag_response(q, model=model, n_results=6)
        print("request_id:", result.get("request_id"))
        print("success:", result.get("success"), "context chunks:", len(result.get("context", [])))
        if result.get("timings"):
            print("timings (ms):", result["timings"])
        if result.get("success"):
            print("model_used:", result.get("model_used"))
            print("raw_answer:\n", result.get("raw_answer"))
            print("\nformatted:\n", result.get("response"))
        else:
            print("error:", result.get("error"))


if __name__ == "__main__":
    main()
