import { RealChromaDBService } from './real_chromadb_service';

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

export class ChromaDBSearchService {
  private static isInitialized = false;

  /**
   * Ensure REAL ChromaDB is initialized
   */
  private static async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      console.log('🔧 Initializing REAL ChromaDB...');
      await RealChromaDBService.initialize();
      this.isInitialized = true;
    }
  }

  /**
   * Get statistics about the REAL ChromaDB storage
   */
  static async getStats() {
    try {
      await this.ensureInitialized();
      return await RealChromaDBService.getStats();
    } catch (error: any) {
      console.error('Error getting REAL ChromaDB stats:', error);
      return {
        totalEmbeddings: 0,
        documentsCount: 0,
        afiNumbers: [],
        storageType: `ChromaDB Error: ${error.message}`,
        sampleDimensions: 0
      };
    }
  }

  /**
   * Perform REAL semantic search using actual ChromaDB library
   */
  static async semanticSearch(
    query: string,
    options: {
      topK?: number;
      folderId?: string;
      afiNumber?: string;
      category?: string;
    } = {}
  ): Promise<SearchResult[]> {
    try {
      await this.ensureInitialized();
      return await RealChromaDBService.semanticSearch(query, options);
    } catch (error: any) {
      console.error("REAL ChromaDB search error:", error);
      throw new Error(`ChromaDB search failed: ${error.message}`);
    }
  }
}