import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { MessageCircle, MoreVertical, FileText, Clock, Trash2 } from "lucide-react";
import { type Document } from "@shared/schema";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMemo, useState } from "react";

interface DocumentCardProps {
  document: Document;
}

export default function DocumentCard({ document }: DocumentCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/documents/${document.id}`);
    },
    onSuccess: () => {
      // Show toast first before any state changes
      toast({
        title: "Document deleted",
        description: `${displayName} has been successfully deleted.`,
      });
      
      // Close dialog
      setShowDeleteDialog(false);
      
      // Invalidate and refetch documents list after toast
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      }, 100);
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete document. Please try again.",
        variant: "destructive",
      });
    },
  });

  const displayName = useMemo(() => {
    if (!document.filename) {
      return "Unknown Document";
    }

    return document.filename.replace(/\.[^./\\]+$/, "");
  }, [document.filename]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "complete":
        return "bg-green-100 text-green-800";
      case "processing":
        return "bg-yellow-100 text-yellow-800";
      case "error":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString();
  };

  const formatFileSize = (bytes: number) => {
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
  };

  return (
    <div 
      className="bg-card border border-border rounded-lg p-4 hover:shadow-md transition-shadow"
      data-testid={`document-card-${document.id}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-red-500" />
          <div>
            <h3 className="font-semibold text-foreground">{displayName}</h3>
            <p className="text-sm text-muted-foreground">{document.afiNumber}</p>
          </div>
        </div>
        <Badge className={getStatusColor(document.status)}>
          {document.status.charAt(0).toUpperCase() + document.status.slice(1)}
        </Badge>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Size:</span>
          <span className="text-foreground">
            {document.fileSize ? formatFileSize(document.fileSize) : "Unknown"}
          </span>
        </div>
        
        {document.status === "processing" ? (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Progress:</span>
            <span className="text-foreground">{document.processingProgress || 0}%</span>
          </div>
        ) : (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Chunks:</span>
            <span className="text-foreground">{document.totalChunks || 0}</span>
          </div>
        )}
        
        <div className="flex justify-between">
          <span className="text-muted-foreground">Uploaded:</span>
          <span className="text-foreground">{formatDate(document.uploadDate)}</span>
        </div>
      </div>

      {document.status === "processing" && (
        <div className="mt-3">
          <Progress value={document.processingProgress || 0} className="w-full" />
        </div>
      )}

      <div className="flex gap-2 mt-4">
        {document.status === "complete" ? (
          <Link href="/chat" className="flex-1">
            <Button 
              className="w-full"
              data-testid={`chat-button-${document.id}`}
            >
              <MessageCircle className="h-4 w-4 mr-1" />
              Chat
            </Button>
          </Link>
        ) : (
          <Button 
            className="flex-1" 
            disabled
            variant="secondary"
            data-testid={`processing-button-${document.id}`}
          >
            <Clock className="h-4 w-4 mr-1" />
            {document.status === "processing" ? "Processing" : "Error"}
          </Button>
        )}
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              size="icon"
              data-testid={`menu-button-${document.id}`}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <AlertDialogTrigger asChild>
                <DropdownMenuItem 
                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                  data-testid={`delete-button-${document.id}`}
                  onSelect={(e) => {
                    e.preventDefault();
                    setShowDeleteDialog(true);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Document</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{displayName}"? This action cannot be undone and will permanently remove the document and all associated data.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                    data-testid={`confirm-delete-${document.id}`}
                  >
                    {deleteMutation.isPending ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
