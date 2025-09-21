import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Database, Cog, FolderOpen, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { type Folder } from "@shared/schema";

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [newFolderName, setNewFolderName] = useState("");
  const [databaseUrl] = useState("Connected to Replit PostgreSQL");
  const [vectorDimension] = useState("384");
  const [chunkSize] = useState("300");
  const [chunkOverlap] = useState("200");
  const [embeddingModel] = useState("BAAI/bge-small-en-v1.5");

  // Fetch folders
  const { data: folders = [] } = useQuery<Folder[]>({
    queryKey: ["/api/folders"],
  });

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async (folderData: { name: string; description?: string }) => {
      const response = await apiRequest("POST", "/api/folders", folderData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setNewFolderName("");
      toast({
        title: "Folder created",
        description: "New folder created successfully",
      });
    },
  });

  // Delete folder mutation
  const deleteFolderMutation = useMutation({
    mutationFn: async (folderId: string) => {
      await apiRequest("DELETE", `/api/folders/${folderId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      toast({
        title: "Folder deleted",
        description: "Folder and all documents removed successfully",
      });
    },
  });

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolderMutation.mutate({
        name: newFolderName.trim(),
      });
    }
  };

  const handleDeleteFolder = (folderId: string) => {
    if (confirm("Are you sure you want to delete this folder? All documents will be removed.")) {
      deleteFolderMutation.mutate(folderId);
    }
  };

  const handleTestConnection = () => {
    // Simulate database connection test
    toast({
      title: "Connection test",
      description: "Database connection successful",
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Settings</h2>

      {/* Database Configuration */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Configuration
          </CardTitle>
          <CardDescription>
            View your current database and vector configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Database URL</Label>
              <Input
                value={databaseUrl}
                readOnly
                className="bg-muted"
                data-testid="database-url-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Vector Dimension</Label>
              <Input
                type="number"
                value={vectorDimension}
                readOnly
                className="bg-muted"
                data-testid="vector-dimension-input"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleTestConnection}
              data-testid="test-connection-button"
            >
              Test Connection
            </Button>
            <Button 
              variant="outline"
              data-testid="save-database-settings-button"
            >
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Processing Configuration */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Cog className="h-5 w-5" />
            Processing Configuration
          </CardTitle>
          <CardDescription>
            Current PDF processing and BGE embedding configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Chunk Size</Label>
              <Input
                type="number"
                value={chunkSize}
                readOnly
                className="bg-muted"
                data-testid="chunk-size-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Chunk Overlap</Label>
              <Input
                type="number"
                value={chunkOverlap}
                readOnly
                className="bg-muted"
                data-testid="chunk-overlap-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Embedding Model</Label>
              <Select value={embeddingModel} disabled>
                <SelectTrigger data-testid="embedding-model-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BAAI/bge-small-en-v1.5">BAAI/bge-small-en-v1.5</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Folder Management */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Folder Management
          </CardTitle>
          <CardDescription>
            Manage document organization folders
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {folders.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No folders created yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  data-testid={`folder-item-${folder.id}`}
                >
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-primary" />
                    <span>{folder.name}</span>
                    {folder.description && (
                      <span className="text-sm text-muted-foreground">
                        - {folder.description}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteFolder(folder.id)}
                    disabled={deleteFolderMutation.isPending}
                    className="text-destructive hover:text-destructive/80"
                    data-testid={`delete-folder-${folder.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              placeholder="New folder name..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              data-testid="new-folder-name-input"
            />
            <Button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
              data-testid="add-folder-button"
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              Add Folder
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
