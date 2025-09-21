import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertFolderSchema, insertDocumentSchema, insertChatSessionSchema, insertChatMessageSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import { PDFProcessor } from "./utils/pdf_processor";
import { ChromaDBSearchService } from "./utils/chromadb_search";
import { OpenAIService } from "./utils/openai_service";

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

      const { folderId, afiNumber } = req.body;
      if (!folderId || !afiNumber) {
        return res.status(400).json({ error: "folderId and afiNumber are required" });
      }

      const documentData = {
        folderId,
        filename: req.file.originalname,
        afiNumber,
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
        message = `Generating BGE embeddings... ${Math.round((progress - 50) / 40 * 100)}% complete`;
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

  // Semantic search using global ChromaDB collection with metadata filtering
  app.get("/api/search", async (req, res) => {
    try {
      const { q, folderId, afiNumber, category, topK } = req.query;
      if (!q) {
        return res.status(400).json({ error: "Query parameter 'q' is required" });
      }

      const results = await ChromaDBSearchService.semanticSearch(
        q as string,
        {
          topK: topK ? parseInt(topK as string) : 5,
          folderId: folderId as string,
          afiNumber: afiNumber as string,
          category: category as string
        }
      );
      
      res.json(results);
    } catch (error) {
      console.error("Error performing ChromaDB search:", error);
      res.status(500).json({ error: "Failed to perform semantic search" });
    }
  });

  // Get ChromaDB embedding statistics
  app.get("/api/embeddings/stats", async (req, res) => {
    try {
      const stats = await ChromaDBSearchService.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching ChromaDB stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
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
          
          // Perform semantic search with global ChromaDB collection
          const searchResults = await ChromaDBSearchService.semanticSearch(
            content,
            {
              topK: 3,
              folderId: session?.scopeFolder === "all" ? undefined : session?.scopeFolder,
              afiNumber: session?.scopeAfi === "all" ? undefined : session?.scopeAfi
            }
          );
          
          // Generate AI response using OpenAI RAG
          let aiResponse: string;
          let sources: Array<{
            afiNumber: string;
            chapter: string;
            section: string;
            paragraph: string;
            text: string;
            score: number;
          }> = [];
          
          if (searchResults.length > 0) {
            // Extract sources for citation tracking
            sources = searchResults.map(result => ({
              afiNumber: result.metadata.afi_number,
              chapter: result.metadata.chapter,
              section: result.metadata.section || '',
              paragraph: result.metadata.paragraphs[0] || '',
              text: result.text,
              score: result.score
            }));
            
            // Generate intelligent response using OpenAI RAG
            aiResponse = await OpenAIService.generateRAGResponse(content, searchResults);
          } else {
            aiResponse = "I couldn't find specific information related to your question in the available AFI documentation. Please try rephrasing your question or check if the relevant documents have been uploaded and processed.";
          }
          
          // Save AI response
          const aiMessage = await storage.createChatMessage({
            sessionId,
            role: "assistant",
            content: aiResponse,
            sources: sources.length > 0 ? sources : null
          });
          
          res.status(201).json({ userMessage, aiMessage });
        } catch (searchError) {
          console.error("Error generating AI response:", searchError);
          
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

  const httpServer = createServer(app);

  return httpServer;
}

// Real PDF processing using Python scripts and Replit DB
async function processPDFAsync(filePath: string, documentId: string) {
  try {
    console.log(`Starting real PDF processing for document ${documentId}`);
    
    // Process PDF with real Python script
    const result = await PDFProcessor.processPDF(
      filePath, 
      documentId,
      async (progress, message) => {
        console.log(`Progress: ${progress}% - ${message}`);
        await storage.updateDocument(documentId, { 
          processingProgress: progress,
          status: progress < 100 ? "processing" : "embedding"
        });
      }
    );

    if (result.success) {
      // Update document with final status - ChromaDB stores directly
      await storage.updateDocument(documentId, {
        status: "complete",
        totalChunks: result.chunkCount || 0,
        processingProgress: 100
      });
      
      console.log(`Successfully processed ${result.afiNumber}: ${result.chunkCount} embeddings created in ChromaDB collection ${result.collectionName}`);
    } else {
      throw new Error(`PDF processing failed: ${result.error}`);
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
