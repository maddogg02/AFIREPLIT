"""CLI entrypoint helpers for the RAG chat system."""
from __future__ import annotations

def build_parser(argparse_module):
    parser = argparse_module.ArgumentParser(description="Complete RAG Chat System for AFI/DAFI documents")
    parser.add_argument("--query", help="Single question to ask")
    parser.add_argument("--chroma_dir", default="chroma_storage_openai", help="ChromaDB storage directory")
    parser.add_argument("--n_results", type=int, default=10, help="Number of search results to use for context")
    parser.add_argument("--afi_number", help="Filter by AFI number")
    parser.add_argument("--chapter", help="Filter by chapter")
    parser.add_argument("--folder", help="Filter by folder name")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    parser.add_argument("--interactive", action="store_true", help="Start interactive chat mode")
    parser.add_argument("--model", default="gpt-5", help="OpenAI model to use (default: gpt-5)")
    parser.add_argument("--hybrid", action="store_true", default=True, help="Use hybrid prompt fusion (default: True)")
    parser.add_argument("--no-hybrid", dest="hybrid", action="store_false", help="Disable hybrid prompt fusion")
    parser.add_argument("--min-score", type=float, help="Minimum similarity score for retrieved chunks")
    parser.add_argument("--no-filter", action="store_true", help="Skip LLM-based relevance filtering step")
    parser.add_argument("--max-tokens", type=int, help="Maximum completion tokens for the answer (also scales context length)")
    parser.add_argument("--env-path", help="Optional path to a .env file")
    return parser
