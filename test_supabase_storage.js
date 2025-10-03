/**
 * Test Script: Supabase Storage Integration
 * 
 * This script tests the Supabase Storage integration for storing and retrieving PDFs.
 * Run this after uploading a document to verify the storage functionality.
 */

import { SupabaseStorageService } from './server/utils/supabase_storage.js';
import fs from 'fs';
import path from 'path';

async function testSupabaseStorage() {
  console.log('🧪 Testing Supabase Storage Integration\n');

  try {
    // Step 1: Create a test PDF file
    console.log('1️⃣ Creating test PDF file...');
    const testPdfPath = path.join(process.cwd(), 'test_document.pdf');
    const testContent = '%PDF-1.4\n%Test PDF Content\n%%EOF';
    fs.writeFileSync(testPdfPath, testContent);
    console.log('✅ Test PDF created\n');

    // Step 2: Upload to Supabase Storage
    console.log('2️⃣ Uploading to Supabase Storage...');
    const testDocId = 'test-' + Date.now();
    const testFilename = 'test_document.pdf';
    
    const { storagePath, publicUrl } = await SupabaseStorageService.uploadPDF(
      testPdfPath,
      testDocId,
      testFilename
    );
    
    console.log(`✅ Upload successful!`);
    console.log(`   Storage Path: ${storagePath}`);
    console.log(`   Public URL: ${publicUrl}\n`);

    // Step 3: Generate signed URL
    console.log('3️⃣ Generating signed URL...');
    const signedUrl = await SupabaseStorageService.getSignedUrl(storagePath);
    console.log(`✅ Signed URL generated:`);
    console.log(`   ${signedUrl}\n`);

    // Step 4: Download PDF
    console.log('4️⃣ Downloading PDF from storage...');
    const downloadedBuffer = await SupabaseStorageService.downloadPDF(storagePath);
    console.log(`✅ Downloaded ${downloadedBuffer.length} bytes\n`);

    // Step 5: Cleanup - Delete from storage
    console.log('5️⃣ Cleaning up - deleting from storage...');
    await SupabaseStorageService.deletePDF(storagePath);
    console.log('✅ Deleted from Supabase Storage\n');

    // Cleanup local test file
    fs.unlinkSync(testPdfPath);
    console.log('✅ Local test file removed\n');

    console.log('🎉 All tests passed! Supabase Storage integration working correctly.\n');
    
    console.log('📋 Summary:');
    console.log('   ✓ Bucket creation/verification');
    console.log('   ✓ PDF upload');
    console.log('   ✓ Signed URL generation');
    console.log('   ✓ PDF download');
    console.log('   ✓ PDF deletion');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('\n📝 Troubleshooting:');
    console.error('   1. Check SUPABASE_URL and SUPABASE_ANON_KEY in .env');
    console.error('   2. Verify Supabase project is active');
    console.error('   3. Check network connectivity');
    console.error('   4. Ensure storage bucket permissions are correct');
  }
}

// Run the test
testSupabaseStorage();
