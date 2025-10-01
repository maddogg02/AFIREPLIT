#!/usr/bin/env python3
"""
Test script for Hybrid Prompt Fusion System
Demonstrates the enhanced RAG capabilities with different prompt templates
"""

import os
import sys
import json
from pathlib import Path

# Load environment variables from .env file
def load_env_file():
    """Load environment variables from .env file"""
    env_path = Path(__file__).parent / '.env'
    if env_path.exists():
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip()
        print(f"✅ Loaded environment variables from {env_path}")
    else:
        print(f"⚠️  .env file not found at {env_path}")

# Load environment variables first
load_env_file()

# Add the server scripts directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'server', 'scripts'))

from query.run_rag_chat import RAGChatSystem

def test_hybrid_fusion():
    """Test the hybrid prompt fusion system with different query types"""
    
    print("🧠 Testing Hybrid Prompt Fusion System")
    print("=" * 60)
    
    # Initialize RAG system with hybrid mode enabled
    rag_system = RAGChatSystem("chroma_storage_openai", silent=False, hybrid_mode=True)
    
    # Test queries for different templates
    test_queries = [
        {
            "query": "I found FOD on the flightline, what does this violate?",
            "expected_template": "violation_analysis",
            "description": "Violation detection query"
        },
        {
            "query": "How do I perform a pre-flight inspection?",
            "expected_template": "procedural_guidance", 
            "description": "Procedural guidance query"
        },
        {
            "query": "What are the maintenance requirements for aircraft?",
            "expected_template": "standard",
            "description": "General information query"
        },
        {
            "query": "I discovered improper tool accountability, what AFI does this violate?",
            "expected_template": "violation_analysis",
            "description": "Tool accountability violation"
        },
        {
            "query": "What is the procedure to conduct a TCTO?",
            "expected_template": "procedural_guidance",
            "description": "TCTO procedure query"
        }
    ]
    
    print(f"\\n🎯 Testing {len(test_queries)} queries across different templates...")
    print("\\n" + "=" * 60)
    
    for i, test_case in enumerate(test_queries, 1):
        print(f"\\n🔍 Test {i}/{len(test_queries)}: {test_case['description']}")
        print(f"Query: \"{test_case['query']}\"")
        print(f"Expected Template: {test_case['expected_template']}")
        print("-" * 50)
        
        try:
            # Test template selection
            detected_template = rag_system._select_hybrid_template(test_case['query'])
            template_match = detected_template == test_case['expected_template']
            
            print(f"🎯 Template Detection: {detected_template} {'✅' if template_match else '❌'}")
            
            # Generate response
            result = rag_system.generate_rag_response(
                user_query=test_case['query'],
                model="gpt-4o-mini",  # Use faster model for testing
                n_results=5
            )
            
            if result['success']:
                print(f"\\n📝 Response Preview:")
                # Show first 200 characters of response
                answer_preview = result['answer'][:200] + "..." if len(result['answer']) > 200 else result['answer']
                print(f"{answer_preview}")
                
                print(f"\\n📊 Metadata:")
                print(f"  - Model Used: {result.get('model_used', 'N/A')}")
                print(f"  - Template Used: {result.get('template_used', 'N/A')}")
                print(f"  - Hybrid Mode: {result.get('hybrid_mode', False)}")
                print(f"  - Sources Found: {result.get('search_results_count', 0)}")
                print(f"  - Sources Used: {result.get('filtered_results_count', 0)}")
                
                # Show top source
                if result.get('sources'):
                    top_source = result['sources'][0]
                    print(f"  - Top Source: {top_source['afi_number']} Ch.{top_source['chapter']} Para.{top_source['paragraph']} (Score: {top_source['similarity_score']:.3f})")
                
            else:
                print(f"❌ Error: {result.get('error', 'Unknown error')}")
                
        except Exception as e:
            print(f"❌ Exception: {str(e)}")
        
        print("\\n" + "=" * 60)
    
    print(f"\\n🎉 Hybrid Fusion Testing Complete!")
    
    # Test with hybrid mode disabled for comparison
    print(f"\\n🔄 Testing Legacy Mode (Hybrid Disabled)...")
    rag_system_legacy = RAGChatSystem("chroma_storage_openai", silent=False, hybrid_mode=False)
    
    test_query = "I found FOD on the flightline, what does this violate?"
    
    print(f"Query: \"{test_query}\"")
    print("-" * 50)
    
    result_legacy = rag_system_legacy.generate_rag_response(
        user_query=test_query,
        model="gpt-4o-mini",
        n_results=5
    )
    
    if result_legacy['success']:
        print(f"📝 Legacy Response Preview:")
        answer_preview = result_legacy['answer'][:200] + "..." if len(result_legacy['answer']) > 200 else result_legacy['answer']
        print(f"{answer_preview}")
        print(f"\\n📊 Legacy Metadata:")
        print(f"  - Hybrid Mode: {result_legacy.get('hybrid_mode', False)}")
        print(f"  - Template Used: {result_legacy.get('template_used', 'None (Legacy)')}")
    
    print("\\n" + "=" * 60)
    print("🏁 All Tests Complete!")

def test_template_selection():
    """Test just the template selection logic"""
    print("\\n🎯 Testing Template Selection Logic")
    print("=" * 50)
    
    rag_system = RAGChatSystem("chroma_storage_openai", silent=True, hybrid_mode=True)
    
    test_cases = [
        ("I found FOD on the runway", "violation_analysis"),
        ("What violation does this represent?", "violation_analysis"), 
        ("How to perform maintenance?", "procedural_guidance"),
        ("What are the steps to conduct inspection?", "procedural_guidance"),
        ("What is required for safety?", "standard"),
        ("Tell me about aircraft maintenance", "standard"),
        ("I discovered damage to the aircraft", "violation_analysis"),
        ("Procedure for TCTO implementation", "procedural_guidance")
    ]
    
    for query, expected in test_cases:
        detected = rag_system._select_hybrid_template(query)
        match = "✅" if detected == expected else "❌"
        print(f"{match} \"{query}\" -> {detected} (expected: {expected})")

if __name__ == "__main__":
    try:
        # Test template selection first
        test_template_selection()
        
        # Then test full system
        test_hybrid_fusion()
        
    except KeyboardInterrupt:
        print("\\n🛑 Testing interrupted by user")
    except Exception as e:
        print(f"\\n❌ Testing failed: {str(e)}")
        import traceback
        traceback.print_exc()