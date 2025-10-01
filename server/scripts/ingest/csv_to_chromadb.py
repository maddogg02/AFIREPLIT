#!/usr/bin/env python3
"""
CSV → ChromaDB ingestion pipeline backed by OpenAI embeddings.
Takes the numbered paragraph CSV produced by the PDF parser and writes
documents plus embeddings into the persistent Chroma collection.

Usage:
    python csv_to_chromadb.py --csv_path "dafi21-101_numbered.csv" --doc_id "12345"
"""

import os
# Disable symlinks warning for Windows compatibility
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'

import argparse
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List

import chromadb
import pandas as pd
from openai import OpenAI


class CSVToChromaDBOpenAI:
    def __init__(self, chroma_dir: str):
        """Initialize ChromaDB pipeline with OpenAI embeddings"""
        self.chroma_dir = Path(chroma_dir)
        self.chroma_dir.mkdir(exist_ok=True)
        
        # Initialize OpenAI client
        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")
        
        print("Initializing OpenAI client...")
        self.openai_client = OpenAI(api_key=api_key)
        print("[SUCCESS] OpenAI client initialized")
        
        print("Initializing ChromaDB...")
        self.chroma_client = chromadb.PersistentClient(path=str(self.chroma_dir))
        
        # Use a single collection for all AFI documents
        self.collection_name = "afi_documents_openai"
        try:
            self.collection = self.chroma_client.get_collection(self.collection_name)
            print(f"[SUCCESS] Using existing ChromaDB collection: {self.collection_name}")
        except Exception:
            self.collection = self.chroma_client.create_collection(
                name=self.collection_name,
                metadata={"description": "AFI/DAFI numbered paragraphs with OpenAI embeddings"}
            )
            print(f"[SUCCESS] Created new ChromaDB collection: {self.collection_name}")
    
    def get_openai_embedding(self, text: str, model: str = "text-embedding-3-small") -> List[float]:
        """Get OpenAI embedding for a single text"""
        try:
            response = self.openai_client.embeddings.create(
                input=text,
                model=model
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"[ERROR] Failed to get embedding: {str(e)}")
            return None
    
    def get_openai_embeddings_batch(self, texts: List[str], model: str = "text-embedding-3-small") -> List[List[float]]:
        """Get OpenAI embeddings for a batch of texts with rate limiting"""
        embeddings = []
        batch_size = 100  # OpenAI allows up to 2048 inputs per request
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            
            try:
                print(f"Getting embeddings for batch {i//batch_size + 1}/{(len(texts) + batch_size - 1)//batch_size}")
                response = self.openai_client.embeddings.create(
                    input=batch,
                    model=model
                )
                
                batch_embeddings = [item.embedding for item in response.data]
                embeddings.extend(batch_embeddings)
                
                # Rate limiting - OpenAI allows 3000 RPM for text-embedding-3-small
                if i + batch_size < len(texts):
                    time.sleep(0.1)  # Small delay to avoid rate limits
                    
            except Exception as e:
                print(f"[ERROR] Failed to get embeddings for batch: {str(e)}")
                # Return None for failed embeddings
                embeddings.extend([None] * len(batch))
        
        return embeddings
    
    def remove_existing_afi_documents(self, afi_number: str):
        """Remove existing documents with the same AFI number"""
        try:
            # Get all documents with this AFI number
            existing_docs = self.collection.get(
                where={"afi_number": afi_number}
            )
            
            if existing_docs['ids']:
                print(f"Found {len(existing_docs['ids'])} existing documents for {afi_number}")
                print(f"Removing existing {afi_number} documents to replace with new version...")
                
                # Delete existing documents
                self.collection.delete(
                    ids=existing_docs['ids']
                )
                print(f"[SUCCESS] Removed {len(existing_docs['ids'])} existing documents for {afi_number}")
            else:
                print(f"No existing documents found for {afi_number} - this is a new AFI")
                
        except Exception as e:
            print(f"[WARNING] Error checking for existing documents: {str(e)}")
            # Continue with processing even if removal fails

    def process_csv_to_embeddings(self, csv_path: str, doc_id: str, afi_number_override: str = None) -> Dict[str, Any]:
        """Process CSV file and create OpenAI embeddings for each row"""
        print(f"Reading CSV: {csv_path}")
        
        try:
            df = pd.read_csv(csv_path)
            print(f"Loaded {len(df)} rows from CSV")
            
            if len(df) == 0:
                return {"success": False, "error": "CSV file is empty"}

            original_afi_number = str(df.iloc[0].get('afi_number', 'UNKNOWN'))
            afi_number = original_afi_number
            
            if afi_number_override:
                candidate = str(afi_number_override).strip()
                if candidate:
                    afi_number = candidate
                    print(f"[INFO] Using AFI number override: {afi_number}")

            if afi_number_override and afi_number:
                df['afi_number'] = afi_number

            print(f"Processing AFI: {afi_number}")
            
            # Remove existing documents with the same AFI number (replace functionality)
            self.remove_existing_afi_documents(afi_number)
            if afi_number_override and original_afi_number and original_afi_number != afi_number:
                self.remove_existing_afi_documents(original_afi_number)
            
            # Prepare texts for embedding
            texts = df['text'].astype(str).tolist()
            
            print(f"Generating OpenAI embeddings for {len(texts)} texts...")
            embeddings = self.get_openai_embeddings_batch(texts)
            
            # Filter out failed embeddings
            valid_indices = [i for i, emb in enumerate(embeddings) if emb is not None]
            if len(valid_indices) < len(embeddings):
                print(f"[WARNING] {len(embeddings) - len(valid_indices)} embeddings failed")
            
            # Prepare data for ChromaDB
            documents = []
            metadatas = []
            ids = []
            valid_embeddings = []
            
            for i in valid_indices:
                row = df.iloc[i]
                
                # Create document text
                documents.append(row['text'])
                
                # Create metadata
                metadata = {
                    "doc_id": doc_id,
                    "paragraph": str(row.get('paragraph', '')),
                    "chapter": str(row.get('chapter', '')),
                    "section": str(row.get('section', '')),
                    "page_number": str(row.get('page_number', '')),
                    "afi_number": str(row.get('afi_number', '')),
                    "category": str(row.get('category', '')),
                    "folder": str(row.get('folder', '')),
                    "section_path": str(row.get('section_path', '')),
                    "compliance_tier": str(row.get('compliance_tier', ''))
                }
                metadatas.append(metadata)
                
                # Create unique ID
                ids.append(str(uuid.uuid4()))
                
                # Add valid embedding
                valid_embeddings.append(embeddings[i])
            
            # Add to ChromaDB in batches
            batch_size = 50
            total_rows = len(documents)
            
            for i in range(0, total_rows, batch_size):
                end_idx = min(i + batch_size, total_rows)
                batch_documents = documents[i:end_idx]
                batch_metadatas = metadatas[i:end_idx]
                batch_ids = ids[i:end_idx]
                batch_embeddings = valid_embeddings[i:end_idx]
                
                self._add_batch_to_chromadb(batch_documents, batch_metadatas, batch_ids, batch_embeddings)
                print(f"Progress: {end_idx}/{total_rows} ({(end_idx/total_rows)*100:.1f}%)")
            
            # Get final collection stats
            collection_count = self.collection.count()
            
            print(f"[SUCCESS] OpenAI embeddings stored in ChromaDB collection")
            print(f"AFI {afi_number}: {len(valid_indices)} documents processed")
            print(f"Total documents in collection: {collection_count}")
            
            return {
                "success": True,
                "processed_rows": len(valid_indices),
                "afi_number": afi_number,
                "collection_name": self.collection_name,
                "total_in_collection": collection_count,
                "embedding_model": "text-embedding-3-small",
                "embedding_dimension": 1536  # text-embedding-3-small dimension
            }
            
        except Exception as e:
            return {
                "success": False, 
                "error": f"Processing failed: {str(e)}"
            }
    
    def _add_batch_to_chromadb(self, documents: List[str], metadatas: List[Dict], 
                              ids: List[str], embeddings: List[List[float]]):
        """Add a batch of documents to ChromaDB"""
        try:
            self.collection.add(
                documents=documents,
                metadatas=metadatas,
                ids=ids,
                embeddings=embeddings
            )
            print(f"[SUCCESS] Processed batch of {len(documents)} embeddings")
        except Exception as e:
            print(f"Error adding batch to ChromaDB: {str(e)}")
    
    def search_documents(self, query: str, n_results: int = 5, 
                        filter_metadata: Dict = None) -> List[Dict]:
        """Search documents using semantic similarity with OpenAI embeddings"""
        try:
            # Generate embedding for the search query using OpenAI
            query_embedding = self.get_openai_embedding(query)
            if query_embedding is None:
                return []
            
            # Search the collection
            search_params = {
                "query_embeddings": [query_embedding],
                "n_results": n_results
            }
            
            # Add metadata filtering if provided
            if filter_metadata:
                search_params["where"] = filter_metadata
            
            results = self.collection.query(**search_params)
            
            # Format results for easy consumption
            formatted_results = []
            
            for i in range(len(results['documents'][0])):
                result = {
                    "id": results['ids'][0][i],
                    "text": results['documents'][0][i],
                    "metadata": results['metadatas'][0][i],
                    "similarity_score": 1 - results['distances'][0][i]  # Convert distance to similarity
                }
                formatted_results.append(result)
            
            return formatted_results
            
        except Exception as e:
            print(f"[ERROR] Search failed: {str(e)}")
            return []
    
    def get_collection_stats(self) -> Dict[str, Any]:
        """Get statistics about the ChromaDB collection"""
        try:
            collection_count = self.collection.count()
            
            # Get sample of metadata to understand structure
            sample_results = self.collection.query(
                query_embeddings=[[0.0] * 1536],  # Dummy embedding for text-embedding-3-small
                n_results=1
            )
            
            sample_metadata = sample_results['metadatas'][0][0] if sample_results['metadatas'][0] else {}
            
            # Get unique values for key fields
            all_results = self.collection.get()
            afi_numbers = list(set([meta.get('afi_number', '') for meta in all_results['metadatas'] if meta.get('afi_number')]))
            chapters = list(set([meta.get('chapter', '') for meta in all_results['metadatas'] if meta.get('chapter')]))
            folders = list(set([meta.get('folder', '') for meta in all_results['metadatas'] if meta.get('folder')]))
            
            stats = {
                "collection_name": self.collection_name,
                "total_documents": collection_count,
                "embedding_model": "text-embedding-3-small",
                "embedding_dimension": 1536,
                "sample_metadata_keys": list(sample_metadata.keys()),
                "afi_numbers": afi_numbers[:10],  # Limit to first 10
                "chapters": sorted(chapters)[:15],  # Limit to first 15
                "folders": folders
            }
            
            return stats
            
        except Exception as e:
            return {"error": str(e)}

def main():
    parser = argparse.ArgumentParser(description="Convert CSV to ChromaDB with OpenAI embeddings")
    parser.add_argument("--csv_path", required=True, help="Path to the CSV file")
    parser.add_argument("--doc_id", required=True, help="Document ID for metadata")
    parser.add_argument("--chroma_dir", default="chroma_storage_openai", help="ChromaDB storage directory")
    parser.add_argument("--afi_number_override", help="Override AFI number for metadata", default=None)
    
    args = parser.parse_args()
    
    try:
        # Initialize pipeline
        pipeline = CSVToChromaDBOpenAI(args.chroma_dir)
        
        # Process CSV to embeddings
        result = pipeline.process_csv_to_embeddings(args.csv_path, args.doc_id, args.afi_number_override)
        
        if result["success"]:
            print(f"\n[SUCCESS] Complete!")
            print(f"Processed {result['processed_rows']} rows")
            print(f"Collection: {result['collection_name']}")
            print(f"Total documents: {result['total_in_collection']}")
            print(f"Embedding model: {result['embedding_model']}")
            print(f"Embedding dimension: {result['embedding_dimension']}")
            
            # Show collection stats
            stats = pipeline.get_collection_stats()
            print(f"\nCollection Statistics:")
            for key, value in stats.items():
                if key not in ['sample_metadata_keys']:
                    print(f"  {key}: {value}")
            
            # Test search functionality
            print(f"\nTesting search with query: 'maintenance procedures'")
            search_results = pipeline.search_documents("maintenance procedures", n_results=3)
            if search_results:
                print(f"Found {len(search_results)} test results:")
                for i, result in enumerate(search_results, 1):
                    print(f"  {i}. {result['metadata']['paragraph']}: {result['text'][:100]}...")
                    print(f"     Score: {result['similarity_score']:.3f}")
        else:
            print(f"[ERROR] Failed: {result['error']}")
            
    except Exception as e:
        print(f"Error: {str(e)}")
        raise


if __name__ == "__main__":
    main()
