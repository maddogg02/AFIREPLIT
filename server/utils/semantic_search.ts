import { spawn } from "child_process";
import path from "path";

export interface SearchResult {
  id: string;
  text: string;
  metadata: {
    paragraph?: string;
    afi_number?: string;
    chapter?: string;
    doc_id?: string;
    compliance_tier?: string;
  };
  similarity_score: number;
}

export interface SearchResponse {
  success: boolean;
  query: string;
  total_matches: number;
  results: SearchResult[];
  error?: string;
}

export interface SearchFilters {
  doc_id?: string;
  afi_number?: string;
  min_score?: number;
}

export class SemanticSearchService {
  private static readonly SCRIPTS_DIR = path.join(process.cwd(), "server", "scripts");
  private static readonly CHROMA_DIR = path.join(process.cwd(), "chroma_storage_openai");

  /**
   * Search the ChromaDB collection for semantically similar content
   */
  static async searchDocuments(
    query: string,
    n_results: number = 5,
    filters?: SearchFilters
  ): Promise<SearchResponse> {
    return new Promise((resolve) => {
      const scriptPath = path.join(this.SCRIPTS_DIR, "search_chromadb_openai.py");
      
      // Build command arguments
      const args = [
        scriptPath,
        "--query", query,
        "--n_results", n_results.toString(),
        "--chroma_dir", this.CHROMA_DIR
      ];

      // Add optional filters
      if (filters?.doc_id) {
        args.push("--filter_doc_id", filters.doc_id);
      }
      if (filters?.afi_number) {
        args.push("--filter_afi_number", filters.afi_number);
      }
      if (filters?.min_score !== undefined) {
        args.push("--min_score", filters.min_score.toString());
      }

      const pythonProcess = spawn("python3", args, {
        env: { 
          ...process.env, 
          PYTHONIOENCODING: 'utf-8',
          HF_HUB_DISABLE_SYMLINKS_WARNING: '1'
        }
      });

      let stdout = "";
      let stderr = "";

      pythonProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      pythonProcess.on("close", (code) => {
        if (code === 0) {
          try {
            // Extract JSON output from stdout
            const jsonMatch = stdout.match(/JSON_OUTPUT: (.+)$/m);
            if (jsonMatch) {
              const result = JSON.parse(jsonMatch[1]) as SearchResponse;
              resolve(result);
            } else {
              resolve({
                success: false,
                query,
                total_matches: 0,
                results: [],
                error: "No JSON output found in search results"
              });
            }
          } catch (parseError) {
            resolve({
              success: false,
              query,
              total_matches: 0,
              results: [],
              error: `Failed to parse search results: ${parseError}`
            });
          }
        } else {
          resolve({
            success: false,
            query,
            total_matches: 0,
            results: [],
            error: `Search script failed with code ${code}: ${stderr}`
          });
        }
      });

      pythonProcess.on("error", (error) => {
        resolve({
          success: false,
          query,
          total_matches: 0,
          results: [],
          error: `Failed to start search process: ${error.message}`
        });
      });
    });
  }

  /**
   * Get collection statistics
   */
  static async getCollectionStats(): Promise<any> {
    return new Promise((resolve) => {
      const scriptPath = path.join(this.SCRIPTS_DIR, "search_chromadb_openai.py");
      
      const pythonProcess = spawn("python3", [
        scriptPath,
        "--query", "test",  // Dummy query
        "--stats",
        "--chroma_dir", this.CHROMA_DIR
      ], {
        env: { 
          ...process.env, 
          PYTHONIOENCODING: 'utf-8',
          HF_HUB_DISABLE_SYMLINKS_WARNING: '1'
        }
      });

      let stdout = "";
      let stderr = "";

      pythonProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      pythonProcess.on("close", (code) => {
        if (code === 0) {
          try {
            // Extract JSON output from stdout
            const jsonMatch = stdout.match(/JSON_OUTPUT: (.+)$/m);
            if (jsonMatch) {
              const result = JSON.parse(jsonMatch[1]);
              resolve(result);
            } else {
              resolve({ error: "No JSON output found" });
            }
          } catch (parseError) {
            resolve({ error: `Failed to parse stats: ${parseError}` });
          }
        } else {
          resolve({ error: `Stats script failed: ${stderr}` });
        }
      });
    });
  }
}