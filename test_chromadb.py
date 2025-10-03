#!/usr/bin/env python3
"""Quick ChromaDB diagnostic test to identify the issue."""

import argparse
import os
import sys

print(f"Python version: {sys.version}")
print(f"Python executable: {sys.executable}")
print(f"Platform: {sys.platform}")
print()

# Test 1: Import ChromaDB
print("Test 1: Importing ChromaDB...")
try:
    import chromadb
    print(f"✅ ChromaDB imported successfully (version: {chromadb.__version__})")
except Exception as e:
    print(f"❌ Failed to import ChromaDB: {e}")
    sys.exit(1)

# Parse arguments / environment
parser = argparse.ArgumentParser(description="ChromaDB diagnostics")
parser.add_argument(
    "--chroma-dir",
    default=os.environ.get("CHROMA_DIAGNOSTIC_DIR")
    or os.path.join(os.getcwd(), "chroma_storage_openai"),
    help="Path to the ChromaDB persistent directory (default: ./chroma_storage_openai)",
)
args = parser.parse_args()

# Test 2: Create client
print("\nTest 2: Creating ChromaDB client...")
try:
    os.makedirs(args.chroma_dir, exist_ok=True)
    client = chromadb.PersistentClient(path=args.chroma_dir)
    print(f"✅ ChromaDB client created successfully")
except Exception as e:
    print(f"❌ Failed to create ChromaDB client: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 3: List collections
print("\nTest 3: Listing collections...")
try:
    collections = client.list_collections()
    print(f"✅ Found {len(collections)} collections")
    for col in collections:
        print(f"   - {col.name}")
except Exception as e:
    print(f"❌ Failed to list collections: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 4: Create/get a test collection
print("\nTest 4: Creating test collection...")
try:
    test_collection = client.get_or_create_collection("diagnostic_test_collection")
    print(f"✅ Test collection created/retrieved successfully")
    
    # Try to add a document
    test_collection.add(
        documents=["This is a test document"],
        ids=["test-1"],
        metadatas=[{"source": "test"}]
    )
    print(f"✅ Added test document successfully")
    
    # Query it
    count = test_collection.count()
    print(f"✅ Collection has {count} documents")

    # Clean up diagnostic collection to avoid polluting production data
    client.delete_collection("diagnostic_test_collection")
    print("🧹 Diagnostic collection removed")
    
except Exception as e:
    print(f"❌ Failed collection operations: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n" + "=" * 50)
print("✅ All ChromaDB tests passed!")
print("=" * 50)
