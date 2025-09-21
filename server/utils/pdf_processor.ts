import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export interface ProcessingResult {
  success: boolean;
  csvPath?: string;
  recordCount?: number;
  chunkCount?: number;
  error?: string;
  afiNumber?: string;
  chapters?: number;
  collectionName?: string;
}

export class PDFProcessor {
  private static readonly SCRIPTS_DIR = path.join(process.cwd(), "server", "scripts");
  private static readonly TEMP_DIR = path.join(process.cwd(), "temp");
  private static readonly UPLOADS_DIR = path.join(process.cwd(), "uploads");

  static async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.TEMP_DIR, { recursive: true });
    await fs.mkdir(this.UPLOADS_DIR, { recursive: true });
  }

  static async processPDF(
    pdfPath: string, 
    docId: string,
    onProgress?: (progress: number, message?: string) => void
  ): Promise<ProcessingResult> {
    const processId = uuidv4();
    const csvPath = path.join(this.TEMP_DIR, `${processId}.csv`);
    const jsonPath = path.join(this.TEMP_DIR, `${processId}_embeddings.json`);

    try {
      // Ensure directories exist
      await this.ensureDirectories();

      // Step 1: Run AFI parser script (10-50%)
      onProgress?.(10, "Starting PDF parsing...");
      
      const parseResult = await this.runAFIParser(pdfPath, csvPath);
      if (!parseResult.success) {
        throw new Error(`PDF parsing failed: ${parseResult.error}`);
      }

      onProgress?.(50, "PDF parsing complete, generating embeddings...");

      // Step 2: Process CSV to ChromaDB with BGE embeddings (50-90%)
      const embeddingResult = await this.processCSVToChromaDB(csvPath, docId, (embeddingProgress, rowInfo) => {
        // Map embedding progress (0-100%) to overall progress (50-90%)
        const mappedProgress = 50 + (embeddingProgress * 0.4);
        onProgress?.(Math.round(mappedProgress), rowInfo || "Generating BGE embeddings...");
      });
      
      if (!embeddingResult.success) {
        throw new Error(`ChromaDB embedding generation failed: ${embeddingResult.error}`);
      }

      onProgress?.(95, "Embeddings stored in ChromaDB, finalizing...");

      onProgress?.(100, "Processing complete!");

      return {
        success: true,
        csvPath,
        recordCount: parseResult.recordCount,
        chunkCount: embeddingResult.chunkCount || 0,
        afiNumber: parseResult.afiNumber,
        chapters: parseResult.chapters,
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
      
      const pythonProcess = spawn("python3", [
        scriptPath,
        "--pdf_path", pdfPath,
        "--output_csv", csvPath
      ]);

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
  ): Promise<{ success: boolean; error?: string; chunkCount?: number; collectionName?: string }> {
    return new Promise((resolve) => {
      const scriptPath = path.join(this.SCRIPTS_DIR, "process_csv_to_chroma.py");
      const chromaDir = path.join(process.cwd(), "chroma_storage");
      
      const pythonProcess = spawn("python3", [
        scriptPath,
        "--csv_path", csvPath,
        "--doc_id", docId,
        "--chroma_dir", chromaDir
      ]);

      let stdout = "";
      let stderr = "";
      let chunkCount = 0;
      let collectionName = "";
      let totalRows = 0;

      pythonProcess.stdout.on("data", (data) => {
        const output = data.toString();
        stdout += output;
        console.log("ChromaDB Processor:", output.trim());

        // Parse detailed row progress: "Processing row 3428/3954: paragraph 14.3.3.3.1.3"
        const rowProgressMatch = output.match(/Processing row (\d+)\/(\d+): paragraph (.+)/);
        if (rowProgressMatch) {
          const currentRow = parseInt(rowProgressMatch[1]);
          totalRows = parseInt(rowProgressMatch[2]);
          const paragraphNumber = rowProgressMatch[3];
          
          // Calculate percentage (0-100%)
          const progress = Math.round((currentRow / totalRows) * 100);
          onProgress?.(progress, `Processing row ${currentRow}/${totalRows}: ${paragraphNumber}`);
        }

        // Parse batch progress: "✅ Processed 3430 rows..."
        const batchProgressMatch = output.match(/✅ Processed (\d+) rows/);
        if (batchProgressMatch) {
          const processedRows = parseInt(batchProgressMatch[1]);
          if (totalRows > 0) {
            const progress = Math.round((processedRows / totalRows) * 100);
            onProgress?.(progress, `Processed ${processedRows}/${totalRows} embeddings`);
          }
        }

        // Extract final chunk count and collection name
        const chunkMatch = output.match(/Total: (\d+) row-level embeddings/);
        if (chunkMatch) {
          chunkCount = parseInt(chunkMatch[1]);
        }
        
        const collectionMatch = output.match(/Collection: (\w+)/);
        if (collectionMatch) {
          collectionName = collectionMatch[1];
        }

        // Look for completion indicators
        if (output.includes("✅ BGE-Small embeddings stored in global ChromaDB collection")) {
          onProgress?.(100, "All embeddings stored successfully");
        }
      });

      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString();
        console.error("ChromaDB Processor Error:", data.toString().trim());
      });

      pythonProcess.on("close", (code) => {
        if (code === 0) {
          resolve({ 
            success: true, 
            chunkCount,
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

  static async importEmbeddingsToReplitDB(jsonPath: string): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
      // Import Replit Database
      const Database = (await import("@replit/database")).default;
      const db = new Database();

      // Read embedding data
      const embeddingData = JSON.parse(await fs.readFile(jsonPath, "utf8"));
      
      let importCount = 0;
      for (const [embeddingId, data] of Object.entries(embeddingData)) {
        // Use prefix to namespace embeddings
        const key = `embedding:${embeddingId}`;
        await db.set(key, data); // Store as object, not JSON string
        importCount++;
        
        if (importCount % 10 === 0) {
          console.log(`Imported ${importCount} embeddings...`);
        }
      }

      console.log(`Successfully imported ${importCount} embeddings to Replit DB`);
      
      return {
        success: true,
        count: importCount
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to import embeddings"
      };
    }
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