#!/usr/bin/env python3
"""
Batch ingestion utility - Process all PDFs in temp/ folder
"""

import os
import sys
import subprocess
from pathlib import Path
from dotenv import load_dotenv

def main():
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent.parent
    temp_dir = project_root / "temp"
    
    # Load environment variables from .env file
    env_file = project_root / ".env"
    if env_file.exists():
        load_dotenv(env_file)
        print(f"Loaded environment from {env_file}")
    else:
        print(f"Warning: .env file not found at {env_file}")
    
    if not temp_dir.exists():
        print(f"Error: temp directory not found at {temp_dir}")
        sys.exit(1)
    
    # Find all PDFs
    pdf_files = list(temp_dir.glob("*.pdf"))
    
    if not pdf_files:
        print("No PDF files found in temp/ directory")
        sys.exit(0)
    
    print(f"Found {len(pdf_files)} PDF files to process:")
    for pdf in pdf_files:
        print(f"  - {pdf.name}")
    print()
    
    # Process each PDF
    parser_script = script_dir / "extract_numbered_paragraphs.py"
    csv_processor = script_dir / "csv_to_chromadb.py"
    
    processed = 0
    failed = []
    
    for pdf_file in pdf_files:
        pdf_name = pdf_file.stem
        csv_path = temp_dir / f"{pdf_name}_numbered.csv"
        
        print(f"\n{'='*60}")
        print(f"Processing: {pdf_file.name}")
        print(f"{'='*60}\n")
        
        try:
            # Step 1: Extract paragraphs
            print("[1/2] Extracting numbered paragraphs...")
            result = subprocess.run(
                [
                    sys.executable,
                    str(parser_script),
                    "--pdf_path", str(pdf_file),
                    "--output_csv", str(csv_path),
                    "--original_name", pdf_file.name
                ],
                capture_output=True,
                text=True,
                check=True,
                env=os.environ.copy()
            )
            print(result.stdout)
            
            if not csv_path.exists():
                raise Exception(f"CSV not created: {csv_path}")
            
            # Step 2: Generate embeddings and load to ChromaDB
            print("\n[2/2] Generating embeddings and loading to ChromaDB...")
            
            # Extract doc_id from PDF filename (stem without extension)
            doc_id = pdf_file.stem.lower().replace(' ', '_').replace('-', '_')
            
            result = subprocess.run(
                [
                    sys.executable,
                    str(csv_processor),
                    "--csv_path", str(csv_path),
                    "--doc_id", doc_id
                ],
                capture_output=True,
                text=True,
                check=True,
                env=os.environ.copy()
            )
            print(result.stdout)
            
            processed += 1
            print(f"\n✓ Successfully processed: {pdf_file.name}")
            
        except subprocess.CalledProcessError as e:
            failed.append(pdf_file.name)
            print(f"\n✗ Failed to process {pdf_file.name}")
            print(f"Error: {e.stderr}")
        except Exception as e:
            failed.append(pdf_file.name)
            print(f"\n✗ Failed to process {pdf_file.name}")
            print(f"Error: {str(e)}")
    
    # Summary
    print(f"\n{'='*60}")
    print("BATCH PROCESSING COMPLETE")
    print(f"{'='*60}")
    print(f"Total PDFs: {len(pdf_files)}")
    print(f"Processed successfully: {processed}")
    print(f"Failed: {len(failed)}")
    
    if failed:
        print("\nFailed files:")
        for name in failed:
            print(f"  - {name}")
        sys.exit(1)
    else:
        print("\n✓ All documents processed and ready for search!")

if __name__ == "__main__":
    main()
