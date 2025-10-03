# Supabase Storage Setup for AFI PDFs

## Overview
The application now stores uploaded PDF files in Supabase Storage, enabling users to view original PDFs directly from the Master Library.

## Features
- ✅ Automatic PDF upload to Supabase Storage during document processing
- ✅ Secure signed URLs (1-hour expiry) for private document access
- ✅ "View PDF" button in Master Library and Document Library
- ✅ Automatic cleanup when documents are deleted
- ✅ Fallback handling if storage upload fails

## Storage Structure
```
Bucket: afi-documents (private)
├── documents/
│   ├── {document-id-1}/
│   │   └── {filename}.pdf
│   ├── {document-id-2}/
│   │   └── {filename}.pdf
│   └── ...
```

## Database Schema
Three new fields added to `documents` table:
- `storageBucket` - Storage bucket name (e.g., "afi-documents")
- `storagePath` - Full path in storage (e.g., "documents/{id}/filename.pdf")
- `storagePublicUrl` - Public URL for accessing the PDF

## API Endpoints

### View/Download PDF
```
GET /api/documents/:id/view
```
Generates a signed URL and redirects to Supabase Storage.

**Response**: HTTP 302 redirect to signed URL or 404 if not found

## Configuration
Required environment variables in `.env`:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key # server-side only, required for bucket creation
SUPABASE_ANON_KEY=your-anon-key
```

> ⚠️ **Security reminder:** never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser or bundle it in client code. Keep it in server-side environment variables only.

## Bucket Setup
The bucket `afi-documents` is created automatically on first upload **if `SUPABASE_SERVICE_ROLE_KEY` is configured**. Otherwise, create it manually or add the service role key before running uploads.

Default configuration when auto-created:
- **Privacy**: Private (requires signed URLs)
- **File size limit**: 50 MB
- **Content type**: application/pdf

## Manual Bucket Setup (Optional)
If you prefer to create the bucket manually (or do not have the service role key in local development):

1. Go to **Storage** in Supabase Dashboard
2. Click **New Bucket**
3. Name: `afi-documents`
4. Set to **Private**
5. File size limit: 50 MB

Then add RLS policies if needed for enhanced security. Once the bucket exists, uploads can proceed using either the service role or anon key (subject to your policies).

## Usage

### From Master Library
1. Browse documents in the Master Library
2. Click **View** button on any document
3. PDF opens in a new browser tab

### From Document Library
1. Navigate to your uploaded documents
2. Click **View PDF** button on any completed document
3. PDF opens in a new browser tab

## Technical Details

### Upload Flow
1. User uploads PDF via Upload page
2. Server receives file and saves to local `uploads/` folder
3. Document record created in database
4. PDF uploaded to Supabase Storage
5. Database updated with storage metadata
6. Python processing begins (parsing, embeddings, ChromaDB)
7. Local temporary file cleaned up

### View Flow
1. User clicks "View" button
2. Frontend makes request to `/api/documents/{id}/view`
3. Server retrieves document from database
4. Server generates 1-hour signed URL from Supabase
5. Server redirects to signed URL
6. Browser displays PDF

### Delete Flow
1. User deletes document
2. Server deletes from Supabase Storage
3. Server deletes from database
4. Server deletes from ChromaDB (via existing cleanup)

## Error Handling
- If Supabase upload fails, processing continues with local files only
- View button will not appear if no storage path exists
- Signed URLs expire after 1 hour for security

## Future Enhancements
- [ ] Add RLS policies for user-specific access
- [ ] Implement direct in-app PDF viewer
- [ ] Add PDF thumbnail generation
- [ ] Support PDF annotations and highlights
- [ ] Add versioning for document updates
