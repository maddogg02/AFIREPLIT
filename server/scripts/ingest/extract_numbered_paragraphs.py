#!/usr/bin/env python3
"""
PDF ingestion utility: extract numbered AFI/DAFI paragraphs and chapters.
Captures every numbered paragraph (1.1, 1.2.3, 1.2.3.4, etc.) with complete text
and emits a structured CSV ready for downstream embedding ingestion.

Usage:
    python extract_numbered_paragraphs.py --pdf_path "dafi21-101.pdf" --output_csv "dafi21-101_numbered.csv"
"""

import pdfplumber
import re
import csv
import uuid
import argparse
from pathlib import Path
from typing import Dict, List, Optional


class NumberedParagraphParser:
    def __init__(self, pdf_path: str, original_name: Optional[str] = None):
        self.pdf_path = pdf_path
        self.pdf = pdfplumber.open(pdf_path)
        self.current_chapter = None
        self.current_section = None
        self.original_name = original_name
        self.file_stem = self._determine_file_stem()
        self.doc_id = self._extract_doc_id()
        self.canonical_afi_number = self._extract_canonical_afi_number()
        self.afi_number = self._extract_afi_number()
        self.folder = self._determine_folder()

    def _determine_file_stem(self) -> str:
        if self.original_name:
            name = Path(self.original_name).stem
            if name:
                return name.strip()
        return Path(self.pdf_path).stem
        
    def _extract_doc_id(self) -> str:
        """Extract document ID from filename using legacy naming convention."""
        stem = (self.file_stem or Path(self.pdf_path).stem).lower()
        doc_id = re.sub(r'[_\-\s]*(v\d+|rev\d+|final|draft).*$', '', stem)
        doc_id = doc_id.strip('_- ')
        return doc_id or stem
    
    def _extract_canonical_afi_number(self) -> Optional[str]:
        """Attempt to derive a canonical AFI designation for folder classification."""
        normalized = self.file_stem.replace('_', ' ').strip()

        # Technical Orders
        to_match = re.search(r'(TO|to)\s*(\d{2}-\d{2,3}-\d+)', normalized, re.IGNORECASE)
        if to_match:
            return f"TO {to_match.group(2)}"

        afi_match = re.search(r'(dafi|afi|afman)\s*(\d{2})[\s-]*(\d{3,4})(?:\s+(.+))?', normalized, re.IGNORECASE)
        if afi_match:
            prefix = afi_match.group(1).upper()
            if prefix.lower() == 'dafi':
                prefix = 'DAFI'
            number = f"{afi_match.group(2)}-{afi_match.group(3)}"
            suffix = afi_match.group(4)
            if suffix:
                cleaned_suffix = re.sub(r'[\s_-]+', ' ', suffix).strip().upper()
                return f"{prefix} {number} {cleaned_suffix}"
            return f"{prefix} {number}"

        return None

    def _extract_afi_number(self) -> str:
        """Extract the official AFI/DAFI number from the document when possible."""
        try:
            page_count = len(self.pdf.pages)
        except Exception:
            page_count = 0

        for page_index in range(min(3, page_count)):
            try:
                page = self.pdf.pages[page_index]
                text = page.extract_text()
            except Exception:
                text = None

            if not text:
                continue

            match = re.search(r'(DA?FI|AFI|AFMAN)\s*\d{2}-\d{3,4}', text, re.IGNORECASE)
            if match:
                prefix = match.group(1).upper()
                digits = re.search(r'\d{2}-\d{3,4}', match.group(0))
                if digits:
                    return f"{prefix} {digits.group(0)}"
                return match.group(0).upper()

        for source in [self.canonical_afi_number, self.file_stem]:
            if not source:
                continue
            match = re.search(r'(dafi|afi|afman)(\d{2})-?(\d{3,4})', source, re.IGNORECASE)
            if match:
                prefix = match.group(1).upper()
                if prefix.lower() == 'dafi':
                    prefix = 'DAFI'
                return f"{prefix} {match.group(2)}-{match.group(3)}"

        return self.file_stem
    
    def _determine_folder(self) -> str:
        """Determine logical folder based on AFI number"""
        afi_folders = {
            'dafi21': 'Maintenance', 'afi21': 'Maintenance', 
            'dafi36': 'Personnel', 'afi36': 'Personnel',
            'dafi34': 'Services', 'afi34': 'Services',
            'dafi31': 'Security', 'afi31': 'Security',
            'dafi33': 'Communications', 'afi33': 'Communications',
        }

        for source in filter(None, [self.afi_number, self.canonical_afi_number, self.file_stem]):
            match = re.search(r'(da?fi|afi)\s*(\d{2})-\d{3,4}', source.lower())
            if match:
                prefix = 'dafi' if match.group(1).startswith('da') else 'afi'
                number = match.group(2)
                key = f"{prefix}{number}"
                folder = afi_folders.get(key)
                if folder:
                    return folder

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
        """Extract paragraph number from text (1.1, 1.2.3, 1.2.3.4, 8.9, 11.1, etc.)"""
        if not text:
            return None
            
        text = text.strip()
        
        # Look for numbered paragraph patterns at start of text
        # Matches: 1.1, 1.2.3, 1.2.3.4, 8.9, 11.1, 8.9:, 11.1:, etc.
        # This pattern captures single-level (8.9) and multi-level (8.9.2.6.4) numbers
        match = re.match(r'^(\d+(?:\.\d+)*)[\.:]\s', text)
        if match:
            # Normalize to dots only (remove trailing colons/periods)
            para_num = match.group(1)
            return para_num
            
        return None
    
    def _extract_compliance_tier(self, text: str) -> Optional[str]:
        """Extract compliance tier (T-0, T-1, T-2, T-3) from text"""
        if not text:
            return None
            
        match = re.search(r'\(T-(\d)\)', text)
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
        
        for page_num, page in enumerate(self.pdf.pages, 1):
            print(f"Processing page {page_num}...")

            try:
                text = page.extract_text()
            except Exception:
                text = None

            if not text:
                continue

            try:
                chars = page.chars
            except Exception:
                chars = []

            lines = text.split('\n')
            current_paragraph: Optional[str] = None
            current_text_lines: List[str] = []
            paragraph_start_page: Optional[int] = None

            for raw_line in lines:
                line = raw_line.strip()
                if not line or len(line) < 3:
                    continue

                chapter_num = self._is_chapter_header(line, chars)
                if chapter_num:
                    if current_paragraph and current_text_lines:
                        block_chapter = self.current_chapter or self._extract_chapter_from_paragraph(current_paragraph)
                        combined_text = ' '.join(current_text_lines)
                        all_text_blocks.append({
                            'page': paragraph_start_page or page_num,
                            'paragraph': current_paragraph,
                            'text': combined_text,
                            'chapter': block_chapter
                        })
                        current_paragraph = None
                        current_text_lines = []
                        paragraph_start_page = None

                    self.current_chapter = chapter_num
                    print(f"Found Chapter {chapter_num} on page {page_num}")
                    continue

                paragraph_num = self._extract_numbered_paragraph(line)
                if paragraph_num:
                    if current_paragraph and current_text_lines:
                        block_chapter = self.current_chapter or self._extract_chapter_from_paragraph(current_paragraph)
                        combined_text = ' '.join(current_text_lines)
                        all_text_blocks.append({
                            'page': paragraph_start_page or page_num,
                            'paragraph': current_paragraph,
                            'text': combined_text,
                            'chapter': block_chapter
                        })

                    chapter_from_paragraph = self._extract_chapter_from_paragraph(paragraph_num)
                    if chapter_from_paragraph:
                        self.current_chapter = chapter_from_paragraph

                    current_paragraph = paragraph_num
                    current_text_lines = [line]
                    paragraph_start_page = page_num
                elif current_paragraph:
                    if not re.match(r'^\d+$', line) and not re.match(r'^(Chapter|CHAPTER)\s+\d+', line):
                        current_text_lines.append(line)

            if current_paragraph and current_text_lines:
                block_chapter = self.current_chapter or self._extract_chapter_from_paragraph(current_paragraph)
                combined_text = ' '.join(current_text_lines)
                all_text_blocks.append({
                    'page': paragraph_start_page or page_num,
                    'paragraph': current_paragraph,
                    'text': combined_text,
                    'chapter': block_chapter
                })

        for block in all_text_blocks:
            paragraph_num = block.get('paragraph')
            if not paragraph_num:
                continue

            chapter_value = block.get('chapter') or self._extract_chapter_from_paragraph(paragraph_num)
            if not chapter_value:
                continue

            text = block.get('text', '')
            clean_text = re.sub(rf'^{re.escape(paragraph_num)}\.?\s*', '', text)
            clean_text = self._clean_text(clean_text)

            if clean_text and len(clean_text) > 10:
                compliance_tier = self._extract_compliance_tier(clean_text)
                section_num = self._extract_section_from_paragraph(paragraph_num)
                section_path = self._build_section_path(paragraph_num, chapter_value)
                category = self._categorize_content(clean_text)

                record = {
                    'embedding_id': str(uuid.uuid4()),
                    'doc_id': self.doc_id,
                    'folder': self.folder,
                    'afi_number': self.afi_number,
                    'chapter': chapter_value,
                    'section': section_num or '',
                    'paragraph': paragraph_num,
                    'text': clean_text,
                    'section_path': section_path,
                    'category': category,
                    'compliance_tier': compliance_tier or '',
                    'page_number': block.get('page')
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
    parser.add_argument('--original_name', help='Original filename as uploaded (for display metadata)')
    
    args = parser.parse_args()
    
    if not Path(args.pdf_path).exists():
        print(f"Error: PDF file not found: {args.pdf_path}")
        return
    
    try:
        # Parse the document
        paragraph_parser = NumberedParagraphParser(args.pdf_path, args.original_name)
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
        
        print("\nChapter distribution:")
        for chapter, count in sorted(chapters.items()):
            print(f"  Chapter {chapter}: {count} paragraphs")
        
        paragraph_parser.close()
        
    except Exception as e:
        print(f"Error processing PDF: {str(e)}")
        raise


if __name__ == "__main__":
    main()
