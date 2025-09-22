#!/usr/bin/env python3
"""
ChromaDB Search with OpenAI Embeddings
Searches the AFI documents using OpenAI text-embedding-3-small

Usage:
    python search_chromadb_openai.py --query "maintenance procedures" --n_results 5
"""

import os
# Disable symlinks warning for Windows compatibility
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'

import chromadb
from openai import OpenAI
import argparse
import json
import sys
from pathlib import Path
from typing import List, Dict, Any

class ChromaDBSearchOpenAI:
    def __init__(self, chroma_dir: str):
        """Initialize search client with OpenAI embeddings"""
        self.chroma_dir = Path(chroma_dir)
        
        # Initialize OpenAI client
        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")
        
        self.openai_client = OpenAI(api_key=api_key)
        
        # Initialize ChromaDB
        if not self.chroma_dir.exists():
            raise FileNotFoundError(f"ChromaDB directory does not exist: {self.chroma_dir}")
            
        self.chroma_client = chromadb.PersistentClient(path=str(self.chroma_dir))
        
        # Get the OpenAI collection
        self.collection_name = "afi_documents_openai"
        try:
            self.collection = self.chroma_client.get_collection(self.collection_name)
        except Exception as e:
            raise Exception(f"Could not find collection '{self.collection_name}': {str(e)}")
    
    def get_openai_embedding(self, text: str, model: str = "text-embedding-3-small") -> List[float]:
        """Get OpenAI embedding for search query"""
        try:
            response = self.openai_client.embeddings.create(
                input=text,
                model=model
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"[ERROR] Failed to get embedding: {str(e)}")
            return None
    
    def search(self, query: str, n_results: int = 5, 
               filter_metadata: Dict = None) -> List[Dict[str, Any]]:
        """Search for documents using semantic similarity"""
        try:
            # Generate embedding for the search query
            query_embedding = self.get_openai_embedding(query)
            if query_embedding is None:
                return []
            
            # Prepare search parameters
            search_params = {
                "query_embeddings": [query_embedding],
                "n_results": min(n_results, 100)  # Limit to reasonable number
            }
            
            # Add metadata filtering if provided
            if filter_metadata:
                search_params["where"] = filter_metadata
            
            # Execute search
            results = self.collection.query(**search_params)
            
            # Format results
            formatted_results = []
            
            for i in range(len(results['documents'][0])):
                # Calculate similarity score (ChromaDB returns distances)
                distance = results['distances'][0][i]
                similarity_score = 1 - distance  # Convert distance to similarity
                
                result = {
                    "id": results['ids'][0][i],
                    "text": results['documents'][0][i],
                    "metadata": results['metadatas'][0][i],
                    "similarity_score": similarity_score,
                    "distance": distance
                }
                formatted_results.append(result)
            
            return formatted_results
            
        except Exception as e:
            print(f"[ERROR] Search failed: {str(e)}")
            return []
    
    def get_document_by_id(self, doc_id: str) -> Dict[str, Any]:
        """Get a specific document by its ID"""
        try:
            result = self.collection.get(ids=[doc_id])
            
            if result['documents']:
                return {
                    "id": result['ids'][0],
                    "text": result['documents'][0],
                    "metadata": result['metadatas'][0]
                }
            else:
                return None
                
        except Exception as e:
            print(f"[ERROR] Failed to get document: {str(e)}")
            return None
    
    def search_with_filters(self, query: str, afi_number: str = None, 
                           chapter: str = None, n_results: int = 5) -> List[Dict[str, Any]]:
        """Search with common filter options"""
        filter_metadata = {}
        
        if afi_number:
            filter_metadata["afi_number"] = afi_number
        
        if chapter:
            filter_metadata["chapter"] = chapter
        
        return self.search(query, n_results, filter_metadata if filter_metadata else None)
    
    def get_collection_stats(self) -> Dict[str, Any]:
        """Get statistics about the collection"""
        try:
            collection_count = self.collection.count()
            
            # Get all results to analyze metadata
            all_results = self.collection.get()
            
            # Analyze metadata
            afi_numbers = list(set([meta.get('afi_number', '') for meta in all_results['metadatas'] if meta.get('afi_number')]))
            chapters = list(set([meta.get('chapter', '') for meta in all_results['metadatas'] if meta.get('chapter')]))
            folders = list(set([meta.get('folder', '') for meta in all_results['metadatas'] if meta.get('folder')]))
            
            stats = {
                "collection_name": self.collection_name,
                "total_documents": collection_count,
                "embedding_model": "text-embedding-3-small", 
                "embedding_dimension": 1536,
                "afi_numbers": sorted(afi_numbers),
                "chapters": sorted(chapters),
                "folders": sorted(folders)
            }
            
            return stats
            
        except Exception as e:
            return {"error": str(e)}

def main():
    parser = argparse.ArgumentParser(description="Search AFI documents with OpenAI embeddings")
    parser.add_argument("--query", required=True, help="Search query")
    parser.add_argument("--n_results", type=int, default=5, help="Number of results to return")
    parser.add_argument("--chroma_dir", default="chroma_storage_openai", help="ChromaDB storage directory")
    parser.add_argument("--afi_number", help="Filter by AFI number")
    parser.add_argument("--chapter", help="Filter by chapter")
    parser.add_argument("--stats", action="store_true", help="Show collection statistics")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    
    args = parser.parse_args()
    
    try:
        # Initialize search client
        searcher = ChromaDBSearchOpenAI(args.chroma_dir)
        
        # Show stats if requested
        if args.stats:
            stats = searcher.get_collection_stats()
            print(json.dumps(stats, indent=2))
            return
        
        # Perform search
        results = searcher.search_with_filters(
            query=args.query,
            afi_number=args.afi_number,
            chapter=args.chapter,
            n_results=args.n_results
        )
        
        if args.json:
            # Output as JSON for programmatic use
            output = {
                "query": args.query,
                "n_results": len(results),
                "results": results
            }
            print(json.dumps(output, indent=2))
        else:
            # Human-readable output
            print(f"\nSearch Query: '{args.query}'")
            print(f"Found {len(results)} results:\n")
            
            for i, result in enumerate(results, 1):
                metadata = result['metadata']
                
                print(f"[{i}] Score: {result['similarity_score']:.3f}")
                print(f"    AFI: {metadata.get('afi_number', 'N/A')}")
                print(f"    Chapter: {metadata.get('chapter', 'N/A')}")
                print(f"    Paragraph: {metadata.get('paragraph', 'N/A')}")
                print(f"    Text: {result['text'][:200]}...")
                print()
    
    except KeyboardInterrupt:
        print("\nSearch cancelled by user")
        sys.exit(1)
    except Exception as e:
        if args.json:
            print(json.dumps({"error": str(e)}))
        else:
            print(f"Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()