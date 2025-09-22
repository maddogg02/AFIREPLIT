#!/usr/bin/env python3
"""
Complete RAG Chat System with OpenAI
Combines semantic search with chat completion for natural language Q&A

Usage:
    python rag_chat_openai.py --query "What are the uniform standards?" --chroma_dir "chroma_storage_openai"
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

class RAGChatSystem:
    def __init__(self, chroma_dir: str, silent: bool = False):
        """Initialize the complete RAG system with OpenAI"""
        self.chroma_dir = Path(chroma_dir)
        self.silent = silent  # Suppress console output for JSON mode
        
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
            if not self.silent:
                print(f"✅ Connected to ChromaDB collection: {self.collection_name}")
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
    
    def search_documents(self, query: str, n_results: int = 5, 
                        filter_metadata: Dict = None) -> List[Dict[str, Any]]:
        """Search for relevant documents using semantic similarity"""
        try:
            # Generate embedding for the search query
            query_embedding = self.get_openai_embedding(query)
            if query_embedding is None:
                return []
            
            # Prepare search parameters
            search_params = {
                "query_embeddings": [query_embedding],
                "n_results": min(n_results, 10)  # Limit for context window
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
                similarity_score = 1 - distance
                
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
    
    def generate_rag_response(self, user_query: str, n_results: int = 5, 
                             afi_number: str = None, chapter: str = None, folder: str = None) -> Dict[str, Any]:
        """Complete RAG: Search + Generate natural language response"""
        try:
            if not self.silent:
                print(f"🔍 Searching for relevant content...")
            
            # Step 1: Search for relevant documents
            filter_metadata = {}
            if afi_number:
                # Handle both "21-101" and "DAFI 21-101" formats
                if not afi_number.upper().startswith(('AFI', 'DAFI')):
                    # If just the number is provided, try both AFI and DAFI prefixes
                    afi_search_variants = [f"AFI {afi_number}", f"DAFI {afi_number}"]
                    # First try to find documents with either format
                    found_docs = False
                    for variant in afi_search_variants:
                        test_filter = {"afi_number": variant}
                        if folder:
                            test_filter["folder"] = folder
                        test_results = self.search_documents(user_query, 1, test_filter)
                        if test_results:
                            filter_metadata["afi_number"] = variant
                            found_docs = True
                            break
                    if not found_docs:
                        filter_metadata["afi_number"] = afi_number  # Use original if no variants found
                else:
                    filter_metadata["afi_number"] = afi_number
            if chapter:
                filter_metadata["chapter"] = chapter
            if folder:
                filter_metadata["folder"] = folder
            
            search_results = self.search_documents(
                user_query, 
                n_results, 
                filter_metadata if filter_metadata else None
            )
            
            if not search_results:
                return {
                    "success": False,
                    "error": "No relevant documents found",
                    "query": user_query
                }
            
            if not self.silent:
                print(f"✅ Found {len(search_results)} relevant documents")
            
            # Step 2: Prepare context from search results
            context_parts = []
            sources = []
            
            for i, result in enumerate(search_results, 1):
                metadata = result['metadata']
                
                # Create context entry
                source_ref = f"[{i}] AFI {metadata.get('afi_number', 'N/A')} Chapter {metadata.get('chapter', 'N/A')} Paragraph {metadata.get('paragraph', 'N/A')}"
                context_parts.append(f"{source_ref}: {result['text']}")
                
                # Track sources for citations
                sources.append({
                    "reference": i,
                    "afi_number": metadata.get('afi_number', 'N/A'),
                    "chapter": metadata.get('chapter', 'N/A'),
                    "paragraph": metadata.get('paragraph', 'N/A'),
                    "similarity_score": result['similarity_score'],
                    "text_preview": result['text'][:150] + "..." if len(result['text']) > 150 else result['text']
                })
            
            context = "\n\n".join(context_parts)
            
            # Step 3: Create the prompt for OpenAI
            system_prompt = """You are an Air Force Instructions (AFI) reference assistant. Your job is to provide a brief, helpful summary based on the provided context.

Guidelines:
- Provide 1-2 sentences summarizing what the references cover
- Do NOT include reference numbers, AFI citations, or paragraph numbers in your response
- Do NOT create a "reference list" - that will be shown separately
- Keep it simple and factual
- If multiple topics are covered, mention the main themes

The detailed references with AFI numbers and paragraphs will be displayed separately below your response.

Context from relevant AFI/DAFI paragraphs:
{context}"""
            
            user_prompt = f"Question: {user_query}\n\nProvide a brief summary of what these references cover. Do not include AFI numbers or reference lists in your response."
            
            if not self.silent:
                print(f"🤖 Generating response with OpenAI...")
            
            # Step 4: Generate response with OpenAI
            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt.format(context=context)},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,  # Low temperature for consistent, factual responses
                max_tokens=1000   # Standard token limit for direct answers
            )
            
            generated_answer = response.choices[0].message.content
            
            if not self.silent:
                print(f"✅ Response generated successfully")
            
            return {
                "success": True,
                "query": user_query,
                "answer": generated_answer,
                "sources": sources,
                "search_results_count": len(search_results),
                "model_used": "gpt-4o-mini",
                "embedding_model": "text-embedding-3-small"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "query": user_query
            }
    
    def chat_interface(self):
        """Interactive chat interface for testing"""
        print("🚁 AFI/DAFI RAG Chat System")
        print("=" * 50)
        print("Ask questions about Air Force Instructions!")
        print("Type 'quit' or 'exit' to stop.")
        print()
        
        while True:
            try:
                query = input("❓ Your question: ").strip()
                
                if query.lower() in ['quit', 'exit', 'q']:
                    print("👋 Goodbye!")
                    break
                
                if not query:
                    continue
                
                print()
                result = self.generate_rag_response(query)
                
                if result["success"]:
                    print("🎯 Answer:")
                    print("-" * 30)
                    print(result["answer"])
                    print()
                    print("📚 Sources:")
                    for source in result["sources"]:
                        print(f"  [{source['reference']}] {source['afi_number']} Ch.{source['chapter']} Para.{source['paragraph']} (Score: {source['similarity_score']:.3f})")
                    print()
                else:
                    print(f"❌ Error: {result['error']}")
                    print()
                    
            except KeyboardInterrupt:
                print("\n👋 Goodbye!")
                break
            except Exception as e:
                print(f"❌ Error: {str(e)}")

def main():
    parser = argparse.ArgumentParser(description="Complete RAG Chat System for AFI/DAFI documents")
    parser.add_argument("--query", help="Single question to ask")
    parser.add_argument("--chroma_dir", default="chroma_storage_openai", help="ChromaDB storage directory")
    parser.add_argument("--n_results", type=int, default=5, help="Number of search results to use for context")
    parser.add_argument("--afi_number", help="Filter by AFI number")
    parser.add_argument("--chapter", help="Filter by chapter")
    parser.add_argument("--folder", help="Filter by folder name")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    parser.add_argument("--interactive", action="store_true", help="Start interactive chat mode")
    
    args = parser.parse_args()
    
    try:
        # Initialize RAG system with silent mode for JSON output
        rag_system = RAGChatSystem(args.chroma_dir, silent=args.json)
        
        if args.interactive:
            # Interactive chat mode
            rag_system.chat_interface()
        elif args.query:
            # Single query mode
            result = rag_system.generate_rag_response(
                user_query=args.query,
                n_results=args.n_results,
                afi_number=args.afi_number,
                chapter=args.chapter,
                folder=args.folder
            )
            
            if args.json:
                # JSON output for programmatic use
                print(json.dumps(result, indent=2))
            else:
                # Human-readable output
                if result["success"]:
                    print(f"Question: {result['query']}")
                    print("=" * 50)
                    print(f"Answer: {result['answer']}")
                    print()
                    print("Sources:")
                    for source in result["sources"]:
                        print(f"  [{source['reference']}] {source['afi_number']} Ch.{source['chapter']} Para.{source['paragraph']} (Score: {source['similarity_score']:.3f})")
                        print(f"      Preview: {source['text_preview']}")
                        print()
                else:
                    print(f"Error: {result['error']}")
        else:
            # No query provided, start interactive mode
            rag_system.chat_interface()
    
    except KeyboardInterrupt:
        print("\nOperation cancelled by user")
        sys.exit(1)
    except Exception as e:
        if args.json:
            print(json.dumps({"error": str(e)}))
        else:
            print(f"Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()