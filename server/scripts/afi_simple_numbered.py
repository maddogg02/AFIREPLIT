#!/usr/bin/env python3
"""
Simplified AFI/DAFI PDF Parser - Extract all numbered paragraphs and chapters
Captures every numbered paragraph (1.1, 1.2.3, 1.2.3.4, etc.) with complete text

Usage:
    python afi_simple_numbered.py --pdf_path "dafi21-101.pdf" --output_csv "dafi21-101_numbered.csv"
"""

import pdfplumber
import re
import csv
import uuid
import argparse
from pathlib import Path
from typing import Dict, List, Tuple, Optional


class NumberedParagraphParser:
    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path
        self.pdf = pdfplumber.open(pdf_path)
        self.current_chapter = None
        self.current_section = None
        self.doc_id = self._extract_doc_id()
        self.afi_number = self._extract_afi_number()
        self.folder = self._determine_folder()
        
    def _extract_doc_id(self) -> str:
        """Extract document ID from filename"""
        # Use the exact filename without .pdf extension
        filename = Path(self.pdf_path).stem
        return filename
    
    def _extract_afi_number(self) -> str:
        """Extract the official AFI/DAFI number from the document"""
        # Primary method: Use filename as-is (without .pdf)
        filename = Path(self.pdf_path).stem
        
        # Try to clean up the filename for AFI format
        # Handle patterns like "dafi 21-101", "dafi 21-101 accsup", "TO 00-20-1"
        
        # Check for Technical Orders first
        to_match = re.search(r'(TO|to)\s*(\d{2}-\d{2,3}-\d+)', filename, re.IGNORECASE)
        if to_match:
            return f"TO {to_match.group(2)}"
        
        # Check for AFI/DAFI patterns with spaces and additional text
        afi_match = re.search(r'(dafi|afi|afman)\s*(\d{2})[\s-]*(\d{3,4})(?:\s+(.+))?', filename, re.IGNORECASE)
        if afi_match:
            prefix = afi_match.group(1).upper()
            if prefix.lower() == 'dafi':
                prefix = 'DAFI'
            number = f"{afi_match.group(2)}-{afi_match.group(3)}"
            suffix = afi_match.group(4)
            
            if suffix:
                # Include suffix like "ACCSUP"
                return f"{prefix} {number} {suffix.upper()}"
            else:
                return f"{prefix} {number}"
        
        # Fallback: Look in document content
        for page_num in range(min(3, len(self.pdf.pages))):
            page = self.pdf.pages[page_num]
            text = page.extract_text()
            if text:
                match = re.search(r'(DA?FI|AFI|AFMAN|TO)\s*\d{2}-\d{2,4}', text)
                if match:
                    return match.group(0)
        
        # Final fallback: return filename as-is
        return filename
    
    def _determine_folder(self) -> str:
        """Determine logical folder based on AFI number"""
        afi_folders = {
            'dafi21': 'Maintenance', 'afi21': 'Maintenance', 
            'dafi36': 'Personnel', 'afi36': 'Personnel',
            'dafi34': 'Services', 'afi34': 'Services',
            'dafi31': 'Security', 'afi31': 'Security',
            'dafi33': 'Communications', 'afi33': 'Communications',
        }
        
        match = re.search(r'(DA?FI|AFI)\s*(\d{2})-\d{3,4}', self.afi_number)
        if match:
            prefix = match.group(1).lower()
            if prefix == 'dafi':
                prefix = 'dafi'
            number = match.group(2)
            key = f"{prefix}{number}"
            return afi_folders.get(key, 'General')
        
        return 'General'
    
    def _is_chapter_header(self, text: str, char_info: List = None) -> Optional[int]:
        """Check if text is a chapter header (often bold)"""
        if not text:
            return None
            
        text = text.strip()
        
        # Look for "Chapter X" patterns
        match = re.match(r'^Chapter\s+(\d+)(?:[—\-\s].*)?$', text, re.IGNORECASE)
        if match:
            chapter_num = int(match.group(1))
            if 1 <= chapter_num <= 20:
                return chapter_num
        
        # Look for bold chapter patterns if we have character info
        if char_info and any(char.get('fontname', '').lower().find('bold') != -1 for char in char_info):
            match = re.match(r'^(\d+)\.\s*[A-Z]', text)
            if match:
                chapter_num = int(match.group(1))
                if 1 <= chapter_num <= 20:
                    return chapter_num
                    
        return None
    
    def _extract_chapter_from_paragraph(self, paragraph: str) -> Optional[int]:
        """Extract chapter number from paragraph (1.2.3 -> chapter 1)"""
        if not paragraph:
            return None
            
        parts = paragraph.split('.')
        if len(parts) >= 1:
            try:
                chapter_num = int(parts[0])
                if 1 <= chapter_num <= 20:  # Reasonable chapter range
                    return chapter_num
            except ValueError:
                pass
                
        return None
    
    def _extract_numbered_paragraph(self, text: str) -> Optional[str]:
        """Extract paragraph number from text (1.1, 1.2.3, 1.2.3.4, etc.)"""
        if not text:
            return None
            
        text = text.strip()
        
        # Look for numbered paragraph patterns at start of text
        # Matches: 1.1, 1.2.3, 1.2.3.4, etc.
        match = re.match(r'^(\d+(?:\.\d+)+)\.?\s', text)
        if match:
            return match.group(1)
            
        return None
    
    def _extract_compliance_tier(self, text: str) -> Optional[str]:
        """Extract compliance tier (T-0, T-1, T-2, T-3) from text"""
        if not text:
            return None
            
        match = re.search(r'\(T-([0-3])\)', text)
        if match:
            return f"T-{match.group(1)}"
            
        return None
    
    def _categorize_content(self, text: str) -> str:
        """Categorize content based on keywords"""
        if not text:
            return "General"
            
        text_lower = text.lower()
        
        if any(word in text_lower for word in ['safety', 'hazard', 'dangerous', 'risk']):
            return "Safety"
        elif any(word in text_lower for word in ['quality', 'inspection', 'check', 'verify']):
            return "QA"
        elif any(word in text_lower for word in ['training', 'education', 'course', 'instruction']):
            return "Training"
        elif any(word in text_lower for word in ['maintenance', 'repair', 'service', 'mx']):
            return "Maintenance"
        elif any(word in text_lower for word in ['admin', 'administrative', 'record', 'documentation']):
            return "Admin"
        elif self._extract_compliance_tier(text):
            return "Compliance"
        else:
            return "General"
    
    def _clean_text(self, text: str) -> str:
        """Clean and normalize text content"""
        if not text:
            return ""
            
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text.strip())
        
        # Clean up table of contents formatting (dots and ellipses)
        # Pattern: "text. ..........." becomes "text."
        text = re.sub(r'\.\s*\.{3,}', '.', text)
        
        # Remove page numbers at end
        text = re.sub(r'\s+\d+\s*$', '', text)
        
        # Remove common PDF artifacts
        text = re.sub(r'Attachment\s+\d+', '', text)
        text = re.sub(r'Figure\s+\d+\.\d+', '', text)
        text = re.sub(r'Table\s+\d+\.\d+', '', text)
        
        return text.strip()
    
    def _build_section_path(self, paragraph: str, chapter: int = None) -> str:
        """Build breadcrumb section path"""
        parts = []
        
        chapter_to_use = chapter or self.current_chapter
        if chapter_to_use:
            parts.append(f"Ch{chapter_to_use}")
            
        if paragraph:
            parts.append(f"¶{paragraph}")
            
        return " > ".join(parts) if parts else ""
    
    def _extract_section_from_paragraph(self, paragraph: str) -> Optional[int]:
        """Extract section number from paragraph (1.2.3 -> section 2)"""
        if not paragraph:
            return None
            
        parts = paragraph.split('.')
        if len(parts) >= 2:
            try:
                return int(parts[1])
            except ValueError:
                pass
                
        return None
    
    def parse_document(self) -> List[Dict]:
        """Parse the entire PDF document and extract all numbered paragraphs"""
        records = []
        
        print(f"Parsing {self.afi_number}...")
        print(f"Document ID: {self.doc_id}")
        print(f"Folder: {self.folder}")
        
        all_text_blocks = []
        
        # First pass: Extract all text with position info
        for page_num, page in enumerate(self.pdf.pages, 1):
            print(f"Processing page {page_num}...")
            
            text = page.extract_text()
            if not text:
                continue
            
            # Get character-level info for bold detection
            try:
                chars = page.chars
            except:
                chars = []
            
            lines = text.split('\n')
            
            for line in lines:
                line = line.strip()
                if not line or len(line) < 5:
                    continue
                
                # Check for chapter header
                chapter_num = self._is_chapter_header(line, chars)
                if chapter_num:
                    self.current_chapter = chapter_num
                    print(f"Found Chapter {chapter_num} on page {page_num}")
                    continue
                
                # Check for numbered paragraph
                paragraph_num = self._extract_numbered_paragraph(line)
                if paragraph_num:
                    # Extract chapter number from paragraph (e.g., "1.1" -> chapter 1)
                    chapter_from_paragraph = self._extract_chapter_from_paragraph(paragraph_num)
                    if chapter_from_paragraph:
                        self.current_chapter = chapter_from_paragraph
                    
                    all_text_blocks.append({
                        'page': page_num,
                        'paragraph': paragraph_num,
                        'text': line,
                        'chapter': self.current_chapter
                    })
        
        # Second pass: Combine text blocks that belong together
        combined_blocks = []
        current_block = None
        
        for block in all_text_blocks:
            if current_block is None:
                current_block = block.copy()
            else:
                # Check if this is a new numbered paragraph
                if block['paragraph']:
                    # Save the previous block
                    combined_blocks.append(current_block)
                    # Start new block
                    current_block = block.copy()
                else:
                    # This is continuation text, add to current block
                    current_block['text'] += ' ' + block['text']
        
        # Don't forget the last block
        if current_block:
            combined_blocks.append(current_block)
        
        # Third pass: Create records
        for block in combined_blocks:
            if not block.get('paragraph') or not block.get('chapter'):
                continue
            
            paragraph_num = block['paragraph']
            text = block['text']
            
            # Remove paragraph number from beginning of text
            clean_text = re.sub(rf'^{re.escape(paragraph_num)}\.?\s*', '', text)
            clean_text = self._clean_text(clean_text)
            
            if clean_text and len(clean_text) > 10:  # Only meaningful content
                compliance_tier = self._extract_compliance_tier(clean_text)
                section_num = self._extract_section_from_paragraph(paragraph_num)
                section_path = self._build_section_path(paragraph_num, block['chapter'])
                category = self._categorize_content(clean_text)
                
                record = {
                    'embedding_id': str(uuid.uuid4()),
                    'doc_id': self.doc_id,
                    'folder': self.folder,
                    'afi_number': self.afi_number,
                    'chapter': block['chapter'],
                    'section': section_num or '',
                    'paragraph': paragraph_num,
                    'text': clean_text,
                    'section_path': section_path,
                    'category': category,
                    'compliance_tier': compliance_tier or '',
                    'page_number': block['page']
                }
                
                records.append(record)
                print(f"  Added {paragraph_num}: {clean_text[:60]}...")
        
        print(f"Extracted {len(records)} numbered paragraphs")
        return records
    
    def save_to_csv(self, records: List[Dict], output_path: str):
        """Save records to CSV file"""
        if not records:
            print("No records to save")
            return
            
        fieldnames = [
            'embedding_id', 'doc_id', 'folder', 'afi_number', 'chapter', 
            'section', 'paragraph', 'text', 'section_path', 'category',
            'compliance_tier', 'page_number'
        ]
        
        with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(records)
            
        print(f"Saved {len(records)} records to {output_path}")
    
    def close(self):
        """Close the PDF file"""
        if self.pdf:
            self.pdf.close()


def main():
    parser = argparse.ArgumentParser(description='Parse AFI/DAFI PDF numbered paragraphs into structured CSV')
    parser.add_argument('--pdf_path', required=True, help='Path to the PDF file')
    parser.add_argument('--output_csv', required=True, help='Output CSV file path')
    
    args = parser.parse_args()
    
    if not Path(args.pdf_path).exists():
        print(f"Error: PDF file not found: {args.pdf_path}")
        return
    
    try:
        # Parse the document
        paragraph_parser = NumberedParagraphParser(args.pdf_path)
        records = paragraph_parser.parse_document()
        
        # Save to CSV
        paragraph_parser.save_to_csv(records, args.output_csv)
        
        # Print summary
        print(f"\nSummary:")
        print(f"  Document: {paragraph_parser.afi_number}")
        print(f"  Chapters found: {len(set(r['chapter'] for r in records if r['chapter']))}")
        print(f"  Total numbered paragraphs: {len(records)}")
        print(f"  With compliance tiers: {len([r for r in records if r['compliance_tier']])}")
        
        # Show chapter distribution
        from collections import Counter
        chapters = Counter(r['chapter'] for r in records if r['chapter'])
        print(f"  Chapter distribution:")
        for ch, count in sorted(chapters.items(), key=lambda x: int(x[0])):
            print(f"    Chapter {ch}: {count} paragraphs")
        
    except Exception as e:
        print(f"Error parsing document: {str(e)}")
        raise
    finally:
        paragraph_parser.close()


if __name__ == "__main__":
    main()