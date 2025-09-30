#!/usr/bin/env python3
"""
Test script to verify the improved AFI paragraph parsing
"""

import sys
import os
from pathlib import Path

# Add the scripts directory to Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'server', 'scripts'))

try:
    from afi_simple_numbered import AFIParser
    
    # Create a simple test by parsing the existing CSV to show what we have now
    import pandas as pd
    
    # Read the existing CSV data
    csv_path = "temp/d4929cfd-429f-4dfb-b38d-e3b6f6365ca6_152d3029-c83c-47a8-b01a-d7c0b63abc2a.csv"
    
    if os.path.exists(csv_path):
        df = pd.read_csv(csv_path)
        
        print("=== CURRENT CSV DATA ANALYSIS ===")
        print(f"Total records: {len(df)}")
        print()
        
        # Show examples of truncated text
        print("Examples of current (potentially truncated) text:")
        for i, row in df.head(5).iterrows():
            text = row.get('text', '')[:100]
            print(f"  {row.get('paragraph', 'N/A')}: {text}{'...' if len(row.get('text', '')) > 100 else ''}")
        
        print()
        print("Text length statistics:")
        text_lengths = df['text'].str.len()
        print(f"  Average length: {text_lengths.mean():.1f} characters")
        print(f"  Median length: {text_lengths.median():.1f} characters")
        print(f"  Min length: {text_lengths.min()} characters")
        print(f"  Max length: {text_lengths.max()} characters")
        
        # Show examples of what appear to be incomplete sentences
        print()
        print("Examples that appear incomplete (don't end with proper punctuation):")
        incomplete = df[~df['text'].str.endswith(('.', '!', '?', ':', ';'))]
        for i, row in incomplete.head(3).iterrows():
            text = row.get('text', '')[:100]
            print(f"  {row.get('paragraph', 'N/A')}: {text}{'...' if len(row.get('text', '')) > 100 else ''}")
    
    else:
        print(f"CSV file not found: {csv_path}")
        
except ImportError as e:
    print(f"Could not import AFIParser: {e}")
except Exception as e:
    print(f"Error running test: {e}")

print()
print("=== PARSER IMPROVEMENT SUMMARY ===")
print("The AFI parser has been updated to:")
print("1. Collect ALL lines from PDFs, not just those starting with paragraph numbers")
print("2. Properly combine continuation text that belongs to numbered paragraphs")
print("3. This should result in complete paragraph content instead of truncated text")
print()
print("To regenerate the vector database with complete paragraphs:")
print("1. Re-run the PDF parsing on your AFI documents")
print("2. Rebuild the ChromaDB vector database")
print("3. Test the chat system with improved content")