# CSV Storage Feature - Parser Debugging Guide

## Overview
All parsed CSV files from PDF processing are now automatically stored in Supabase Storage alongside the original PDFs. This allows you to inspect the parser output and verify the data extraction quality.

## What Gets Stored

### PDF Processing Flow
```
PDF Upload
  ↓
PDF → Supabase Storage (afi-documents/documents/{id}/filename.pdf)
  ↓
Python Parser (pdfplumber)
  ↓
CSV Generation (paragraphs with metadata)
  ↓
CSV → Supabase Storage (afi-documents/documents/{id}/filename_parsed.csv)
  ↓
OpenAI Embeddings
  ↓
ChromaDB Storage
```

### Storage Structure
```
Bucket: afi-documents
└── documents/
    ├── {document-id-1}/
    │   ├── AFI_36-2903.pdf          ← Original PDF
    │   └── AFI_36-2903_parsed.csv   ← Parsed data
    ├── {document-id-2}/
    │   ├── AFI_21-101.pdf
    │   └── AFI_21-101_parsed.csv
    └── ...
```

## CSV File Format

The parsed CSV contains the following columns:

| Column | Description | Example |
|--------|-------------|---------|
| `afi_number` | AFI designation | "AFI 36-2903" |
| `chapter` | Chapter number | "Chapter 2" |
| `section` | Section identifier | "2.1" |
| `paragraph` | Paragraph number | "2.1.3" |
| `text` | Full paragraph text | "Personnel will maintain..." |
| `page_number` | Source page | 15 |
| `metadata` | Additional JSON data | {"level": "sub"} |

## Viewing CSV Files

### From Master Library
1. Navigate to **Master Library** page
2. Find your document
3. Click the **CSV icon** button (📊 spreadsheet icon)
4. CSV will download/open in browser

### From Document Library
1. Navigate to **Document Library** page
2. Find your completed document
3. Click the **CSV icon** button
4. CSV will download/open in browser

### API Endpoint
```
GET /api/documents/{id}/view-csv
```
Returns a signed URL to download the CSV file.

## Parser Verification Checklist

Use the CSV to verify:

### ✅ Content Extraction
- [ ] All chapters captured
- [ ] All sections captured
- [ ] Paragraph numbering correct
- [ ] Text complete (no truncation)
- [ ] Page numbers accurate

### ✅ Metadata Quality
- [ ] AFI number correctly extracted
- [ ] Chapter titles present
- [ ] Section hierarchies maintained
- [ ] Special formatting preserved

### ✅ Data Cleanliness
- [ ] No duplicate paragraphs
- [ ] No header/footer noise
- [ ] Proper line breaks
- [ ] Special characters handled

## Common Parser Issues

### Issue 1: Missing Chapters
**Symptom**: CSV missing entire chapters
**Check**: Look for gaps in chapter numbers
**Fix**: Review PDF structure, may need parser adjustment

### Issue 2: Incorrect Paragraph Numbers
**Symptom**: Paragraph column shows wrong numbering
**Check**: Compare CSV paragraph numbers with source PDF
**Fix**: Parser regex patterns may need tuning

### Issue 3: Truncated Text
**Symptom**: Text column cut off mid-sentence
**Check**: Look for incomplete sentences
**Fix**: Check PDF text extraction limits

### Issue 4: Header/Footer Noise
**Symptom**: Repetitive page headers/footers in text
**Check**: Look for repeated text across multiple rows
**Fix**: Update header/footer filtering rules

### Issue 5: Special Characters
**Symptom**: Garbled text or missing symbols
**Check**: Look for encoding issues (�, boxes)
**Fix**: UTF-8 encoding verification needed

## Debugging Workflow

### Step 1: Upload Document
```bash
# Upload via UI or API
# Processing automatically starts
```

### Step 2: Wait for Completion
- Processing status shows in UI
- Usually 30s - 3min depending on PDF size

### Step 3: Download CSV
```bash
# Via UI button or direct API call
curl -L "http://localhost:5000/api/documents/{id}/view-csv" -o parsed_output.csv
```

### Step 4: Inspect CSV
```bash
# Open in Excel, Google Sheets, or text editor
# Look for patterns, gaps, errors
```

### Step 5: Compare with Original
- Open original PDF side-by-side
- Spot-check critical sections
- Verify paragraph alignment

### Step 6: Report Issues
If parser issues found:
1. Note the AFI number and document ID
2. Identify specific pages/sections with problems
3. Describe what's wrong vs. what's expected
4. Share CSV snippet showing the issue

## CSV Analysis Tips

### Excel/Sheets Formula Examples

**Count total paragraphs:**
```excel
=COUNTA(E:E)
```

**Find missing chapters:**
```excel
=UNIQUE(B:B)  # List all chapters
```

**Detect duplicates:**
```excel
=COUNTIF(E:E, E2) > 1
```

**Average text length:**
```excel
=AVERAGE(LEN(E:E))
```

### Command-Line Analysis

**Count rows:**
```bash
wc -l parsed_output.csv
```

**View first 10 rows:**
```bash
head -10 parsed_output.csv
```

**Search for keyword:**
```bash
grep -i "uniform" parsed_output.csv
```

**Extract unique chapters:**
```bash
cut -d',' -f2 parsed_output.csv | sort -u
```

## Performance Metrics

Good parser output should have:
- **Coverage**: 95%+ of PDF text captured
- **Accuracy**: 98%+ correct paragraph numbering
- **Cleanliness**: <1% noise/junk text
- **Structure**: All chapters/sections hierarchically organized

## Storage Management

### Automatic Cleanup
- CSV deleted when document deleted
- Both PDF and CSV removed together
- No orphaned files in storage

### Manual Cleanup (if needed)
```bash
# Use Supabase Dashboard > Storage
# Navigate to afi-documents bucket
# Delete specific files manually
```

### Storage Limits
- Bucket limit: ~500 documents × 2 files = 1000 files
- CSV size: Typically 100KB - 2MB per document
- Total: ~50MB - 1GB for CSV files

## Troubleshooting

### CSV Not Available
**Symptom**: No CSV icon button appears
**Cause**: Document uploaded before CSV storage feature
**Solution**: Re-upload document or run migration script

### CSV Download Fails
**Symptom**: 404 or signed URL expired
**Cause**: Storage path missing or file deleted
**Solution**: Re-process document

### CSV Format Issues
**Symptom**: CSV won't open or shows garbage
**Cause**: Encoding or delimiter problems
**Solution**: Try opening with different CSV reader

## Future Enhancements

- [ ] In-app CSV preview (no download needed)
- [ ] CSV diff comparison (before/after parser updates)
- [ ] Automatic quality scoring
- [ ] Highlighted problem areas in UI
- [ ] Export to other formats (JSON, Markdown)

## Related Documentation

- `SUPABASE_STORAGE.md` - Storage setup guide
- `QUICKSTART_STORAGE.md` - Quick start guide
- Python parser source: `server/utils/pdf_processor.ts`

---

💡 **Pro Tip**: Keep a collection of "test AFIs" with known good/bad characteristics to validate parser improvements over time.
