/**
 * Migration Script: Upload Existing PDFs to Supabase Storage
 * 
 * This script migrates existing documents from local uploads/ folder to Supabase Storage.
 * Run this if you have documents uploaded before the Supabase Storage integration.
 */

import { storage } from './server/storage.js';
import { SupabaseStorageService } from './server/utils/supabase_storage.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const uploadsDir = path.join(process.cwd(), 'uploads');
const tempDir = path.join(process.cwd(), 'temp');

function directoryFiles(dir, extension) {
  if (!dir || !fs.existsSync(dir)) {
    return [];
  }

  try {
    return fs.readdirSync(dir)
      .filter((file) => (extension ? file.toLowerCase().endsWith(extension) : true))
      .map((file) => ({
        name: file,
        path: path.join(dir, file),
      }));
  } catch {
    return [];
  }
}

function findMatchingPdf(doc) {
  const pdfFiles = directoryFiles(uploadsDir, '.pdf');
  const targetFilename = doc.filename?.toLowerCase();

  for (const file of pdfFiles) {
    try {
      const stats = fs.statSync(file.path);
      if (!stats.isFile()) continue;

      if (stats.size === doc.fileSize) {
        return file.path;
      }

      if (targetFilename && file.name.toLowerCase() === targetFilename) {
        return file.path;
      }
    } catch {
      // Ignore unreadable files
    }
  }

  return null;
}

function findMatchingCsv(doc) {
  const candidates = [];
  if (doc.csvPath) {
    candidates.push(doc.csvPath);
  }

  const normalizedId = doc.id?.toLowerCase();
  const baseName = doc.filename ? path.parse(doc.filename).name : undefined;
  const normalizedBase = baseName?.replace(/[^a-z0-9]/gi, '').toLowerCase();

  const searchDirs = [tempDir, uploadsDir];
  for (const dir of searchDirs) {
    for (const file of directoryFiles(dir, '.csv')) {
      const lowerName = file.name.toLowerCase();
      if (normalizedId && lowerName.includes(normalizedId)) {
        candidates.push(file.path);
        continue;
      }

      if (normalizedBase && lowerName.includes(normalizedBase)) {
        candidates.push(file.path);
      }
    }
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export async function migrateExistingDocuments() {
  console.log('📦 Starting migration of existing documents to Supabase Storage\n');

  try {
    const documents = await storage.getDocuments();
    console.log(`Found ${documents.length} documents in database\n`);

    let pdfUploaded = 0;
    let pdfAlready = 0;
    let pdfMissing = 0;
    let csvUploaded = 0;
    let csvAlready = 0;
    let csvMissing = 0;

    for (const doc of documents) {
      console.log(`\nProcessing: ${doc.filename} (${doc.id})`);

      if (!doc.storagePath) {
        const pdfPath = findMatchingPdf(doc);

        if (!pdfPath) {
          console.log('  ⚠️  PDF file not found locally - skipping upload');
          pdfMissing++;
        } else {
          try {
            console.log('  📤 Uploading PDF to Supabase...');
            const { storagePath, publicUrl } = await SupabaseStorageService.uploadPDF(
              pdfPath,
              doc.id,
              doc.filename
            );

            await storage.updateDocument(doc.id, {
              storageBucket: 'afi-documents',
              storagePath,
              storagePublicUrl: publicUrl,
            });

            console.log(`  ✅ PDF stored at ${storagePath}`);
            pdfUploaded++;
          } catch (error) {
            console.error('  ❌ Failed to upload PDF:', error?.message || error);
            pdfMissing++;
          }
        }
      } else {
        console.log('  ⏭️  PDF already in Supabase Storage');
        pdfAlready++;
      }

      if (!doc.csvStoragePath) {
        const csvPath = findMatchingCsv(doc);

        if (!csvPath) {
          console.log('  ⚠️  Parsed CSV not found locally - run RAG pipeline again to regenerate');
          csvMissing++;
        } else {
          try {
            console.log('  📤 Uploading parsed CSV to Supabase...');
            const { storagePath: csvStoragePath } = await SupabaseStorageService.uploadCSV(
              csvPath,
              doc.id,
              doc.filename
            );

            await storage.updateDocument(doc.id, {
              csvStoragePath,
            });

            console.log(`  ✅ CSV stored at ${csvStoragePath}`);
            csvUploaded++;
          } catch (error) {
            console.error('  ❌ Failed to upload CSV:', error?.message || error);
            csvMissing++;
          }
        }
      } else {
        console.log('  ⏭️  CSV already in Supabase Storage');
        csvAlready++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary');
    console.log('='.repeat(60));
    console.log(`PDFs -> Uploaded: ${pdfUploaded}, Existing: ${pdfAlready}, Missing: ${pdfMissing}`);
    console.log(`CSVs -> Uploaded: ${csvUploaded}, Existing: ${csvAlready}, Missing: ${csvMissing}`);
    console.log(`Total documents processed: ${documents.length}`);
    console.log('='.repeat(60));

    if (pdfUploaded + csvUploaded > 0) {
      console.log('\n💡 Tip: You can now safely clean up migrated files from local storage');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('\n📝 Troubleshooting:');
    console.error('   1. Check SUPABASE_URL and SUPABASE_ANON_KEY in .env');
    console.error('   2. Ensure database connection is working');
    console.error('   3. Verify local uploads/temp folders still contain original assets');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  migrateExistingDocuments()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
