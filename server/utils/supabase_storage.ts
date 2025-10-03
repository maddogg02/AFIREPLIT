import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Initialize Supabase clients
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing Supabase configuration. Please set SUPABASE_URL in your environment.');
}

if (!supabaseAnonKey && !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase credentials. Set SUPABASE_SERVICE_ROLE_KEY (preferred) or SUPABASE_ANON_KEY in your environment.');
}

if (!supabaseServiceRoleKey) {
  console.warn('[SupabaseStorage] SUPABASE_SERVICE_ROLE_KEY not set. Bucket creation and admin operations may fail.');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey ?? supabaseAnonKey!);
const supabaseAdmin = supabaseServiceRoleKey ? createClient(supabaseUrl, supabaseServiceRoleKey) : null;

export class SupabaseStorageService {
  private static BUCKET_NAME = 'afi-documents';

  /**
   * Ensure the bucket exists, create if it doesn't
   */
  static async ensureBucket(): Promise<void> {
    try {
      const adminClient = supabaseAdmin ?? supabase;
      const { data: buckets, error: listError } = await adminClient.storage.listBuckets();

      if (listError) {
        console.error('Error listing Supabase buckets:', listError);
        if (!supabaseAdmin) {
          throw new Error(
            'Unable to verify storage buckets with the anon key. Please set SUPABASE_SERVICE_ROLE_KEY or create the bucket manually.',
          );
        }
        throw new Error(`Failed to list storage buckets: ${listError.message}`);
      }

      const bucketExists = buckets?.some(b => b.name === this.BUCKET_NAME);

      if (!bucketExists) {
        if (!supabaseAdmin) {
          throw new Error(
            `Storage bucket "${this.BUCKET_NAME}" does not exist and cannot be created without SUPABASE_SERVICE_ROLE_KEY. ` +
            'Set the service role key (server-side only) or create the bucket manually in the Supabase dashboard.',
          );
        }

        const { error } = await supabaseAdmin.storage.createBucket(this.BUCKET_NAME, {
          public: false, // Set to false for private documents
          fileSizeLimit: 52428800, // 50 MB limit
        });

        if (error) {
          console.error('Error creating bucket:', error);
          throw new Error(`Failed to create storage bucket: ${error.message}`);
        }
        console.log(`✅ Created Supabase Storage bucket: ${this.BUCKET_NAME}`);
      }
    } catch (error: any) {
      console.error('Error ensuring bucket:', error);
      throw error;
    }
  }

  /**
   * Upload a PDF file to Supabase Storage
   * @param filePath - Local file path
   * @param documentId - Unique document ID
   * @param originalFilename - Original filename
   * @returns Object with storage path and public URL
   */
  static async uploadPDF(
    filePath: string,
    documentId: string,
    originalFilename: string
  ): Promise<{ storagePath: string; publicUrl: string }> {
    try {
      // Ensure bucket exists
      await this.ensureBucket();

      // Read file buffer
      const fileBuffer = fs.readFileSync(filePath);

      // Create storage path: documents/{documentId}/{filename}
      const storagePath = `documents/${documentId}/${originalFilename}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .upload(storagePath, fileBuffer, {
          contentType: 'application/pdf',
          upsert: false, // Don't overwrite if exists
        });

      if (error) {
        console.error('Supabase upload error:', error);
        throw new Error(`Failed to upload to Supabase Storage: ${error.message}`);
      }

      // Get public URL (for signed URLs or public access)
      const { data: urlData } = supabase.storage
        .from(this.BUCKET_NAME)
        .getPublicUrl(storagePath);

      console.log(`✅ PDF uploaded to Supabase Storage: ${storagePath}`);

      return {
        storagePath: data.path,
        publicUrl: urlData.publicUrl,
      };
    } catch (error: any) {
      console.error('Error uploading PDF to Supabase:', error);
      throw error;
    }
  }

  /**
   * Generate a signed URL for private document access (expires in 1 hour)
   * @param storagePath - Storage path from upload
   * @returns Signed URL
   */
  static async getSignedUrl(storagePath: string): Promise<string> {
    try {
      const { data, error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .createSignedUrl(storagePath, 3600); // 1 hour expiry

      if (error || !data) {
        const message = error?.message || 'Unknown error';
        const statusCode = (error as any)?.statusCode ?? (error as any)?.status;
        const err = new Error(`Failed to generate signed URL: ${message}`);
        (err as Error & { statusCode?: number }).statusCode = statusCode;
        throw err;
      }

      return data.signedUrl;
    } catch (error: any) {
      console.error('Error generating signed URL:', error);
      throw error;
    }
  }

  /**
   * Check whether a file exists in Supabase Storage
   * @param storagePath - Storage path including filename
   */
  static async fileExists(storagePath: string): Promise<boolean> {
    const normalizedPath = storagePath.replace(/^\/+/, "");
    const directory = path.posix.dirname(normalizedPath);
    const filename = path.posix.basename(normalizedPath);

    try {
      const { data, error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .list(directory === '.' ? undefined : directory, {
          limit: 1000,
        });

      if (error) {
        console.error('Error verifying file existence in Supabase:', error);
        return false;
      }

      return Array.isArray(data) && data.some((file) => file.name === filename);
    } catch (error) {
      console.error('Unexpected error while checking Supabase Storage:', error);
      return false;
    }
  }

  /**
   * Download a PDF from Supabase Storage
   * @param storagePath - Storage path
   * @returns Buffer of the PDF
   */
  static async downloadPDF(storagePath: string): Promise<Buffer> {
    try {
      const { data, error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .download(storagePath);

      if (error || !data) {
        throw new Error(`Failed to download PDF: ${error?.message || 'Unknown error'}`);
      }

      // Convert Blob to Buffer
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error: any) {
      console.error('Error downloading PDF from Supabase:', error);
      throw error;
    }
  }

  /**
   * Delete a PDF from Supabase Storage
   * @param storagePath - Storage path
   */
  static async deletePDF(storagePath: string): Promise<void> {
    try {
      const { error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .remove([storagePath]);

      if (error) {
        console.error('Error deleting PDF from Supabase:', error);
        throw new Error(`Failed to delete PDF: ${error.message}`);
      }

      console.log(`🗑️ PDF deleted from Supabase Storage: ${storagePath}`);
    } catch (error: any) {
      console.error('Error deleting PDF from Supabase:', error);
      throw error;
    }
  }

  /**
   * Upload a CSV file to Supabase Storage
   * @param filePath - Local CSV file path
   * @param documentId - Unique document ID
   * @param originalFilename - Original filename (will be used with .csv extension)
   * @returns Object with storage path
   */
  static async uploadCSV(
    filePath: string,
    documentId: string,
    originalFilename: string
  ): Promise<{ storagePath: string }> {
    try {
      // Ensure bucket exists
      await this.ensureBucket();

      // Read file buffer
      const fileBuffer = fs.readFileSync(filePath);

      // Create storage path: documents/{documentId}/parsed_data.csv
      const csvFilename = path.parse(originalFilename).name + '_parsed.csv';
      const storagePath = `documents/${documentId}/${csvFilename}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .upload(storagePath, fileBuffer, {
          contentType: 'text/csv',
          upsert: true, // Allow overwrite for reprocessing
        });

      if (error) {
        console.error('Supabase CSV upload error:', error);
        throw new Error(`Failed to upload CSV to Supabase Storage: ${error.message}`);
      }

      console.log(`✅ CSV uploaded to Supabase Storage: ${storagePath}`);

      return {
        storagePath: data.path,
      };
    } catch (error: any) {
      console.error('Error uploading CSV to Supabase:', error);
      throw error;
    }
  }

  /**
   * Download a CSV from Supabase Storage
   * @param storagePath - Storage path
   * @returns Buffer of the CSV
   */
  static async downloadCSV(storagePath: string): Promise<Buffer> {
    try {
      const { data, error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .download(storagePath);

      if (error || !data) {
        throw new Error(`Failed to download CSV: ${error?.message || 'Unknown error'}`);
      }

      // Convert Blob to Buffer
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error: any) {
      console.error('Error downloading CSV from Supabase:', error);
      throw error;
    }
  }

  /**
   * Delete a CSV from Supabase Storage
   * @param storagePath - Storage path
   */
  static async deleteCSV(storagePath: string): Promise<void> {
    try {
      const { error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .remove([storagePath]);

      if (error) {
        console.error('Error deleting CSV from Supabase:', error);
        throw new Error(`Failed to delete CSV: ${error.message}`);
      }

      console.log(`🗑️ CSV deleted from Supabase Storage: ${storagePath}`);
    } catch (error: any) {
      console.error('Error deleting CSV from Supabase:', error);
      throw error;
    }
  }
}
