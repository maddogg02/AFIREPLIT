/**
 * Complete RAG Chat Service - TypeScript Interface
 * Integrates semantic search with OpenAI chat completion for natural language Q&A
 */

import { spawn } from "child_process";
import path from "path";

export interface RAGResponse {
  success: boolean;
  query: string;
  response?: string;
  answer?: string;
  raw_answer?: string;
  sources?: SourceCitation[];
  search_results_count?: number;
  filtered_results_count?: number;
  context?: ContextEntry[];
  model_used?: string;
  model?: string;
  filter_model_used?: string;
  embedding_model?: string;
  hybrid_mode?: boolean;
  template_used?: string;
  error?: string;
  context_truncated?: boolean;
  context_length?: number;
  context_char_limit?: number;
  min_score_used?: number;
  filter_applied?: boolean;
  relevance_filter_fallback?: boolean;
  knowledge_fallback?: boolean;
  request_id?: string;
  source_annotations?: SourceAnnotation[];
  timings?: RAGTimings;
}

export interface SourceCitation {
  reference: number;
  afi_number: string;
  chapter: string;
  paragraph: string;
  similarity_score: number;
  weighted_score?: number;
  text_preview: string;
  metadata?: Record<string, unknown>;
}

export interface ContextEntry {
  reference: number;
  text: string;
  metadata: Record<string, unknown>;
  similarity_score?: number;
  weighted_score?: number;
}

export interface SourceAnnotation {
  reference: number;
  label: string;
}

export interface RAGTimings {
  total_ms: number;
  retrieval_ms?: number;
  filter_ms?: number;
  generation_ms?: number;
}

export interface RAGFilters {
  afi_number?: string;
  chapter?: string;
  folder?: string;
  n_results?: number;
  model?: string;
  hybrid_mode?: boolean;
  min_score?: number;
  skip_filter?: boolean;
  max_tokens?: number;
}

export class RAGChatService {
  private static readonly SCRIPTS_DIR = path.join(process.cwd(), "server", "scripts");
  private static readonly CHROMA_DIR = path.join(process.cwd(), "chroma_storage_openai");

  /**
   * Ask a question using the complete RAG system
   */
  static async askQuestion(
    query: string,
    filters?: RAGFilters
  ): Promise<RAGResponse> {
    return new Promise((resolve) => {
  const scriptPath = path.join(this.SCRIPTS_DIR, "query", "run_rag_chat.py");
      
      // Build command arguments
      const args = [
        scriptPath,
        "--query", query,
        "--chroma_dir", this.CHROMA_DIR,
        "--json" // Request JSON output for parsing
      ];
      
      // Add optional filters
      if (filters?.n_results) {
        args.push("--n_results", filters.n_results.toString());
      }
      
      if (filters?.afi_number) {
        args.push("--afi_number", filters.afi_number);
      }
      
      if (filters?.chapter) {
        args.push("--chapter", filters.chapter);
      }
      
      if (filters?.folder) {
        args.push("--folder", filters.folder);
      }
      
      if (filters?.model) {
        args.push("--model", filters.model);
      }
      
      // Add hybrid mode support (default is true, so only add --no-hybrid if explicitly disabled)
      if (filters?.hybrid_mode === false) {
        args.push("--no-hybrid");
      }

      if (typeof filters?.min_score === "number") {
        args.push("--min-score", filters.min_score.toString());
      }

      if (filters?.skip_filter) {
        args.push("--no-filter");
      }

      if (filters?.max_tokens) {
        args.push("--max-tokens", filters.max_tokens.toString());
      }
      
      console.log(`🤖 RAG Chat: Asking "${query}"`);
      
      // Ensure OPENAI_API_KEY is available
      if (!process.env.OPENAI_API_KEY) {
        console.error("❌ OPENAI_API_KEY not found in environment");
      } else {
        console.log("✅ OPENAI_API_KEY found in environment");
      }
      
      const pythonProcess = spawn("python", args, {
        env: { 
          ...process.env, 
          OPENAI_API_KEY: process.env.OPENAI_API_KEY, // Explicitly pass the API key
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
        console.error("RAG Chat Error:", data.toString().trim());
      });

      pythonProcess.on("close", (code) => {
        console.log(`🐍 Python process completed with code: ${code}`);
        console.log(`🐍 Python STDOUT: "${stdout.trim()}"`);
        console.log(`🐍 Python STDERR: "${stderr.trim()}"`);
        
        if (code === 0) {
          try {
            // Parse JSON response
            const result: RAGResponse = JSON.parse(stdout.trim());
            console.log(`✅ RAG Chat: Generated response for "${query}"`);
            resolve(result);
          } catch (parseError) {
            console.error("Failed to parse RAG response:", parseError);
            console.error(`Raw output that failed to parse: "${stdout.trim()}"`);
            resolve({
              success: false,
              query,
              error: `Failed to parse response: ${parseError}`
            });
          }
        } else {
          console.error(`RAG Chat process failed with code ${code}`);
          console.error("STDERR:", stderr);
          resolve({
            success: false,
            query,
            error: `RAG process failed: ${stderr || 'Unknown error'}`
          });
        }
      });

      // Handle process errors
      pythonProcess.on("error", (error) => {
        console.error("Failed to start RAG Chat process:", error);
        resolve({
          success: false,
          query,
          error: `Failed to start process: ${error.message}`
        });
      });
    });
  }

  /**
   * Ask multiple questions in batch
   */
  static async askQuestions(
    queries: string[],
    filters?: RAGFilters
  ): Promise<RAGResponse[]> {
    const results: RAGResponse[] = [];
    
    // Process questions sequentially to avoid overwhelming the API
    for (const query of queries) {
      const result = await this.askQuestion(query, filters);
      results.push(result);
      
      // Small delay between requests to be respectful to OpenAI API
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
  }

  /**
   * Get suggested questions based on document content
   */
  static getSuggestedQuestions(): string[] {
    return [
      "What are the maintenance training requirements?",
      "What are the responsibilities of maintenance supervisors?",
      "What are the uniform standards?",
      "What are the safety requirements for maintenance operations?",
      "How should maintenance documentation be handled?",
      "What are the requirements for tool accountability?",
      "What are the procedures for equipment inspections?",
      "What are the foreign object damage prevention requirements?",
      "How should maintenance scheduling be managed?",
      "What are the quality assurance requirements?"
    ];
  }

  /**
   * Format RAG response for display
   */
  static formatResponse(response: RAGResponse): string {
    if (!response.success) {
      return `❌ Error: ${response.error}`;
    }

    let formatted = `🎯 **Answer:**\n${response.answer}\n\n`;
    
    if (response.sources && response.sources.length > 0) {
      formatted += `📚 **Sources:**\n`;
      response.sources.forEach((source) => {
        formatted += `[${source.reference}] ${source.afi_number} Ch.${source.chapter} Para.${source.paragraph} (Score: ${source.similarity_score.toFixed(3)})\n`;
      });
    }
    
    return formatted;
  }

  /**
   * Extract key information from RAG response
   */
  static extractKeyInfo(response: RAGResponse): {
    hasAnswer: boolean;
    sourceCount: number;
    averageScore: number;
    referencedAFIs: string[];
    referencedChapters: string[];
  } {
    if (!response.success || !response.sources) {
      return {
        hasAnswer: false,
        sourceCount: 0,
        averageScore: 0,
        referencedAFIs: [],
        referencedChapters: []
      };
    }

    const averageScore = response.sources.reduce((sum, source) => sum + source.similarity_score, 0) / response.sources.length;
    const referencedAFIs = Array.from(new Set(response.sources.map(s => s.afi_number)));
    const referencedChapters = Array.from(new Set(response.sources.map(s => `Ch.${s.chapter}`)));

    return {
      hasAnswer: true,
      sourceCount: response.sources.length,
      averageScore,
      referencedAFIs,
      referencedChapters
    };
  }
}