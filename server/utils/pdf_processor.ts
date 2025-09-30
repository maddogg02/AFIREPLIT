import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export interface ProcessingResult {
  success: boolean;
  csvPath?: string;
  recordCount?: number;
  error?: string;
  afiNumber?: string;
  chapters?: number;
  embeddingCount?: number;
  collectionName?: string;
}

export class PDFProcessor {
  private static readonly SCRIPTS_DIR = path.join(process.cwd(), "server", "scripts");
  private static readonly TEMP_DIR = path.join(process.cwd(), "temp");
  private static readonly UPLOADS_DIR = path.join(process.cwd(), "uploads");

  static async ensureDirectories(): Promise<void> {
    const dirs = [this.SCRIPTS_DIR, this.TEMP_DIR, this.UPLOADS_DIR];
    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        // Directory might already exist
      }
    }
  }

  /**
   * Complete RAG pipeline: PDF → CSV → OpenAI Embeddings → ChromaDB
   */
  static async processPDFToRAG(
    pdfPath: string,
    docId: string,
    onProgress?: (progress: number, message?: string) => void
  ): Promise<ProcessingResult> {
    try {
      await this.ensureDirectories();
      
      onProgress?.(5, "Starting PDF processing...");
      
      // Generate unique CSV path
      const csvFilename = `${docId}_${uuidv4()}.csv`;
      const csvPath = path.join(this.TEMP_DIR, csvFilename);
      
      onProgress?.(10, "Running AFI PDF parser...");
      
      // Step 1: PDF → CSV (10-40%)
      const parseResult = await this.runAFIParser(pdfPath, csvPath);
      
      if (!parseResult.success) {
        throw new Error(`PDF parsing failed: ${parseResult.error}`);
      }

      onProgress?.(40, "PDF parsed! Generating OpenAI embeddings...");
      
      // Step 2: CSV → OpenAI Embeddings → ChromaDB (40-95%)
      const embeddingResult = await this.processCSVToChromaDB(csvPath, docId, (embeddingProgress, rowInfo) => {
        // Map embedding progress (0-100%) to overall progress (40-95%)
        const mappedProgress = 40 + (embeddingProgress * 0.55);
        onProgress?.(Math.round(mappedProgress), rowInfo || "Creating OpenAI embeddings...");
      });
      
      if (!embeddingResult.success) {
        throw new Error(`ChromaDB embedding failed: ${embeddingResult.error}`);
      }

      onProgress?.(100, "RAG pipeline complete! Ready for semantic search.");

      return {
        success: true,
        csvPath,
        recordCount: parseResult.recordCount,
        afiNumber: parseResult.afiNumber,
        chapters: parseResult.chapters,
        embeddingCount: embeddingResult.embeddingCount,
        collectionName: embeddingResult.collectionName,
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Unknown processing error",
      };
    }
  }

  private static async runAFIParser(
    pdfPath: string, 
    csvPath: string
  ): Promise<{ success: boolean; error?: string; recordCount?: number; afiNumber?: string; chapters?: number }> {
    return new Promise((resolve) => {
      const scriptPath = path.join(this.SCRIPTS_DIR, "afi_simple_numbered.py");
      
      const pythonProcess = spawn("python", [
        scriptPath,
        "--pdf_path", pdfPath,
        "--output_csv", csvPath
      ], {
        env: { 
          ...process.env, 
          PYTHONIOENCODING: 'utf-8',
          HF_HUB_DISABLE_SYMLINKS_WARNING: '1'
        }
      });

      let stdout = "";
      let stderr = "";
      let recordCount = 0;
      let afiNumber = "UNKNOWN";
      let chapters = 0;

      pythonProcess.stdout.on("data", (data) => {
        const output = data.toString();
        stdout += output;
        console.log("AFI Parser:", output.trim());

        // Extract progress information - match actual Python script outputs
        const recordMatch = output.match(/Extracted (\d+) numbered paragraphs/);
        if (recordMatch) {
          recordCount = parseInt(recordMatch[1]);
        }

        const afiMatch = output.match(/Parsing ([^.]+)\.\.\./);
        if (afiMatch) {
          afiNumber = afiMatch[1];
        }

        // Look for chapter distribution summary
        const chapterSummaryMatch = output.match(/Chapters found: (\d+)/);
        if (chapterSummaryMatch) {
          chapters = parseInt(chapterSummaryMatch[1]);
        }
      });

      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString();
        console.error("AFI Parser Error:", data.toString().trim());
      });

      pythonProcess.on("close", (code) => {
        if (code === 0) {
          resolve({ 
            success: true, 
            recordCount, 
            afiNumber,
            chapters 
          });
        } else {
          resolve({ 
            success: false, 
            error: `Python script exited with code ${code}: ${stderr}` 
          });
        }
      });

      pythonProcess.on("error", (err) => {
        resolve({ 
          success: false, 
          error: `Failed to run Python script: ${err.message}` 
        });
      });
    });
  }

  private static async processCSVToChromaDB(
    csvPath: string,
    docId: string,
    onProgress?: (progress: number, message?: string) => void
  ): Promise<{ success: boolean; error?: string; embeddingCount?: number; collectionName?: string }> {
    return new Promise((resolve) => {
      const scriptPath = path.join(this.SCRIPTS_DIR, "csv_to_chromadb_openai.py");
      const chromaDir = path.join(process.cwd(), "chroma_storage_openai");
      
      const pythonProcess = spawn("python", [
        scriptPath,
        "--csv_path", csvPath,
        "--doc_id", docId,
        "--chroma_dir", chromaDir
      ], {
        env: { 
          ...process.env, 
          PYTHONIOENCODING: 'utf-8',
          HF_HUB_DISABLE_SYMLINKS_WARNING: '1'
        }
      });

      let stdout = "";
      let stderr = "";
      let embeddingCount = 0;
      let collectionName = "afi_documents_openai";
      let totalRows = 0;

      pythonProcess.stdout.on("data", (data) => {
        const output = data.toString();
        stdout += output;
        console.log("ChromaDB Pipeline:", output.trim());

        // Parse row progress: "Processing row 15/120: paragraph 1.2.3"
        const rowProgressMatch = output.match(/Processing row (\d+)\/(\d+): paragraph (.+)/);
        if (rowProgressMatch) {
          const currentRow = parseInt(rowProgressMatch[1]);
          totalRows = parseInt(rowProgressMatch[2]);
          const paragraphNumber = rowProgressMatch[3];
          
          // Calculate percentage (0-100%)
          const progress = Math.round((currentRow / totalRows) * 100);
          onProgress?.(progress, `Processing ${paragraphNumber} (${currentRow}/${totalRows})`);
        }

        // Parse batch progress: "✅ Processed batch of 50 embeddings"
        const batchProgressMatch = output.match(/✅ Processed batch of (\d+) embeddings/);
        if (batchProgressMatch) {
          const batchSize = parseInt(batchProgressMatch[1]);
          onProgress?.(50, `Stored batch of ${batchSize} OpenAI embeddings`);
        }

        // Extract final counts
        const totalDocsMatch = output.match(/Total documents in collection: (\d+)/);
        if (totalDocsMatch) {
          embeddingCount = parseInt(totalDocsMatch[1]);
        }

        // Look for completion
        if (output.includes("✅ OpenAI embeddings stored in ChromaDB")) {
          onProgress?.(100, "All OpenAI embeddings stored in ChromaDB");
        }
      });

      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString();
        console.error("ChromaDB Pipeline Error:", data.toString().trim());
      });

      pythonProcess.on("close", (code) => {
        if (code === 0) {
          resolve({ 
            success: true, 
            embeddingCount,
            collectionName
          });
        } else {
          resolve({ 
            success: false, 
            error: `ChromaDB script exited with code ${code}: ${stderr}` 
          });
        }
      });

      pythonProcess.on("error", (err) => {
        resolve({ 
          success: false, 
          error: `Failed to run ChromaDB script: ${err.message}` 
        });
      });
    });
  }

  static async cleanup(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
        console.log(`Cleaned up: ${filePath}`);
      } catch (error) {
        console.warn(`Failed to cleanup ${filePath}:`, error);
      }
    }
  }
}