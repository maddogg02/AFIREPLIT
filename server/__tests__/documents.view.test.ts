import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerRoutes } from "../routes";
import { storage } from "../storage";
import { SupabaseStorageService } from "../utils/supabase_storage";
import type { Document } from "@shared/schema";

describe("Document view endpoints", () => {
  let app: express.Express;

  const makeDocument = (overrides: Partial<Document> = {}): Document => ({
    id: "doc-1",
    folderId: "folder-1",
    filename: "sample.pdf",
    afiNumber: "AFI 21-101",
    uploadDate: new Date(),
    status: "complete",
    csvPath: null,
    fileSize: 1024,
    totalChunks: 10,
    processingProgress: 100,
    storageBucket: "afi-documents",
    storagePath: "documents/doc-1/sample.pdf",
    storagePublicUrl: null,
    csvStoragePath: "documents/doc-1/sample_parsed.csv",
    ...overrides,
  });

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(app);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects to Supabase signed URL for PDF view", async () => {
    vi.spyOn(storage, "getDocument").mockResolvedValue(makeDocument());
    vi.spyOn(SupabaseStorageService, "fileExists").mockResolvedValue(true);
    vi.spyOn(SupabaseStorageService, "getSignedUrl").mockResolvedValue("https://signed-url/pdf");

    const response = await request(app).get("/api/documents/doc-1/view");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("https://signed-url/pdf");
    expect(SupabaseStorageService.fileExists).toHaveBeenCalledWith("documents/doc-1/sample.pdf");
    expect(SupabaseStorageService.getSignedUrl).toHaveBeenCalledWith("documents/doc-1/sample.pdf");
  });

  it("returns 404 when PDF metadata is missing", async () => {
    vi.spyOn(storage, "getDocument").mockResolvedValue(
      makeDocument({ storagePath: null }),
    );

    const response = await request(app).get("/api/documents/doc-1/view");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Document PDF not available in storage" });
  });

  it("returns 404 when PDF file is missing in storage", async () => {
    vi.spyOn(storage, "getDocument").mockResolvedValue(makeDocument());
    vi.spyOn(SupabaseStorageService, "fileExists").mockResolvedValue(false);

    const response = await request(app).get("/api/documents/doc-1/view");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Document PDF not available in storage" });
  });

  it("propagates Supabase errors for PDF view", async () => {
    vi.spyOn(storage, "getDocument").mockResolvedValue(makeDocument());
    vi.spyOn(SupabaseStorageService, "fileExists").mockResolvedValue(true);
    const error = new Error("boom");
    vi.spyOn(SupabaseStorageService, "getSignedUrl").mockRejectedValue(error);

    const response = await request(app).get("/api/documents/doc-1/view");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Failed to retrieve document" });
  });

  it("redirects to Supabase signed URL for CSV view", async () => {
    vi.spyOn(storage, "getDocument").mockResolvedValue(makeDocument());
    vi.spyOn(SupabaseStorageService, "fileExists").mockResolvedValue(true);
    vi.spyOn(SupabaseStorageService, "getSignedUrl").mockResolvedValue("https://signed-url/csv");

    const response = await request(app).get("/api/documents/doc-1/view-csv");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("https://signed-url/csv");
    expect(SupabaseStorageService.fileExists).toHaveBeenCalledWith("documents/doc-1/sample_parsed.csv");
    expect(SupabaseStorageService.getSignedUrl).toHaveBeenCalledWith("documents/doc-1/sample_parsed.csv");
  });

  it("returns 404 when CSV metadata is missing", async () => {
    vi.spyOn(storage, "getDocument").mockResolvedValue(
      makeDocument({ csvStoragePath: null }),
    );

    const response = await request(app).get("/api/documents/doc-1/view-csv");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Parsed CSV not available in storage" });
  });

  it("returns 404 when CSV file is missing in storage", async () => {
    vi.spyOn(storage, "getDocument").mockResolvedValue(makeDocument());
    vi.spyOn(SupabaseStorageService, "fileExists").mockResolvedValue(false);

    const response = await request(app).get("/api/documents/doc-1/view-csv");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Parsed CSV not available in storage" });
  });

  it("propagates Supabase errors for CSV view", async () => {
    vi.spyOn(storage, "getDocument").mockResolvedValue(makeDocument());
    vi.spyOn(SupabaseStorageService, "fileExists").mockResolvedValue(true);
    const error: Error & { statusCode?: number } = new Error("missing");
    error.statusCode = 404;
    vi.spyOn(SupabaseStorageService, "getSignedUrl").mockRejectedValue(error);

    const response = await request(app).get("/api/documents/doc-1/view-csv");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Parsed CSV not available in storage" });
  });
});
