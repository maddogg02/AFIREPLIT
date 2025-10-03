# Quick Start: Supabase Storage Integration

## ✅ What's New
Your AFI Management System now stores PDF files in Supabase Storage, enabling direct PDF viewing from the Master Library!

## 🚀 Features Added

## 🧰 Required Environment Variables

Before running the storage integration locally or in CI, double check the following keys are present in your `.env` (or platform secrets):

- [ ] `SUPABASE_URL` – points at your Supabase project
- [ ] `SUPABASE_SERVICE_ROLE_KEY` – **server-side only** key required for creating/listing storage buckets and performing backfills
- [ ] `SUPABASE_ANON_KEY` – optional; used for client-side access patterns (frontend still relies on this)
- [ ] `OPENAI_API_KEY` – used during CSV → embeddings processing
- [ ] `DATABASE_URL` – Postgres connection string for Drizzle migrations

### 1. Automatic PDF Storage
When you upload a PDF:
- ✅ File is stored in Supabase Storage
- ✅ Database tracks storage location
- ✅ Processing continues as normal (parsing, embeddings, ChromaDB)

### 2. View PDFs Directly
From Master Library or Document Library:
- Click **View** or **View PDF** button
- PDF opens in new browser tab
- Secure 1-hour signed URL

### 3. Automatic Cleanup
When you delete a document:
- ✅ Removed from Supabase Storage
- ✅ Removed from database
- ✅ Removed from ChromaDB

## 🔧 Setup (Already Done!)

Your `.env` already has:
```env
SUPABASE_URL=https://afvasffjbfomfqyvpfea.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Database schema updated with:
- `storage_bucket` - Bucket name
- `storage_path` - File path in storage
- `storage_public_url` - Access URL

## 🧪 Testing

### Option 1: Upload a New PDF
1. Start the application:
   ```bash
   npm run dev
   ```
2. Navigate to Upload page
3. Upload any PDF
4. After processing completes, go to Master Library
5. Click **View** button - PDF should open!

### Option 2: Run Test Script
```bash
node test_supabase_storage.js
```
This creates a test PDF, uploads it, downloads it, and cleans up.

## 📝 Migration (Optional)

If you have existing PDFs uploaded before this update:

```bash
node migrate_to_supabase_storage.js
```

This will:
- Find all documents in database
- Look for matching PDFs in `uploads/` folder
- Upload them to Supabase Storage
- Update database records

## 🎯 Usage

### Master Library
1. Browse all AFI documents
2. Use filters (AFI Series, Organization Folder)
3. Click **View** on any document
4. PDF opens in new tab

### Document Library
1. View your uploaded documents
2. Click **View PDF** button
3. Opens in new browser tab

### Document Cards
- **Chat** button - Start RAG chat session
- **View PDF** button - Open original PDF
- **Delete** menu - Removes from storage + database

## 🔐 Security

- Storage bucket is **private** (not publicly accessible)
- Signed URLs expire after **1 hour**
- Each view request generates a new signed URL
- File size limit: **50 MB**

## 🛠️ Troubleshooting

### "Document PDF not available in storage"
- Document was uploaded before storage integration
- Run migration script to upload existing PDFs

### "Failed to upload to Supabase Storage"
- Check `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` in `.env`
- Verify Supabase project is active
- Check network connectivity

### "new row violates row-level security policy"
- `SUPABASE_SERVICE_ROLE_KEY` is missing or incorrect
- Add the service role key to your server `.env` (never expose to the browser)
- Alternatively, create the `afi-documents` bucket manually in the Supabase dashboard

### Bucket not created
- First upload automatically creates bucket
- Or manually create in Supabase Dashboard:
  - Name: `afi-documents`
  - Privacy: Private
  - File size limit: 50 MB

## 📚 Technical Details

### Storage Structure
```
Bucket: afi-documents
└── documents/
    ├── {doc-id-1}/
    │   └── filename.pdf
    ├── {doc-id-2}/
    │   └── filename.pdf
    └── ...
```

### API Endpoint
```
GET /api/documents/:id/view
```
Generates signed URL and redirects to Supabase.

### Database Schema
```sql
ALTER TABLE documents ADD COLUMN storage_bucket TEXT;
ALTER TABLE documents ADD COLUMN storage_path TEXT;
ALTER TABLE documents ADD COLUMN storage_public_url TEXT;
```

## 🎉 That's It!

You're all set! New PDFs will automatically be stored in Supabase, and you can view them directly from the Master Library.

For detailed documentation, see `SUPABASE_STORAGE.md`.
