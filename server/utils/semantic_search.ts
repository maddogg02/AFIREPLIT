import crypto from "crypto";

export interface SearchResult {
  score: number;
  text: string;
  metadata: {
    doc_id: string;
    folder: string;
    afi_number: string;
    chapter: string;
    section?: string;
    paragraphs: string[];
    section_path: string;
    page_numbers: number[];
    categories: string[];
    compliance_tiers: string[];
    chunk_size: number;
  };
}

export class SemanticSearchService {
  private static db: any = null;

  static async initializeDB() {
    if (!this.db) {
      const Database = (await import("@replit/database")).default;
      this.db = new Database();
    }
    return this.db;
  }

  /**
   * Create a simple embedding for the query
   * This is a mock implementation - in production you'd use sentence-transformers
   */
  private static createQueryEmbedding(query: string): number[] {
    // Simple hash-based embedding for consistent results
    const hash = crypto.createHash("md5").update(query).digest("hex");
    
    const embedding = [];
    for (let i = 0; i < hash.length; i += 2) {
      const hexPair = hash.substring(i, i + 2);
      const val = parseInt(hexPair, 16) / 128.0 - 1.0;
      embedding.push(val);
    }
    
    // Pad to 384 dimensions to match our mock embeddings
    while (embedding.length < 384) {
      embedding.push(...embedding.slice(0, Math.min(embedding.length, 384 - embedding.length)));
    }
    
    return embedding.slice(0, 384);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Vectors must have the same length");
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Perform semantic search across all embeddings
   */
  static async semanticSearch(
    query: string,
    options: {
      topK?: number;
      folderId?: string;
      afiNumber?: string;
      minScore?: number;
    } = {}
  ): Promise<SearchResult[]> {
    const { topK = 5, folderId, afiNumber, minScore = 0.1 } = options;

    try {
      const db = await this.initializeDB();
      
      // Get query embedding
      const queryEmbedding = this.createQueryEmbedding(query);
      
      // Get all keys from Replit DB with embedding prefix
      const keys = await db.list("embedding:");
      const results: SearchResult[] = [];
      
      console.log(`Searching through ${keys.length} embeddings for: "${query}"`);
      
      for (const key of keys) {
        try {
          const record = await db.get(key);
          if (!record) continue;
          
          // Handle if record is already an object vs string
          const embedding_record = typeof record === 'string' ? JSON.parse(record) : record;
          if (!embedding_record.embedding || !embedding_record.metadata) continue;
          
          // Apply filters
          if (folderId && embedding_record.metadata.folder !== folderId) continue;
          if (afiNumber && embedding_record.metadata.afi_number !== afiNumber) continue;
          
          // Calculate similarity
          const score = this.cosineSimilarity(queryEmbedding, embedding_record.embedding);
          
          if (score >= minScore) {
            results.push({
              score,
              text: embedding_record.text,
              metadata: embedding_record.metadata
            });
          }
        } catch (error) {
          console.warn(`Error processing record ${key}:`, error);
          continue;
        }
      }
      
      // Sort by score (highest first) and return top K
      results.sort((a, b) => b.score - a.score);
      
      console.log(`Found ${results.length} relevant results, returning top ${topK}`);
      
      return results.slice(0, topK);
      
    } catch (error: any) {
      console.error("Semantic search error:", error);
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * Get embedding count and statistics
   */
  static async getStats(): Promise<{
    totalEmbeddings: number;
    byFolder: Record<string, number>;
    byAFI: Record<string, number>;
  }> {
    try {
      const db = await this.initializeDB();
      const keys = await db.list("embedding:");
      
      const stats = {
        totalEmbeddings: 0,
        byFolder: {} as Record<string, number>,
        byAFI: {} as Record<string, number>
      };
      
      for (const key of keys) {
        try {
          const record = await db.get(key);
          if (!record) continue;
          
          const embedding_record = typeof record === 'string' ? JSON.parse(record) : record;
          if (!embedding_record.metadata) continue;
          
          stats.totalEmbeddings++;
          
          const folder = embedding_record.metadata.folder || "Unknown";
          const afi = embedding_record.metadata.afi_number || "Unknown";
          
          stats.byFolder[folder] = (stats.byFolder[folder] || 0) + 1;
          stats.byAFI[afi] = (stats.byAFI[afi] || 0) + 1;
          
        } catch (error) {
          continue;
        }
      }
      
      return stats;
      
    } catch (error: any) {
      console.error("Stats error:", error);
      throw new Error(`Failed to get stats: ${error.message}`);
    }
  }
}