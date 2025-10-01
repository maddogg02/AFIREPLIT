#!/usr/bin/env python3
"""
Test the new flexible hybrid prompt fusion approach
"""

import os
import sys
import time
from typing import Dict, Any
from pathlib import Path

# Add the server directory to the Python path
script_dir = Path(__file__).parent
server_dir = script_dir / "server"
sys.path.insert(0, str(server_dir))

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

from scripts.query.run_rag_chat import RAGChatSystem

def test_flexible_fusion():
    """Test the flexible fusion approach with various query types"""
    
    print("🧠 Testing Flexible Hybrid Prompt Fusion")
    print("=" * 50)
    
    # Initialize RAG system with hybrid mode
    chroma_dir = script_dir / "chroma_storage_openai"
    rag_system = RAGChatSystem(
        chroma_dir=str(chroma_dir),
        hybrid_mode=True
    )
    
    # Test queries of different types
    test_queries = [
        "I discovered improper tool accountability during inspection",
        "How do I perform a pre-flight inspection on a C-130?",
        "What are the requirements for FOD prevention?",
        "Tell me about aircraft maintenance documentation",
        "There was an unauthorized modification found on the aircraft",
        "Walk me through the engine troubleshooting procedure",
        "What safety protocols apply to fuel handling?",
        "Explain the quality assurance process"
    ]
    
    results = []
    
    for i, query in enumerate(test_queries, 1):
        print(f"\n📝 Test {i}: {query}")
        print("-" * 40)
        
        try:
            start_time = time.time()
            response = rag_system.generate_rag_response(query, model="gpt-4o-mini")
            end_time = time.time()
            
            # Extract key information
            result = {
                "query": query,
                "response_time": round(end_time - start_time, 2),
                "template_used": response.get("template_used", "unknown"),
                "model_used": response.get("model", "unknown"),
                "response_length": len(response.get("response", "")),
                "context_chunks": len(response.get("context", [])),
                "response": response.get("response", "No response")[:200] + "..." if len(response.get("response", "")) > 200 else response.get("response", "")
            }
            
            results.append(result)
            
            print(f"✅ Template: {result['template_used']}")
            print(f"⚡ Time: {result['response_time']}s")
            print(f"🎯 Model: {result['model_used']}")
            print(f"📄 Context chunks: {result['context_chunks']}")
            print(f"📝 Response preview: {result['response']}")
            
        except Exception as e:
            print(f"❌ Error: {e}")
            results.append({
                "query": query,
                "error": str(e)
            })
    
    # Summary
    print("\n🎯 TEST SUMMARY")
    print("=" * 50)
    
    successful_tests = [r for r in results if "error" not in r]
    failed_tests = [r for r in results if "error" in r]
    
    print(f"✅ Successful tests: {len(successful_tests)}")
    print(f"❌ Failed tests: {len(failed_tests)}")
    
    if successful_tests:
        avg_time = sum(r["response_time"] for r in successful_tests) / len(successful_tests)
        print(f"⚡ Average response time: {avg_time:.2f}s")
        
        templates_used = [r["template_used"] for r in successful_tests]
        print(f"📋 Templates used: {set(templates_used)}")
        
        models_used = [r["model_used"] for r in successful_tests]
        print(f"🤖 Models used: {set(models_used)}")
    
    if failed_tests:
        print("\n❌ FAILED TESTS:")
        for test in failed_tests:
            print(f"   • {test['query']}: {test['error']}")
    
    return results

def test_different_models():
    """Test the flexible approach with different models"""
    
    print("\n🤖 Testing Multiple Models with Flexible Fusion")
    print("=" * 50)
    
    models_to_test = ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"]
    test_query = "How do I handle a hydraulic fluid leak during maintenance?"
    
    for model in models_to_test:
        print(f"\n🧪 Testing model: {model}")
        print("-" * 30)
        
        try:
            chroma_dir = script_dir / "chroma_storage_openai"
            rag_system = RAGChatSystem(
                chroma_dir=str(chroma_dir),
                hybrid_mode=True
            )
            
            start_time = time.time()
            response = rag_system.generate_rag_response(test_query, model=model)
            end_time = time.time()
            
            print(f"✅ Success with {model}")
            print(f"⚡ Time: {round(end_time - start_time, 2)}s")
            print(f"📋 Template: {response.get('template_used', 'unknown')}")
            print(f"📄 Context chunks: {len(response.get('context', []))}")
            
            # Show first part of response to verify it's working
            response_text = response.get("response", "")
            if "**Intent:**" in response_text:
                intent_part = response_text.split("**Answer:**")[0]
                print(f"🎯 Intent identified: {intent_part.replace('**Intent:**', '').strip()}")
            
        except Exception as e:
            print(f"❌ Failed with {model}: {e}")

if __name__ == "__main__":
    # Test flexible fusion approach
    results = test_flexible_fusion()
    
    # Test with different models
    test_different_models()
    
    print("\n🎉 Flexible fusion testing complete!")