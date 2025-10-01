#!/usr/bin/env python3
"""
Test script for Model-Agnostic Hybrid Prompt Fusion
Tests the system with different models to ensure true model agnosticism
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

def test_model_agnostic_fusion():
    """Test hybrid fusion with different models"""
    
    print("🤖 Testing Model-Agnostic Hybrid Prompt Fusion")
    print("=" * 60)
    
    # Test with different models
    test_models = [
        "gpt-4o-mini",
        "gpt-4o", 
        "gpt-4-turbo",
        "gpt-5"  # This will use fallback for filtering but main model for generation
    ]
    
    test_query = "I found FOD on the flightline, what does this violate?"
    
    print(f"\\n🎯 Testing query: \"{test_query}\"")
    print("\\n" + "=" * 60)
    
    for i, model in enumerate(test_models, 1):
        print(f"\\n🔍 Test {i}/{len(test_models)}: Model {model}")
        print("-" * 50)
        
        try:
            # Initialize RAG system with hybrid mode enabled
            rag_system = RAGChatSystem("chroma_storage_openai", silent=False, hybrid_mode=True)
            
            # Generate response
            result = rag_system.generate_rag_response(
                user_query=test_query,
                model=model,
                n_results=3  # Fewer results for faster testing
            )
            
            if result['success']:
                print(f"\\n📝 Response Summary:")
                # Show first 150 characters of response
                answer_preview = result['answer'][:150] + "..." if len(result['answer']) > 150 else result['answer']
                print(f"{answer_preview}")
                
                print(f"\\n📊 Model Performance:")
                print(f"  - Model Used: {result.get('model_used', 'N/A')}")
                print(f"  - Template Used: {result.get('template_used', 'N/A')}")
                print(f"  - Hybrid Mode: {result.get('hybrid_mode', False)}")
                print(f"  - Sources Found: {result.get('search_results_count', 0)}")
                print(f"  - Sources Used: {result.get('filtered_results_count', 0)}")
                
                # Validate model was actually used
                if result.get('model_used') == model:
                    print(f"  ✅ Correct model used: {model}")
                else:
                    print(f"  ❌ Model mismatch: requested {model}, used {result.get('model_used')}")
                
                # Check intent classification instead of rigid template names
                structured_intent = (result.get('structured_intent') or '').lower()
                if structured_intent:
                    print(f"  ✅ Intent detected: {structured_intent}")
                else:
                    print("  ⚠️  Intent missing from response")
                
            else:
                print(f"❌ Error with {model}: {result.get('error', 'Unknown error')}")
                
        except Exception as e:
            print(f"❌ Exception with {model}: {str(e)}")
        
        print("\\n" + "=" * 60)
    
    print(f"\\n🎉 Model-Agnostic Testing Complete!")

def test_template_consistency():
    """Test that template selection is consistent across models"""
    print(f"\\n🎯 Testing Template Consistency Across Models")
    print("=" * 60)
    
    # Test queries for each template type
    template_tests = [
        {
            "query": "I discovered improper tool accountability", 
            "expected": "flexible"
        },
        {
            "query": "How do I perform a pre-flight inspection?",
            "expected": "flexible" 
        },
        {
            "query": "What are the maintenance documentation requirements?",
            "expected": "flexible"
        }
    ]
    
    models_to_test = ["gpt-4o-mini", "gpt-4o"]
    
    for test_case in template_tests:
        print(f"\\n📝 Query: \"{test_case['query']}\"")
        print(f"Expected Template: {test_case['expected']}")
        print("-" * 50)
        
        for model in models_to_test:
            try:
                rag_system = RAGChatSystem("chroma_storage_openai", silent=True, hybrid_mode=True)
                detected_template = rag_system._select_hybrid_template(test_case['query'])
                
                match_icon = "✅" if detected_template == test_case['expected'] else "❌"
                print(f"{match_icon} {model}: {detected_template}")
                
            except Exception as e:
                print(f"❌ {model}: Error - {str(e)}")
    
    print("\\n" + "=" * 60)

def test_legacy_vs_hybrid():
    """Compare legacy mode vs hybrid mode responses"""
    print(f"\\n🔄 Testing Legacy vs Hybrid Mode Comparison")
    print("=" * 60)
    
    test_query = "What violation does FOD on the flightline represent?"
    model = "gpt-4o-mini"  # Use consistent model for fair comparison
    
    print(f"Query: \"{test_query}\"")
    print(f"Model: {model}")
    print("-" * 50)
    
    try:
        # Test Hybrid Mode
        print("\\n🧠 HYBRID MODE:")
        rag_hybrid = RAGChatSystem("chroma_storage_openai", silent=False, hybrid_mode=True)
        result_hybrid = rag_hybrid.generate_rag_response(test_query, model=model, n_results=3)
        
        if result_hybrid['success']:
            print(f"Template: {result_hybrid.get('template_used', 'N/A')}")
            answer_preview = result_hybrid['answer'][:200] + "..." if len(result_hybrid['answer']) > 200 else result_hybrid['answer']
            print(f"Response: {answer_preview}")
        
        # Test Legacy Mode  
        print("\\n📜 LEGACY MODE:")
        rag_legacy = RAGChatSystem("chroma_storage_openai", silent=False, hybrid_mode=False)
        result_legacy = rag_legacy.generate_rag_response(test_query, model=model, n_results=3)
        
        if result_legacy['success']:
            answer_preview = result_legacy['answer'][:200] + "..." if len(result_legacy['answer']) > 200 else result_legacy['answer']
            print(f"Response: {answer_preview}")
        
        # Compare
        print("\\n📊 COMPARISON:")
        print(f"Hybrid Sources: {result_hybrid.get('filtered_results_count', 0)}")
        print(f"Legacy Sources: {result_legacy.get('filtered_results_count', 0)}")
        print(f"Hybrid Length: {len(result_hybrid.get('answer', ''))}")
        print(f"Legacy Length: {len(result_legacy.get('answer', ''))}")
        
    except Exception as e:
        print(f"❌ Comparison failed: {str(e)}")
    
    print("\\n" + "=" * 60)

if __name__ == "__main__":
    try:
        # Test template consistency first (fast)
        test_template_consistency()
        
        # Test model agnosticism (slower)
        test_model_agnostic_fusion()
        
        # Compare modes (moderate)
        test_legacy_vs_hybrid()
        
        print("\\n🏁 All Model-Agnostic Tests Complete!")
        
    except KeyboardInterrupt:
        print("\\n🛑 Testing interrupted by user")
    except Exception as e:
        print(f"\\n❌ Testing failed: {str(e)}")
        import traceback
        traceback.print_exc()