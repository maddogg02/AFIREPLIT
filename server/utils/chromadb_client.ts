import { ChromaClient } from 'chromadb';
import { getOpenAIEmbeddings } from './openai_service';

export interface EmbeddingDocument {
  id: string;
  text: string;
  metadata: {
    doc_id: string;
    afi_number: string;
    folder: string;
    category: string;
    chapter: string;
    section: string;
    paragraph: string;
    section_path: string;
    compliance_tier: string;
    page_number: string;
    chunk_size: string;
  };
}

export interface SearchResult {
  score: number;
  text: string;
  metadata: EmbeddingDocument['metadata'];
}

export class ChromaDBClient {
  private client: ChromaClient;
  private collectionName = 'afi_chunks';

  constructor() {
    // ChromaDB Node.js client is server-based, not embedded
    // Use default connection (assumes ChromaDB server running on localhost:8000)
    this.client = new ChromaClient();
  }

  async initializeCollection() {
    try {
      // Try to get existing collection
      await this.client.getCollection({ name: this.collectionName });
      console.log(`✅ Using existing ChromaDB collection: ${this.collectionName}`);
    } catch {
      // Create new collection if it doesn't exist - disable default embedding function
      await this.client.createCollection({ 
        name: this.collectionName,
        metadata: { description: 'AFI chunks with OpenAI embeddings' },
        embeddingFunction: undefined // Use custom embeddings, not default
      });
      console.log(`✅ Created new ChromaDB collection: ${this.collectionName}`);
    }
  }

  async addDocuments(documents: EmbeddingDocument[]): Promise<void> {
    if (documents.length === 0) return;

    console.log(`🔄 Adding ${documents.length} documents to ChromaDB...`);

    // Get collection
    const collection = await this.client.getCollection({ name: this.collectionName });

    // Generate embeddings for all documents
    const texts = documents.map(doc => doc.text);
    console.log(`🤖 Generating OpenAI embeddings for ${texts.length} documents...`);
    
    const embeddings = await getOpenAIEmbeddings(texts);

    // Add documents in batches
    const batchSize = 100;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const batchEmbeddings = embeddings.slice(i, i + batchSize);

      await collection.add({
        ids: batch.map(doc => doc.id),
        documents: batch.map(doc => doc.text),
        embeddings: batchEmbeddings,
        metadatas: batch.map(doc => doc.metadata)
      });

      console.log(`✅ Added batch ${Math.floor(i/batchSize) + 1}: ${batch.length} documents`);
    }

    console.log(`🎉 Successfully added ${documents.length} documents to ChromaDB`);
  }

  async deleteDocumentsByDocId(docId: string): Promise<void> {
    try {
      const collection = await this.client.getCollection({ name: this.collectionName });
      
      // Get existing documents for this doc_id
      const existing = await collection.get({ where: { doc_id: docId } });
      
      if (existing.ids && existing.ids.length > 0) {
        await collection.delete({ where: { doc_id: docId } });
        console.log(`🗑️  Deleted ${existing.ids.length} existing embeddings for document ${docId}`);
      }
    } catch (error: any) {
      console.log(`ℹ️  No existing embeddings found for document ${docId}: ${error.message}`);
    }
  }

  async searchSimilar(
    query: string,
    options: {
      topK?: number;
      folderId?: string;
      afiNumber?: string;
      category?: string;
    } = {}
  ): Promise<SearchResult[]> {
    const { topK = 5, folderId, afiNumber, category } = options;

    console.log(`🔍 Searching ChromaDB for: "${query}"`);

    // Generate query embedding
    const queryEmbedding = await getOpenAIEmbeddings([query]);

    // Build where filter
    const whereFilter: any = {};
    if (afiNumber) {
      whereFilter.afi_number = afiNumber;
      console.log(`  Filtering by AFI: ${afiNumber}`);
    }
    if (folderId) {
      whereFilter.folder = folderId;
      console.log(`  Filtering by folder: ${folderId}`);
    }
    if (category) {
      whereFilter.category = category;
      console.log(`  Filtering by category: ${category}`);
    }

    // Get collection and search
    const collection = await this.client.getCollection({ name: this.collectionName });
    
    const results = await collection.query({
      queryEmbeddings: queryEmbedding,
      nResults: topK,
      include: ['documents', 'metadatas', 'distances'],
      where: Object.keys(whereFilter).length > 0 ? whereFilter : undefined
    });

    // Format results
    const searchResults: SearchResult[] = [];
    
    if (results.documents && results.documents[0] && results.metadatas && results.metadatas[0]) {
      const documents = results.documents[0];
      const metadatas = results.metadatas[0];
      const distances = results.distances?.[0] || [];

      for (let i = 0; i < documents.length; i++) {
        const distance = distances[i] || 1.0;
        const score = Math.max(0, 1 - distance); // Convert distance to similarity score

        searchResults.push({
          score,
          text: documents[i],
          metadata: metadatas[i] as EmbeddingDocument['metadata']
        });
      }
    }

    console.log(`📊 Found ${searchResults.length} relevant results`);
    return searchResults;
  }

  async getCollectionCount(): Promise<number> {
    try {
      const collection = await this.client.getCollection({ name: this.collectionName });
      return await collection.count();
    } catch {
      return 0;
    }
  }
}

// Singleton instance
export const chromaClient = new ChromaDBClient();