import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertFolderSchema, insertDocumentSchema, insertChatSessionSchema, insertChatMessageSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import { PDFProcessor } from "./utils/pdf_processor";
import { OpenAIService } from "./utils/openai_service";
import { SemanticSearchService } from "./utils/semantic_search";
import { RAGChatService } from "./utils/rag_chat";

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Folders
  app.get("/api/folders", async (req, res) => {
    try {
      const folders = await storage.getFolders();
      res.json(folders);
    } catch (error) {
      console.error("Error fetching folders:", error);
      res.status(500).json({ error: "Failed to fetch folders" });
    }
  });

  app.post("/api/folders", async (req, res) => {
    try {
      const folderData = insertFolderSchema.parse(req.body);
      const folder = await storage.createFolder(folderData);
      res.status(201).json(folder);
    } catch (error) {
      console.error("Error creating folder:", error);
      res.status(400).json({ error: "Failed to create folder" });
    }
  });

  app.delete("/api/folders/:id", async (req, res) => {
    try {
      await storage.deleteFolder(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting folder:", error);
      res.status(500).json({ error: "Failed to delete folder" });
    }
  });

  // Documents
  app.get("/api/documents", async (req, res) => {
    try {
      const { folderId } = req.query;
      const documents = await storage.getDocuments(folderId as string);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/:id", async (req, res) => {
    try {
      const document = await storage.getDocument(req.params.id);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      console.error("Error fetching document:", error);
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  app.post("/api/documents/upload", upload.single('pdf'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { folderId } = req.body;
      if (!folderId) {
        return res.status(400).json({ error: "folderId is required" });
      }

      const documentData = {
        folderId,
        filename: req.file.originalname,
        afiNumber: "EXTRACTING", // Will be updated after Python processing
        fileSize: req.file.size,
        status: "processing" as const,
      };

      const document = await storage.createDocument(documentData);

      // Start Python processing in background
      processPDFAsync(req.file.path, document.id);

      res.status(201).json({ ...document, documentId: document.id });
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  app.patch("/api/documents/:id", async (req, res) => {
    try {
      const document = await storage.updateDocument(req.params.id, req.body);
      res.json(document);
    } catch (error) {
      console.error("Error updating document:", error);
      res.status(500).json({ error: "Failed to update document" });
    }
  });

  app.delete("/api/documents/:id", async (req, res) => {
    try {
      await storage.deleteDocument(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // Get document processing status (for real-time progress tracking)
  app.get("/api/documents/:id/status", async (req, res) => {
    try {
      const document = await storage.getDocument(req.params.id);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      const progress = document.processingProgress || 0;
      let message = "Processing...";
      
      // Generate descriptive messages based on progress
      if (progress < 10) {
        message = "Initializing...";
      } else if (progress < 50) {
        message = `Parsing PDF and extracting paragraphs... ${progress}%`;
      } else if (progress < 90) {
        message = `Generating OpenAI embeddings... ${Math.round((progress - 50) / 40 * 100)}% complete`;
      } else if (progress < 100) {
        message = "Finalizing and storing in ChromaDB...";
      } else {
        message = "Processing complete!";
      }
      
      res.json({
        status: document.status,
        progress,
        message,
        totalChunks: document.totalChunks,
        afiNumber: document.afiNumber
      });
    } catch (error) {
      console.error("Error fetching document status:", error);
      res.status(500).json({ error: "Failed to fetch document status" });
    }
  });

  // Chat Sessions
  app.get("/api/chat/sessions", async (req, res) => {
    try {
      const sessions = await storage.getChatSessions();
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching chat sessions:", error);
      res.status(500).json({ error: "Failed to fetch chat sessions" });
    }
  });

  app.post("/api/chat/sessions", async (req, res) => {
    try {
      const sessionData = insertChatSessionSchema.parse(req.body);
      const session = await storage.createChatSession(sessionData);
      res.status(201).json(session);
    } catch (error) {
      console.error("Error creating chat session:", error);
      res.status(400).json({ error: "Failed to create chat session" });
    }
  });

  app.get("/api/chat/sessions/:id/messages", async (req, res) => {
    try {
      const messages = await storage.getChatMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching chat messages:", error);
      res.status(500).json({ error: "Failed to fetch chat messages" });
    }
  });

  app.post("/api/chat/sessions/:id/messages", async (req, res) => {
    try {
      const { role, content } = req.body;
      const sessionId = req.params.id;
      
      // Save user message
      const userMessage = await storage.createChatMessage({
        sessionId,
        role: "user",
        content
      });
      
      // If this is a user message, generate AI response
      if (role === "user") {
        try {
          // Get session context for search scope
          const session = await storage.getChatSession(sessionId);
          
          // Get folder name if scope is set
          let folderName: string | undefined;
          if (session?.scopeFolder && session.scopeFolder !== "all") {
            const folder = await storage.getFolder(session.scopeFolder);
            folderName = folder?.name;
          }
          
          console.log(`🤖 Generating RAG response for: "${content}"`);
          
          // Use RAG system to generate response
          const ragResponse = await RAGChatService.askQuestion(content, {
            afi_number: session?.scopeAfi === "all" ? undefined : session?.scopeAfi,
            folder: folderName,
            n_results: 5
          });
          
          let aiResponseContent: string;
          let sources: any = null;
          
          if (ragResponse.success) {
            aiResponseContent = ragResponse.answer || "I couldn't generate a proper response.";
            
            // Format sources for storage
            if (ragResponse.sources && ragResponse.sources.length > 0) {
              sources = ragResponse.sources.map(source => ({
                reference: source.reference,
                afi_number: source.afi_number,
                chapter: source.chapter,
                paragraph: source.paragraph,
                similarity_score: source.similarity_score,
                text_preview: source.text_preview
              }));
            }
          } else {
            aiResponseContent = `I encountered an issue searching the AFI database: ${ragResponse.error}. Please try rephrasing your question.`;
          }
          
          // Save AI response with sources
          const aiMessage = await storage.createChatMessage({
            sessionId,
            role: "assistant",
            content: aiResponseContent,
            sources: sources
          });
          
          console.log(`✅ RAG response generated with ${ragResponse.sources?.length || 0} sources`);
          res.status(201).json({ userMessage, aiMessage });
        } catch (searchError) {
          console.error("Error generating RAG response:", searchError);
          
          // Save fallback AI response
          const fallbackMessage = await storage.createChatMessage({
            sessionId,
            role: "assistant",
            content: "I'm currently experiencing issues accessing the AFI database. Please try again later."
          });
          
          res.status(201).json({ userMessage, aiMessage: fallbackMessage });
        }
      } else {
        // Just return the saved message for non-user messages
        res.status(201).json(userMessage);
      }
    } catch (error) {
      console.error("Error creating chat message:", error);
      res.status(400).json({ error: "Failed to create chat message" });
    }
  });

  // Semantic Search API Endpoints
  
  // Search documents using semantic similarity
  app.post("/api/search", async (req, res) => {
    try {
      const { query, n_results = 5, filters } = req.body;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: "Query is required and must be a string" });
      }

      const searchResults = await SemanticSearchService.searchDocuments(
        query, 
        n_results, 
        filters
      );

      res.json(searchResults);
    } catch (error: any) {
      console.error("Search error:", error);
      res.status(500).json({ 
        success: false,
        error: "Internal search error",
        query: req.body.query || null,
        total_matches: 0,
        results: []
      });
    }
  });

  // Get ChromaDB collection statistics
  app.get("/api/search/stats", async (req, res) => {
    try {
      const stats = await SemanticSearchService.getCollectionStats();
      res.json(stats);
    } catch (error: any) {
      console.error("Stats error:", error);
      res.status(500).json({ error: "Failed to get collection statistics" });
    }
  });

  // Serve search demo page
  app.get("/search-demo", (req, res) => {
    res.sendFile(path.join(process.cwd(), "search-demo.html"));
  });

  const httpServer = createServer(app);

  return httpServer;
}

// Complete RAG pipeline processing
async function processPDFAsync(filePath: string, documentId: string) {
  try {
    console.log(`Starting RAG pipeline for document ${documentId}`);
    
    // Process PDF through complete RAG pipeline: PDF → CSV → OpenAI Embeddings → ChromaDB
    const result = await PDFProcessor.processPDFToRAG(
      filePath, 
      documentId,
      async (progress: number, message?: string) => {
        console.log(`Progress: ${progress}% - ${message}`);
        await storage.updateDocument(documentId, { 
          processingProgress: progress,
          status: progress < 100 ? "processing" : "complete"
        });
      }
    );

    if (result.success) {
      // Update document with final status and extracted AFI number - RAG pipeline complete
      await storage.updateDocument(documentId, {
        status: "complete",
        afiNumber: result.afiNumber || "UNKNOWN", // Update with extracted AFI number
        totalChunks: result.embeddingCount || result.recordCount || 0,
        processingProgress: 100
      });
      
      console.log(`✅ RAG pipeline complete for ${result.afiNumber}:`);
      console.log(`  📄 ${result.recordCount} paragraphs extracted`);
      console.log(`  🧠 ${result.embeddingCount} OpenAI embeddings created`);
      console.log(`  🗃️ Stored in ChromaDB collection: ${result.collectionName}`);
    } else {
      throw new Error(`RAG pipeline failed: ${result.error}`);
    }

    // Clean up temporary files
    const filesToCleanup = [filePath];
    if (result.csvPath) filesToCleanup.push(result.csvPath);
    
    await PDFProcessor.cleanup(filesToCleanup);
    
    console.log(`PDF processing completed successfully for ${documentId}`);

  } catch (error: any) {
    console.error("Error processing PDF:", error);
    await storage.updateDocument(documentId, { 
      status: "error",
      processingProgress: 0
    });
  }
}
