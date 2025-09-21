import {
  users,
  folders,
  documents,
  embeddings,
  chatSessions,
  chatMessages,
  type User,
  type InsertUser,
  type Folder,
  type InsertFolder,
  type Document,
  type InsertDocument,
  type Embedding,
  type InsertEmbedding,
  type ChatSession,
  type InsertChatSession,
  type ChatMessage,
  type InsertChatMessage,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, ilike, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Folders
  getFolders(): Promise<Folder[]>;
  getFolder(id: string): Promise<Folder | undefined>;
  createFolder(folder: InsertFolder): Promise<Folder>;
  deleteFolder(id: string): Promise<void>;
  
  // Documents
  getDocuments(folderId?: string): Promise<Document[]>;
  getDocument(id: string): Promise<Document | undefined>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: string, updates: Partial<Document>): Promise<Document>;
  deleteDocument(id: string): Promise<void>;
  searchDocuments(query: string): Promise<Document[]>;
  
  // Embeddings
  getEmbeddings(docId: string): Promise<Embedding[]>;
  createEmbedding(embedding: InsertEmbedding): Promise<Embedding>;
  searchEmbeddings(query: string, folderId?: string, afiNumber?: string): Promise<Embedding[]>;
  
  // Chat Sessions
  getChatSessions(): Promise<ChatSession[]>;
  getChatSession(id: string): Promise<ChatSession | undefined>;
  createChatSession(session: InsertChatSession): Promise<ChatSession>;
  deleteChatSession(id: string): Promise<void>;
  
  // Chat Messages
  getChatMessages(sessionId: string): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Folders
  async getFolders(): Promise<Folder[]> {
    return await db.select().from(folders).orderBy(folders.name);
  }

  async getFolder(id: string): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(eq(folders.id, id));
    return folder || undefined;
  }

  async createFolder(folder: InsertFolder): Promise<Folder> {
    const [created] = await db.insert(folders).values(folder).returning();
    return created;
  }

  async deleteFolder(id: string): Promise<void> {
    await db.delete(folders).where(eq(folders.id, id));
  }

  // Documents
  async getDocuments(folderId?: string): Promise<Document[]> {
    if (folderId) {
      return await db.select().from(documents)
        .where(eq(documents.folderId, folderId))
        .orderBy(desc(documents.uploadDate));
    }
    return await db.select().from(documents).orderBy(desc(documents.uploadDate));
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document || undefined;
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    const [created] = await db.insert(documents).values(document).returning();
    return created;
  }

  async updateDocument(id: string, updates: Partial<Document>): Promise<Document> {
    const [updated] = await db.update(documents)
      .set(updates)
      .where(eq(documents.id, id))
      .returning();
    return updated;
  }

  async deleteDocument(id: string): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  async searchDocuments(query: string): Promise<Document[]> {
    return await db.select().from(documents)
      .where(ilike(documents.filename, `%${query}%`))
      .orderBy(desc(documents.uploadDate));
  }

  // Embeddings
  async getEmbeddings(docId: string): Promise<Embedding[]> {
    return await db.select().from(embeddings)
      .where(eq(embeddings.docId, docId))
      .orderBy(embeddings.chunkIndex);
  }

  async createEmbedding(embedding: InsertEmbedding): Promise<Embedding> {
    const [created] = await db.insert(embeddings).values(embedding).returning();
    return created;
  }

  async searchEmbeddings(query: string, folderId?: string, afiNumber?: string): Promise<Embedding[]> {
    // This would typically use vector similarity search
    // For now, we'll do a simple text search
    let baseQuery = db.select({
      id: embeddings.id,
      docId: embeddings.docId,
      chunkText: embeddings.chunkText,
      vectorEmbedding: embeddings.vectorEmbedding,
      metadata: embeddings.metadata,
      chunkIndex: embeddings.chunkIndex,
    }).from(embeddings)
      .innerJoin(documents, eq(embeddings.docId, documents.id));

    let conditions = [ilike(embeddings.chunkText, `%${query}%`)];

    if (folderId) {
      conditions.push(eq(documents.folderId, folderId));
    }

    if (afiNumber) {
      conditions.push(eq(documents.afiNumber, afiNumber));
    }

    return await baseQuery.where(and(...conditions));
  }

  // Chat Sessions
  async getChatSessions(): Promise<ChatSession[]> {
    return await db.select().from(chatSessions).orderBy(desc(chatSessions.createdAt));
  }

  async getChatSession(id: string): Promise<ChatSession | undefined> {
    const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, id));
    return session || undefined;
  }

  async createChatSession(session: InsertChatSession): Promise<ChatSession> {
    const [created] = await db.insert(chatSessions).values(session).returning();
    return created;
  }

  async deleteChatSession(id: string): Promise<void> {
    await db.delete(chatSessions).where(eq(chatSessions.id, id));
  }

  // Chat Messages
  async getChatMessages(sessionId: string): Promise<ChatMessage[]> {
    return await db.select().from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.createdAt);
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [created] = await db.insert(chatMessages).values(message).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
