import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Upload as UploadIcon, FileText, Folder, Plus, CheckCircle, Cog, Trash2, Loader2 } from "lucide-react";
import ProgressIndicator from "@/components/upload/progress-indicator";
// Removed PDFPreview - using Python script processing
import { apiRequest } from "@/lib/queryClient";
import { type Folder as FolderType } from "@/types/library";
import { SidebarLayout } from "@/components/layout/sidebar-layout";

export default function Upload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  type FileItem = {
    clientId: string;
    file: File;
    status: "pending" | "uploading" | "processing" | "completed" | "error";
    progress: number;
    message: string;
    docId?: string;
  };

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<FileItem[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const pollIntervals = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const statusStyles: Record<FileItem["status"], { label: string; className: string }> = {
    pending: { label: "Ready", className: "bg-muted text-muted-foreground" },
    uploading: { label: "Uploading", className: "bg-primary/10 text-primary" },
    processing: { label: "Processing", className: "bg-primary text-primary-foreground" },
    completed: { label: "Completed", className: "bg-green-600 text-white" },
    error: { label: "Error", className: "bg-destructive text-destructive-foreground" },
  };

  useEffect(() => {
    return () => {
      Object.values(pollIntervals.current).forEach(clearInterval);
    };
  }, []);
  // Removed PDF preview and TOC range - using Python script for processing

  // Fetch folders
  const { data: folders = [] } = useQuery<FolderType[]>({
    queryKey: ["/api/folders"],
  });

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async (folderData: { name: string; description?: string }) => {
      const response = await apiRequest("POST", "/api/folders", folderData);
      return response.json();
    },
    onSuccess: (newFolder) => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setSelectedFolder(newFolder.id);
      setNewFolderName("");
      toast({
        title: "Folder created",
        description: `New folder "${newFolder.name}" created successfully`,
      });
    },
  });

  // Upload document mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ file, folderId }: { file: File; folderId: string }) => {
      const formData = new FormData();
      formData.append("pdf", file);
      formData.append("folderId", folderId);

      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      return response.json();
    },
  });

  // Progress polling function
  const startProgressPolling = (docId: string, clientId: string, fileName: string) => {
    setSelectedFiles((prev) =>
      prev.map((item) =>
        item.clientId === clientId
          ? {
              ...item,
              status: "processing",
              docId,
              progress: Math.max(item.progress, 10),
              message: "Starting PDF processing...",
            }
          : item,
      ),
    );

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/documents/${docId}/status`);
        if (response.ok) {
          const status = await response.json();

          setSelectedFiles((prev) =>
            prev.map((item) => {
              if (item.clientId !== clientId) return item;
              const progress = status.progress ?? item.progress;
              const message = status.message ?? item.message;
              const isComplete = progress >= 100 || status.status === "completed";
              return {
                ...item,
                progress,
                message,
                status: isComplete ? "completed" : "processing",
              };
            }),
          );

          if (status.progress >= 100 || status.status === "completed") {
            clearInterval(pollInterval);
            delete pollIntervals.current[clientId];
            queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
            toast({
              title: "Processing complete",
              description: `${fileName} is now ready for search`,
            });
          }
        }
      } catch (error) {
        console.log("Progress polling error:", error);
      }
    }, 1000);

    pollIntervals.current[clientId] = pollInterval;

    setTimeout(() => {
      if (pollIntervals.current[clientId]) {
        clearInterval(pollIntervals.current[clientId]);
        delete pollIntervals.current[clientId];
      }
    }, 600000);
  };

  const handleFilesUpload = (files: FileList | File[]) => {
    const incomingFiles = Array.from(files);
    if (!incomingFiles.length) return;

    let invalidCount = 0;
    const duplicates: string[] = [];
    const validItems: FileItem[] = [];

    incomingFiles.forEach((file) => {
      if (file.type !== "application/pdf") {
        invalidCount += 1;
        return;
      }

      const isDuplicate = selectedFiles.some(
        (item) => item.file.name === file.name && item.file.size === file.size,
      );
      if (isDuplicate) {
        duplicates.push(file.name);
        return;
      }

      const clientId = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      validItems.push({
        clientId,
        file,
        status: "pending",
        progress: 0,
        message: "Ready — click Process Documents below to begin",
      });
    });

    if (invalidCount) {
      toast({
        title: "Unsupported file",
        description: invalidCount === 1
          ? "Only PDF files are allowed."
          : `${invalidCount} files were skipped because they are not PDFs.`,
        variant: "destructive",
      });
    }

    if (duplicates.length) {
      toast({
        title: "Duplicate skipped",
        description: duplicates.join(", "),
      });
    }

    if (validItems.length) {
      setSelectedFiles((prev) => [...prev, ...validItems]);
      setCurrentStep(2);
      toast({
        title: validItems.length === 1 ? "File added" : `${validItems.length} files added`,
        description:
          validItems.length === 1
            ? `${validItems[0].file.name} (${(validItems[0].file.size / 1024 / 1024).toFixed(2)} MB) — click Process Documents to start.`
            : "All files queued. Click Process Documents to begin the batch.",
      });
    }
  };

  const removeFile = (clientId: string) => {
    const file = selectedFiles.find((item) => item.clientId === clientId);
    if (!file) return;

    if (file.status !== "pending") {
      toast({
        title: "Cannot remove during processing",
        description: "Please wait until this document finishes processing.",
        variant: "destructive",
      });
      return;
    }

    setSelectedFiles((prev) => prev.filter((item) => item.clientId !== clientId));
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolderMutation.mutate({
        name: newFolderName.trim(),
      });
    }
  };

  // Removed TOC confirmation - direct processing

  const handleStartProcessing = async () => {
    if (!selectedFiles.length || !selectedFolder) {
      toast({
        title: "Missing information",
        description: "Please select at least one PDF and a destination folder.",
        variant: "destructive",
      });
      return;
    }

    if (pendingCount === 0) {
      toast({
        title: "Nothing to process",
        description: "All selected files have already been processed.",
      });
      return;
    }

    const pendingToProcess = selectedFiles.filter((item) => item.status === "pending").length;
    if (pendingToProcess === 0) {
      toast({
        title: "Nothing to process",
        description: "All selected files have already been processed.",
      });
      return;
    }

    setCurrentStep(3);
    setIsProcessingBatch(true);

    for (const fileItem of selectedFiles) {
      if (fileItem.status !== "pending") {
        continue;
      }

      setSelectedFiles((prev) =>
        prev.map((item) =>
          item.clientId === fileItem.clientId
            ? { ...item, status: "uploading", progress: 0, message: "Uploading to server..." }
            : item,
        ),
      );

      try {
        const data = await uploadMutation.mutateAsync({
          file: fileItem.file,
          folderId: selectedFolder,
        });

        const documentId = data.documentId as string;

        toast({
          title: "Upload successful",
          description: `${fileItem.file.name} queued for processing`,
        });

        setSelectedFiles((prev) =>
          prev.map((item) =>
            item.clientId === fileItem.clientId
              ? {
                  ...item,
                  status: "processing",
                  docId: documentId,
                  progress: 10,
                  message: "Starting PDF processing...",
                }
              : item,
          ),
        );

        startProgressPolling(documentId, fileItem.clientId, fileItem.file.name);
      } catch (error) {
        console.error("Upload error", error);
        setSelectedFiles((prev) =>
          prev.map((item) =>
            item.clientId === fileItem.clientId
              ? {
                  ...item,
                  status: "error",
                  message: error instanceof Error ? error.message : "Upload failed",
                }
              : item,
          ),
        );

        toast({
          title: "Upload failed",
          description: `${fileItem.file.name} could not be processed`,
          variant: "destructive",
        });
      }
    }

    setIsProcessingBatch(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length) {
      handleFilesUpload(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const totalSelected = selectedFiles.length;
  const completedCount = selectedFiles.filter((item) => item.status === "completed").length;
  const anyProcessing = selectedFiles.some((item) => item.status === "uploading" || item.status === "processing");
  const hasStartedProcessing = selectedFiles.some((item) => item.status !== "pending");
  const allCompleted = totalSelected > 0 && completedCount === totalSelected;
  const pendingCount = selectedFiles.filter((item) => item.status === "pending").length;
  const workRemainingCount = selectedFiles.filter((item) =>
    item.status === "pending" || item.status === "uploading" || item.status === "processing",
  ).length;

  return (
    <SidebarLayout title="Upload AFIs">
      <div className="space-y-6">
        <ProgressIndicator currentStep={currentStep} totalSteps={3} />

      {/* Step 1: Folder Selection */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Folder className="h-5 w-5" />
            Step 1: Select Destination Folder
          </CardTitle>
          <CardDescription>
            Choose where to store this AFI in the vector database
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="folder-select">Existing Folder</Label>
              <Select value={selectedFolder} onValueChange={setSelectedFolder}>
                <SelectTrigger data-testid="folder-select">
                  <SelectValue placeholder="Select a folder..." />
                </SelectTrigger>
                <SelectContent>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-folder">Or Create New</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Folder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  data-testid="new-folder-input"
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={handleCreateFolder}
                  disabled={createFolderMutation.isPending}
                  data-testid="create-folder-button"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: PDF Upload */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <UploadIcon className="h-5 w-5" />
            Step 2: Upload AFI PDF
          </CardTitle>
          <CardDescription>
            Upload the PDF document to be processed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div 
            className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer bg-muted/20"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => document.getElementById('file-upload')?.click()}
            data-testid="upload-dropzone"
          >
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <div className="space-y-2">
              <p className="text-lg font-medium text-foreground">Upload AFI PDFs here</p>
              <p className="text-sm text-muted-foreground">Drag and drop or click to select one or more files</p>
            </div>
            <input
              id="file-upload"
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = e.target.files;
                if (files?.length) {
                  handleFilesUpload(files);
                  e.target.value = "";
                }
              }}
              data-testid="file-input"
            />
          </div>
          
          {selectedFiles.length > 0 && (
            <div className="mt-4 space-y-3">
              {selectedFiles.map((item) => (
                <div key={item.clientId} className="p-4 bg-muted/40 rounded-lg border border-border/60 space-y-2">
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium break-all">{item.file.name}</span>
                        <Badge variant="outline">
                          {(item.file.size / 1024 / 1024).toFixed(2)} MB
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`${statusStyles[item.status].className} border-none`}
                        >
                          {statusStyles[item.status].label}
                        </Badge>
                      </div>
                      {item.status === "pending" && (
                        <p className="text-xs text-muted-foreground mt-1">{item.message}</p>
                      )}
                    </div>
                    {item.status === "pending" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(item.clientId)}
                        aria-label={`Remove ${item.file.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {item.status !== "pending" && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span className="truncate pr-2">{item.message}</span>
                        <span>{Math.round(item.progress)}%</span>
                      </div>
                      <Progress value={item.progress} className="w-full" />
                    </div>
                  )}
                  {item.status === "error" && (
                    <p className="text-xs text-destructive">{item.message || "Attempt failed. Try again later."}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Start Processing */}
      {currentStep >= 2 && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Cog className="h-5 w-5" />
              Step 3: Process Documents
            </CardTitle>
            <CardDescription>
              Process PDFs with the AFI parser and generate embeddings for semantic search
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">Processing Summary</h4>
                <div className="grid gap-1 text-sm">
                  <p>
                    <strong>Destination:</strong> {folders.find((f) => f.id === selectedFolder)?.name ?? "Select a folder"}
                  </p>
                  <p>
                    <strong>Files selected:</strong> {totalSelected}
                  </p>
                  <p>
                    <strong>Completed:</strong> {completedCount} / {totalSelected}
                  </p>
                  <p>
                    <strong>Pipeline:</strong> PDF → Python Parser → CSV → Embeddings → Vector Store
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  AFI numbers and metadata are extracted automatically from each original file name for consistent search results.
                </p>
              </div>
              {hasStartedProcessing && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {anyProcessing || isProcessingBatch ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                    <span>
                      {allCompleted
                        ? "All documents processed and searchable"
                        : `${completedCount} of ${totalSelected} documents processed`}
                    </span>
                  </div>
                  {anyProcessing && (
                    <p className="text-xs text-muted-foreground">
                      Hold tight—each PDF is parsed, chunked, and embedded in sequence for consistent metadata.
                    </p>
                  )}
                </div>
              )}

              {!hasStartedProcessing && pendingCount > 0 && (
                <p className="text-sm text-muted-foreground">
                  Click <strong>Process Documents</strong> to upload and index the files listed above.
                </p>
              )}

              <Button
                className="w-full"
                onClick={handleStartProcessing}
                disabled={!selectedFolder || pendingCount === 0 || isProcessingBatch || anyProcessing}
                data-testid="start-processing-button"
              >
                {isProcessingBatch || anyProcessing
                  ? `Processing ${workRemainingCount} remaining...`
                  : pendingCount === 0
                    ? "All documents processed"
                    : `Process ${pendingCount} ${pendingCount === 1 ? "Document" : "Documents"}`}
              </Button>
              
              {selectedFiles.some((item) => item.status === "error") && (
                <p className="text-sm text-center text-destructive">
                  One or more files failed to upload. Remove them or retry after checking the logs.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success Message */}
      {currentStep >= 3 && allCompleted && (
        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <div>
                <h3 className="font-semibold text-green-800 dark:text-green-200">Processing Complete!</h3>
                <p className="text-sm text-green-600 dark:text-green-400">
                  All selected AFI documents are processed and ready for semantic search.
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button asChild>
                <Link href="/chat">Try Chat Assistant</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/library">View Library</Link>
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  Object.values(pollIntervals.current).forEach(clearInterval);
                  pollIntervals.current = {};
                  setSelectedFiles([]);
                  setCurrentStep(1);
                }}
              >
                Start another batch
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
    </SidebarLayout>
  );
}
