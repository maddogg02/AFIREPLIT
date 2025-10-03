import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, type DocumentFilters } from "./storage";
import { insertFolderSchema, insertDocumentSchema, insertChatSessionSchema, insertChatMessageSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import { PDFProcessor } from "./utils/pdf_processor";
import { OpenAIService } from "./utils/openai_service";
import { SemanticSearchService } from "./utils/semantic_search";
import { RAGChatService } from "./utils/rag_chat";
import { SupabaseStorageService } from "./utils/supabase_storage";

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

  app.patch("/api/folders/:id", async (req, res) => {
    try {
      const { name, description } = req.body as { name?: string; description?: string };
      const updates: Record<string, any> = {};
      if (typeof name === "string" && name.trim()) updates.name = name.trim();
      if (typeof description === "string") updates.description = description;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No updates provided" });
      }

      const updated = await storage.updateFolder(req.params.id, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating folder:", error);
      res.status(500).json({ error: "Failed to update folder" });
    }
  });

  app.delete("/api/folders/:id", async (req, res) => {
    try {
      const folderId = req.params.id;

      // Find all documents in this folder and delete them via the same logic as /api/documents/:id
      const docs = await storage.getDocuments({ folderId });
      for (const document of docs) {
        try {
          if (document.storagePath) {
            try {
              await SupabaseStorageService.deletePDF(document.storagePath);
              console.log(`🗑️ Deleted PDF from Supabase: ${document.storagePath}`);
            } catch (e) {
              console.error("Failed to delete PDF from Supabase Storage:", e);
            }
          }
          if (document.csvStoragePath) {
            try {
              await SupabaseStorageService.deleteCSV(document.csvStoragePath);
              console.log(`🗑️ Deleted CSV from Supabase: ${document.csvStoragePath}`);
            } catch (e) {
              console.error("Failed to delete CSV from Supabase Storage:", e);
            }
          }
          await storage.deleteDocument(document.id);
        } catch (docErr) {
          console.error(`Failed to delete document ${document.id} while deleting folder:`, docErr);
        }
      }

      // Finally remove the folder itself
      await storage.deleteFolder(folderId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting folder:", error);
      res.status(500).json({ error: "Failed to delete folder" });
    }
  });

  // Documents
  app.get("/api/documents", async (req, res) => {
    try {
      const { folderId, status, search, afiSeries, limit, offset } = req.query;

      const parsedStatus =
        typeof status === "string" && ["processing", "complete", "error"].includes(status)
          ? (status as DocumentFilters["status"])
          : undefined;

      const parsedLimit = typeof limit === "string" ? Number.parseInt(limit, 10) : undefined;
      const parsedOffset = typeof offset === "string" ? Number.parseInt(offset, 10) : undefined;

      const safeLimit =
        typeof parsedLimit === "number" && Number.isFinite(parsedLimit) ? parsedLimit : undefined;
      const safeOffset =
        typeof parsedOffset === "number" && Number.isFinite(parsedOffset) ? parsedOffset : undefined;

      const filters: DocumentFilters = {
        folderId: typeof folderId === "string" && folderId !== "all" ? folderId : undefined,
        status: parsedStatus,
        search: typeof search === "string" && search.trim() ? search.trim() : undefined,
        afiSeries: typeof afiSeries === "string" && afiSeries !== "all" ? afiSeries : undefined,
        limit: safeLimit,
        offset: safeOffset,
      };

      const documents = await storage.getDocuments(filters);

      const documentsWithAvailability = await Promise.all(
        documents.map(async (document) => {
          const [hasPdf, hasParsedCsv] = await Promise.all([
            document.storagePath
              ? SupabaseStorageService.fileExists(document.storagePath)
              : Promise.resolve(false),
            document.csvStoragePath
              ? SupabaseStorageService.fileExists(document.csvStoragePath)
              : Promise.resolve(false),
          ]);

          return {
            ...document,
            hasPdf,
            hasParsedCsv,
          };
        }),
      );

      res.json(documentsWithAvailability);
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

      const [hasPdf, hasParsedCsv] = await Promise.all([
        document.storagePath
          ? SupabaseStorageService.fileExists(document.storagePath)
          : Promise.resolve(false),
        document.csvStoragePath
          ? SupabaseStorageService.fileExists(document.csvStoragePath)
          : Promise.resolve(false),
      ]);

      res.json({
        ...document,
        hasPdf,
        hasParsedCsv,
      });
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

      const isTechnicalOrder = String(req.body?.isTechnicalOrder ?? "false").toLowerCase() === "true";

  const filenameBase = path.parse(req.file.originalname).name.trim() || req.file.originalname;
  const normalizedBase = filenameBase.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
      let initialAfiName = normalizedBase;

      if (isTechnicalOrder) {
        const stripped = normalizedBase.replace(/^(?:T\.?O\.?|TECHNICAL\s+ORDER)[-_\s]*/i, "").trim();
        initialAfiName = stripped ? `TO ${stripped}` : "TO";
      }

      const documentData = {
        folderId,
        filename: req.file.originalname,
        afiNumber: initialAfiName,
        fileSize: req.file.size,
        status: "processing" as const,
      };

      const document = await storage.createDocument(documentData);

      // Upload PDF to Supabase Storage
      try {
        const { storagePath, publicUrl } = await SupabaseStorageService.uploadPDF(
          req.file.path,
          document.id,
          req.file.originalname
        );

        // Update document with storage information
        await storage.updateDocument(document.id, {
          storageBucket: 'afi-documents',
          storagePath: storagePath,
          storagePublicUrl: publicUrl,
        });

        console.log(`✅ PDF stored in Supabase: ${storagePath}`);
      } catch (storageError) {
        console.error('Failed to upload to Supabase Storage:', storageError);
        // Continue processing even if Supabase upload fails
      }

      // Start Python processing in background
      processPDFAsync(req.file.path, document.id, req.file.originalname, initialAfiName, { isTechnicalOrder });

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
      const document = await storage.getDocument(req.params.id);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Delete from Supabase Storage if exists
      if (document.storagePath) {
        try {
          await SupabaseStorageService.deletePDF(document.storagePath);
          console.log(`🗑️ Deleted PDF from Supabase: ${document.storagePath}`);
        } catch (storageError) {
          console.error("Failed to delete from Supabase Storage:", storageError);
          // Continue with database deletion even if storage deletion fails
        }
      }

      // Delete CSV from Supabase Storage if exists
      if (document.csvStoragePath) {
        try {
          await SupabaseStorageService.deleteCSV(document.csvStoragePath);
          console.log(`🗑️ Deleted CSV from Supabase: ${document.csvStoragePath}`);
        } catch (storageError) {
          console.error("Failed to delete CSV from Supabase Storage:", storageError);
          // Continue with database deletion
        }
      }

      // Delete from database
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
      const { role, content, model } = req.body;
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
          const scopedAfi = session?.scopeAfi && session.scopeAfi !== "all" ? session.scopeAfi : undefined;

          const ragResponse = await RAGChatService.askQuestion(content, {
            afi_number: scopedAfi,
            folder: folderName,
            n_results: 5,
            model: model || "gpt-5" // Default to gpt-5 if no model specified
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

  // Download/View PDF from Supabase Storage
  app.get("/api/documents/:id/view", async (req, res) => {
    try {
      const document = await storage.getDocument(req.params.id);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      if (!document.storagePath) {
        return res.status(404).json({ error: "Document PDF not available in storage" });
      }

      const pdfExists = await SupabaseStorageService.fileExists(document.storagePath);
      if (!pdfExists) {
        return res.status(404).json({ error: "Document PDF not available in storage" });
      }

      // Generate a signed URL for secure access
      const signedUrl = await SupabaseStorageService.getSignedUrl(document.storagePath);

      // Redirect to the signed URL
      res.redirect(signedUrl);
    } catch (error: any) {
      console.error("Error viewing document:", error);
      if (typeof error?.statusCode === "number" && error.statusCode === 404) {
        return res.status(404).json({ error: "Document PDF not available in storage" });
      }
      res.status(500).json({ error: "Failed to retrieve document" });
    }
  });

  // Download/View parsed CSV from Supabase Storage
  app.get("/api/documents/:id/view-csv", async (req, res) => {
    try {
      const document = await storage.getDocument(req.params.id);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      if (!document.csvStoragePath) {
        return res.status(404).json({ error: "Parsed CSV not available in storage" });
      }

      const csvExists = await SupabaseStorageService.fileExists(document.csvStoragePath);
      if (!csvExists) {
        return res.status(404).json({ error: "Parsed CSV not available in storage" });
      }

      // Generate a signed URL for secure access
      const signedUrl = await SupabaseStorageService.getSignedUrl(document.csvStoragePath);

      // Set content-type header to force download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${document.afiNumber}_parsed.csv"`);

      // Redirect to the signed URL (or stream the file)
      res.redirect(signedUrl);
    } catch (error: any) {
      console.error("Error viewing CSV:", error);
      if (typeof error?.statusCode === "number" && error.statusCode === 404) {
        return res.status(404).json({ error: "Parsed CSV not available in storage" });
      }
      res.status(500).json({ error: "Failed to retrieve CSV" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}

// Complete RAG pipeline processing
async function processPDFAsync(
  filePath: string,
  documentId: string,
  originalFilename?: string,
  initialAfiName?: string,
  options?: { isTechnicalOrder?: boolean }
) {
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
      },
      originalFilename,
      initialAfiName
    );

    if (result.success) {
      // Upload CSV to Supabase Storage if it exists
      if (result.csvPath && fs.existsSync(result.csvPath)) {
        try {
          const { storagePath: csvStoragePath } = await SupabaseStorageService.uploadCSV(
            result.csvPath,
            documentId,
            originalFilename || 'document'
          );
          
          // Update document with CSV storage path
          await storage.updateDocument(documentId, {
            csvStoragePath: csvStoragePath,
          });
          
          console.log(`✅ CSV uploaded to Supabase: ${csvStoragePath}`);
        } catch (csvError) {
          console.error('Failed to upload CSV to Supabase Storage:', csvError);
          // Continue even if CSV upload fails
        }
      }

      // Update document with final status and extracted AFI number - RAG pipeline complete
      let finalAfiNumber = result.afiNumber || initialAfiName || "UNKNOWN";

      if (options?.isTechnicalOrder && finalAfiNumber) {
        const trimmed = finalAfiNumber.replace(/^(?:T\.?O\.?|TECHNICAL\s+ORDER)[-_\s]*/i, "").trim();
        finalAfiNumber = trimmed ? `TO ${trimmed}` : "TO";
      }

      await storage.updateDocument(documentId, {
        status: "complete",
        afiNumber: finalAfiNumber, // Update with extracted AFI number
        totalChunks: result.embeddingCount || result.recordCount || 0,
        processingProgress: 100
      });
      
  console.log(`✅ RAG pipeline complete for ${finalAfiNumber}:`);
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
