import { useState } from "react";
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
import { Upload as UploadIcon, FileText, Folder, Plus, CheckCircle, Cog } from "lucide-react";
import ProgressIndicator from "@/components/upload/progress-indicator";
// Removed PDFPreview - using Python script processing
import { apiRequest } from "@/lib/queryClient";
import { type Folder as FolderType } from "@shared/schema";

export default function Upload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [afiNumber, setAfiNumber] = useState("");
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState("");
  const [documentId, setDocumentId] = useState<string | null>(null);
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
    mutationFn: async ({ file, folderId, afiNumber }: { file: File; folderId: string; afiNumber: string }) => {
      const formData = new FormData();
      formData.append("pdf", file);
      formData.append("folderId", folderId);
      formData.append("afiNumber", afiNumber);

      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setDocumentId(data.documentId);
      setCurrentStep(3);
      setProcessingProgress(10);
      setProcessingMessage("Starting PDF processing...");
      
      // Start polling for progress
      startProgressPolling(data.documentId);
      
      toast({
        title: "Upload successful",
        description: "Your document is being processed",
      });
    },
    onError: () => {
      toast({
        title: "Upload failed",
        description: "There was an error uploading your document",
        variant: "destructive",
      });
    },
  });

  // Progress polling function
  const startProgressPolling = (docId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/documents/${docId}/status`);
        if (response.ok) {
          const status = await response.json();
          
          setProcessingProgress(status.progress || 0);
          setProcessingMessage(status.message || "Processing...");
          
          // Stop polling when complete
          if (status.progress >= 100 || status.status === 'completed') {
            clearInterval(pollInterval);
            toast({
              title: "Processing complete",
              description: "Your AFI document is ready for search",
            });
          }
        }
      } catch (error) {
        console.log("Progress polling error:", error);
      }
    }, 1000); // Poll every second
    
    // Clear interval after 10 minutes max
    setTimeout(() => clearInterval(pollInterval), 600000);
  };

  const handleFileUpload = (file: File) => {
    if (file.type !== "application/pdf") {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF file.",
        variant: "destructive",
      });
      return;
    }

    setUploadedFile(file);
    // Skip preview, go directly to processing step
    setCurrentStep(2);
    toast({
      title: "File uploaded successfully",
      description: `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
    });
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolderMutation.mutate({
        name: newFolderName.trim(),
      });
    }
  };

  // Removed TOC confirmation - direct processing

  const handleStartProcessing = () => {
    if (!uploadedFile || !selectedFolder || !afiNumber) {
      toast({
        title: "Missing information",
        description: "Please complete all required fields",
        variant: "destructive",
      });
      return;
    }

    uploadMutation.mutate({
      file: uploadedFile,
      folderId: selectedFolder,
      afiNumber,
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files[0]) {
      handleFileUpload(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
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
          
          <div className="space-y-2">
            <Label htmlFor="afi-number">AFI Number</Label>
            <Input
              placeholder="e.g., AFI 21-101"
              value={afiNumber}
              onChange={(e) => setAfiNumber(e.target.value)}
              data-testid="afi-number-input"
            />
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
              <p className="text-lg font-medium text-foreground">Upload AFI PDF here</p>
              <p className="text-sm text-muted-foreground">Drag and drop or click to select file</p>
            </div>
            <input
              id="file-upload"
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
              data-testid="file-input"
            />
          </div>
          
          {uploadedFile && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <span className="font-medium">{uploadedFile.name}</span>
                <Badge variant="outline">
                  {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                </Badge>
              </div>
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
              Step 3: Process Document
            </CardTitle>
            <CardDescription>
              Process PDF with AFI parser and generate embeddings for semantic search
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">Processing Summary</h4>
                <div className="space-y-1 text-sm">
                  <p><strong>File:</strong> {uploadedFile?.name}</p>
                  <p><strong>AFI Number:</strong> {afiNumber}</p>
                  <p><strong>Folder:</strong> {folders.find(f => f.id === selectedFolder)?.name}</p>
                  <p><strong>Processing:</strong> PDF → Python Parser → CSV → Embeddings → Replit DB</p>
                </div>
              </div>

              {(uploadMutation.isPending || processingProgress > 0) && processingProgress < 100 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{processingMessage || "Processing with Python script..."}</span>
                    <span>{processingProgress}%</span>
                  </div>
                  <Progress value={processingProgress} className="w-full" />
                  <p className="text-xs text-muted-foreground">
                    Real-time BGE embedding progress - {processingProgress < 50 ? "Parsing PDF..." : processingProgress < 90 ? "Generating embeddings..." : "Finalizing..."}
                  </p>
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleStartProcessing}
                disabled={!selectedFolder || !afiNumber || !uploadedFile || uploadMutation.isPending || (processingProgress > 0 && processingProgress < 100)}
                data-testid="start-processing-button"
              >
                {uploadMutation.isPending || (processingProgress > 0 && processingProgress < 100) ? 
                  `Processing... ${processingProgress}%` : "Process Document"}
              </Button>
              
              {(uploadMutation.isPending || processingProgress > 0) && processingProgress < 100 && (
                <div className="text-center text-sm text-muted-foreground space-y-1">
                  <p className="flex items-center justify-center gap-2">
                    {processingProgress >= 10 ? "✓" : "⏳"} 
                    Running AFI parser script
                  </p>
                  <p className="flex items-center justify-center gap-2">
                    {processingProgress >= 50 ? "✓" : processingProgress >= 10 ? "⏳" : "○"} 
                    Extracting numbered paragraphs
                  </p>
                  <p className="flex items-center justify-center gap-2">
                    {processingProgress >= 90 ? "✓" : processingProgress >= 50 ? "⏳" : "○"} 
                    Generating BGE embeddings: {processingProgress >= 50 ? `${Math.round((processingProgress - 50) / 40 * 100)}% complete` : "Waiting..."}
                  </p>
                  <p className="flex items-center justify-center gap-2">
                    {processingProgress >= 95 ? "✓" : processingProgress >= 90 ? "⏳" : "○"} 
                    Storing in ChromaDB collection
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success Message */}
      {currentStep >= 3 && !uploadMutation.isPending && (
        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <div>
                <h3 className="font-semibold text-green-800 dark:text-green-200">Processing Complete!</h3>
                <p className="text-sm text-green-600 dark:text-green-400">
                  Your AFI document has been processed and is now available for semantic search.
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
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
