#!/usr/bin/env python3
"""
Complete RAG Chat System with OpenAI
Now supports --model flag to choose GPT model (default: gpt-4o-mini)

Usage:
    python rag_chat_openai.py --query "I found FOD on the flightline, what does this violate?" --model gpt-4o-mini
"""

import os
# Disable symlinks warning for Windows compatibility
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'

import chromadb
from openai import OpenAI
import argparse
import json
import sys
import re
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
            # Normalize query with "query: " prefix for better embedding consistency
            query_text = "query: " + text.strip()
            response = self.openai_client.embeddings.create(
                input=query_text,
                model=model
            )
            return response.data[0].embedding
        except Exception as e:
            if not self.silent:  # Only print to stdout if not in JSON mode
                print(f"[ERROR] Failed to get embedding: {str(e)}")
            else:  # In JSON mode, print to stderr
                print(f"[ERROR] Failed to get embedding: {str(e)}", file=sys.stderr)
            return None
    
    def _get_completion_params(self, model: str, max_tokens: int = 1000) -> Dict[str, Any]:
        """Get appropriate completion parameters based on model type"""
        params = {"model": model}
        
        if model.startswith("gpt-5"):
            params["max_completion_tokens"] = max_tokens
            # GPT-5 doesn't support temperature parameter, leave at default
        else:
            params["max_tokens"] = max_tokens
            params["temperature"] = 0.1  # Low temperature for consistent, factual responses
        
        return params
    
    def _resolve_afi_filter(self, afi_number: str, folder: str = None) -> str:
        """Resolve AFI number format and find the correct variant in the database"""
        if not afi_number:
            return None
            
        # If already has AFI/DAFI prefix, use as-is
        if afi_number.upper().startswith(('AFI', 'DAFI')):
            return afi_number
        
        # Try both AFI and DAFI prefixes to find which exists
        afi_search_variants = [f"AFI {afi_number}", f"DAFI {afi_number}"]
        
        for variant in afi_search_variants:
            test_filter = {"afi_number": variant}
            if folder:
                test_filter["folder"] = folder
            
            # Quick test search to see if this variant exists
            test_results = self.search_documents("test", 1, test_filter)
            if test_results:
                return variant
        
        # If no variants found, return original
        return afi_number
    
    def _is_content_useful(self, text: str, metadata: Dict[str, Any]) -> bool:
        """
        Filter out TOC entries, headers, and other non-useful content
        """
        if not text or len(text.strip()) < 10:
            return False
            
        text_lower = text.lower().strip()
        
        # Filter out obvious TOC entries and headers
        toc_patterns = [
            r'^chapter \d+',
            r'^\d+\.\d+\s+(section|chapter|role|purpose|scope|definitions?|overview)',
            r'^table of contents?',
            r'^section [ivx]+',
            r'^appendix [a-z]',
            r'^\d+\.\s*[a-z\s]+\.$',  # Short numbered items ending with period
        ]
        
        for pattern in toc_patterns:
            if re.match(pattern, text_lower):
                if not self.silent:
                    print(f"[FILTER] Excluding TOC/Header: {text[:50]}...")
                return False
        
        # Don't filter out single word/phrase titles if they contain important keywords
        important_keywords = ['grounding', 'fod', 'debris', 'maintenance', 'safety', 'inspection', 'aircraft', 'flight']
        if any(keyword in text_lower for keyword in important_keywords):
            return True  # Keep content with important keywords even if short
        
        # Filter out very short content (likely headers) unless it has important keywords
        if len(text) < 30:
            if not self.silent:
                print(f"[FILTER] Excluding short content: {text[:50]}...")
            return False
            
        # Filter out content that's mostly numbers and dots
        alpha_chars = sum(c.isalpha() for c in text)
        if alpha_chars < 10:  # Less than 10 alphabetic characters
            if not self.silent:
                print(f"[FILTER] Excluding non-text content: {text[:50]}...")
            return False
            
        return True
    
    def enhance_query_for_search(self, user_query: str) -> str:
        """
        Enhance user query with AFI-specific terminology for better semantic search
        """
        query_lower = user_query.lower()
        
        # Map common user terms to AFI terminology
        enhancements = []
        
        if any(term in query_lower for term in ['fod', 'foreign object', 'debris']):
            enhancements.extend(['fod', 'debris', 'foreign object'])
        
        if any(term in query_lower for term in ['grounding point', 'ground point']):
            enhancements.extend(['grounding points', 'clean', 'debris'])
        
        if any(term in query_lower for term in ['violation', 'violate', 'found']):
            enhancements.extend(['requirement', 'standard', 'shall', 'must'])
        
        if any(term in query_lower for term in ['qa', 'quality', 'inspector']):
            enhancements.extend(['quality assurance', 'responsibilities', 'duties'])
        
        # Combine original query with enhancements
        if enhancements:
            enhanced_query = f"{user_query} {' '.join(set(enhancements))}"
            if not self.silent:
                print(f"[QUERY] Enhanced: '{user_query}' → '{enhanced_query}'")
            return enhanced_query
        
        return user_query
    
    def search_documents(self, query: str, n_results: int = 5, 
                        filter_metadata: Dict = None, min_score: float = 0.6) -> List[Dict[str, Any]]:
        """Search for relevant documents using semantic similarity with content filtering"""
        try:
            # Enhance query for better AFI terminology matching
            enhanced_query = self.enhance_query_for_search(query)
            
            # Generate embedding for the search query
            query_embedding = self.get_openai_embedding(enhanced_query)
            if query_embedding is None:
                return []
            
            # Prepare search parameters - get more candidates for content filtering
            search_params = {
                "query_embeddings": [query_embedding],
                "n_results": min(n_results * 4, 25)  # Get 4x more to filter through content
            }
            
            # Add metadata filtering if provided
            if filter_metadata:
                search_params["where"] = filter_metadata
            
            # Execute search
            results = self.collection.query(**search_params)
            
            # Format results with deduplication, similarity filtering, and content filtering
            formatted_results = []
            seen_texts = set()  # Track duplicate texts
            
            for i in range(len(results['documents'][0])):
                # Calculate similarity score (ChromaDB returns distances)
                distance = results['distances'][0][i]
                similarity_score = 1 - distance
                
                # Skip results below minimum similarity threshold
                if similarity_score < min_score:
                    continue
                
                text = results['documents'][0][i]
                metadata = results['metadatas'][0][i]
                
                if not self.silent:
                    print(f"[DEBUG] Found document {i+1}: {text[:100]}... (similarity: {similarity_score:.3f})")
                
                # Apply content filtering to exclude TOC/headers
                if not self._is_content_useful(text, metadata):
                    continue
                
                # Create a unique key for deduplication
                unique_key = f"{text[:100]}_{metadata.get('afi_number', '')}_{metadata.get('paragraph', '')}"
                
                # Skip if we've seen this content before
                if unique_key in seen_texts:
                    continue
                
                seen_texts.add(unique_key)
                
                result = {
                    "id": results['ids'][0][i],
                    "text": text,
                    "metadata": metadata,
                    "similarity_score": similarity_score,
                    "distance": distance
                }
                formatted_results.append(result)
            
            return formatted_results[:n_results]  # Return only the requested number
            
        except Exception as e:
            if not self.silent:  # Only print to stdout if not in JSON mode
                print(f"[ERROR] Search failed: {str(e)}")
            else:  # In JSON mode, print to stderr
                print(f"[ERROR] Search failed: {str(e)}", file=sys.stderr)
            return []
    
    def relevance_filter(self, query: str, results: List[Dict[str, Any]], model: str = "gpt-5") -> List[Dict[str, Any]]:
        """
        Ask GPT to judge if each result is relevant to the query.
        If GPT-5 is selected, fallback to gpt-4o-mini for filtering
        to avoid reasoning token stalls.
        Returns a filtered list of relevant docs.
        """
        if not results:
            return []
        
        # ✅ Fallback model for filtering
        filter_model = "gpt-4o-mini" if model.startswith("gpt-5") else model
        
        try:
            system_prompt = (
                "You are a filter for Air Force instruction content. Your job is to identify passages that contain information relevant to the user's question.\n\n"
                "REJECT only these types of content:\n"
                "- Pure table of contents entries with no explanation\n"
                "- Section headers with no additional content\n"
                "- Navigation elements that only reference other sections\n\n"
                "KEEP these types of content:\n"
                "- Any text that explains procedures, duties, or responsibilities\n"
                "- Requirements, standards, or compliance information\n"
                "- Explanations of processes, policies, or safety measures\n"
                "- Questions or statements that relate to the user's query\n"
                "- Any substantive paragraphs that provide context or details\n"
                "- Even brief statements if they contain actionable information\n\n"
                "Be somewhat permissive - when in doubt, include the passage rather than exclude it.\n"
                "Respond ONLY with a JSON array of passage numbers."
            )
            
            user_prompt = f"Question: {query}\n\nThe user needs specific duties, responsibilities, procedures, or requirements - NOT section titles or table of contents entries.\n\nPassages:\n"
            for i, result in enumerate(results, 1):
                text = result["text"]
                if len(text) > 500:  # Increased from 300 to give more context
                    text = text[:500] + "..."
                user_prompt += f"[{i}] {text}\n\n"
            
            # Add debug output to see what GPT is evaluating
            if not self.silent:
                print(f"[DEBUG] Relevance filter evaluating {len(results)} passages:")
                for i, result in enumerate(results, 1):
                    preview = result["text"][:100] + "..." if len(result["text"]) > 100 else result["text"]
                    print(f"  [{i}] {preview}")
            
            user_prompt += (
                "Return ONLY a JSON array of passage numbers that contain substantive, actionable content "
                "that helps answer the question (e.g., [1,3,5]). Exclude table of contents, headers, "
                "and navigation elements. If none contain useful content, return []."
            )
            
            chat_params = {
                "model": filter_model,  # ✅ use fallback
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
            }
            
            if filter_model.startswith("gpt-5"):
                chat_params["max_completion_tokens"] = 200
            else:
                chat_params["max_tokens"] = 200
                chat_params["temperature"] = 0.1
            
            if not self.silent:
                print(f"🤖 Making relevance call to {filter_model} (fallback from {model})" if filter_model != model else f"🤖 Making relevance call to {filter_model}")
            
            response = self.openai_client.chat.completions.create(**chat_params)
            response_content = response.choices[0].message.content.strip()
            
            # Debug output to see what GPT decided
            if not self.silent:
                print(f"🔍 GPT relevance response: '{response_content}'")
                print(f"🔍 Response length: {len(response_content) if response_content else 0}")
                if hasattr(response, 'usage'):
                    print(f"🔍 Token usage: {response.usage}")
            
            # Handle empty or whitespace-only responses
            if not response_content:
                if not self.silent:
                    print(f"⚠️  Empty relevance response, rejecting all results")
                return []
            
            # Parse the JSON response
            try:
                keep_indices = json.loads(response_content)
                if not isinstance(keep_indices, list):
                    raise ValueError("Response is not a list")
            except (json.JSONDecodeError, ValueError) as e:
                if not self.silent:
                    print(f"⚠️  JSON parse error: {e}")
                # Fallback: try to extract numbers from the response
                import re
                numbers = re.findall(r'\d+', response_content)
                keep_indices = [int(n) for n in numbers if 1 <= int(n) <= len(results)]
                if not keep_indices:
                    # If parsing fails completely, reject all rather than keep all for safety
                    if not self.silent:
                        print(f"⚠️  Failed to parse relevance filter response, rejecting all results for safety")
                    return []
            
            # Filter results based on GPT's evaluation
            filtered_results = []
            for i in keep_indices:
                if 1 <= i <= len(results):
                    filtered_results.append(results[i-1])
            
            if not self.silent:
                print(f"🎯 Relevance filter: {len(results)} → {len(filtered_results)} documents")
            
            return filtered_results
            
        except Exception as e:
            if not self.silent:
                print(f"⚠️  Relevance filter failed: {str(e)}, keeping all results")
            return results
    
    def generate_rag_response(self, user_query: str, n_results: int = 10, 
                             afi_number: str = None, chapter: str = None, folder: str = None, model: str = "gpt-5") -> Dict[str, Any]:
        """Complete RAG: Search + Filter + Generate natural language response using two-stage pipeline"""
        try:
            if not self.silent:
                print(f"🔍 Stage 1: Searching for relevant content (retrieving top {n_results} candidates)...")
            
            # Stage 1: Search for relevant documents (retrieve generously)
            filter_metadata = {}
            if afi_number:
                resolved_afi = self._resolve_afi_filter(afi_number, folder)
                filter_metadata["afi_number"] = resolved_afi
            if chapter:
                filter_metadata["chapter"] = chapter
            if folder:
                filter_metadata["folder"] = folder
            
            search_results = self.search_documents(
                user_query, 
                n_results, 
                filter_metadata if filter_metadata else None,
                min_score=0.01  # Further lowered threshold to catch more relevant results
            )
            
            if not search_results:
                return {
                    "success": False,
                    "error": "No relevant documents found",
                    "query": user_query
                }
            
            if not self.silent:
                print(f"✅ Stage 1: Found {len(search_results)} candidate documents")
            
            # Stage 2: Relevance reasoning filter
            filter_model = "gpt-4o-mini" if model.startswith("gpt-5") else model
            if not self.silent:
                print(f"🧠 Stage 2: Filtering for relevance using {filter_model}" + (f" (fallback from {model})" if filter_model != model else ""))
            
            filtered_results = self.relevance_filter(user_query, search_results, model)
            
            if not filtered_results:
                return {
                    "success": False,
                    "error": "No documents passed relevance filtering",
                    "query": user_query,
                    "initial_results": len(search_results),
                    "debug_candidates": [
                        {
                            "afi_number": r['metadata'].get('afi_number', 'N/A'),
                            "paragraph": r['metadata'].get('paragraph', 'N/A'),
                            "similarity_score": r['similarity_score'],
                            "text_preview": r['text'][:200] + "..." if len(r['text']) > 200 else r['text']
                        } for r in search_results[:3]  # Show top 3 candidates that were rejected
                    ]
                }
            
            # Stage 3: Prepare context from filtered search results
            if not self.silent:
                print(f"📝 Stage 3: Generating response from {len(filtered_results)} relevant documents...")
            
            context_parts = []
            sources = []
            
            for i, result in enumerate(filtered_results, 1):
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
                    "text_preview": result['text']  # Show full text instead of truncating
                })
            
            context = "\n\n".join(context_parts)
            
            # Create the prompt for OpenAI
            system_prompt = """You are an Air Force Instructions (AFI) expert assistant. Your job is to provide specific, actionable answers based on the provided AFI/DAFI context.

Guidelines:
- Answer the user's question directly and specifically
- If they're asking about violations or compliance, state what AFI/DAFI requirement applies
- Use clear, direct language about what is required or prohibited
- If they found a violation, explain what standard is being violated
- Be factual and precise - this is for operational compliance
- Do NOT include reference numbers in your response - those will be shown separately

Context from relevant AFI/DAFI paragraphs:
{context}"""
            
            user_prompt = f"Question: {user_query}\n\nBased on the AFI/DAFI context provided, answer the user's question directly and specifically. Focus on requirements, violations, or compliance issues if that's what they're asking about."
            
            if not self.silent:
                print(f"🤖 Generating response with {model}...")
            
            # Generate response with OpenAI using helper
            chat_params = self._get_completion_params(model, max_tokens=1000)
            chat_params["messages"] = [
                {"role": "system", "content": system_prompt.format(context=context)},
                {"role": "user", "content": user_prompt}
            ]
            
            response = self.openai_client.chat.completions.create(**chat_params)
            
            generated_answer = response.choices[0].message.content
            
            if not self.silent:
                print(f"✅ Two-stage RAG response generated successfully")
            
            return {
                "success": True,
                "query": user_query,
                "answer": generated_answer,
                "sources": sources,
                "search_results_count": len(search_results),
                "filtered_results_count": len(filtered_results),
                "model_used": model,
                "filter_model_used": filter_model,
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
    parser.add_argument("--n_results", type=int, default=10, help="Number of search results to use for context")
    parser.add_argument("--afi_number", help="Filter by AFI number")
    parser.add_argument("--chapter", help="Filter by chapter")
    parser.add_argument("--folder", help="Filter by folder name")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    parser.add_argument("--interactive", action="store_true", help="Start interactive chat mode")
    parser.add_argument("--model", default="gpt-5", help="OpenAI model to use (default: gpt-5)")
    
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
                folder=args.folder,
                model=args.model
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