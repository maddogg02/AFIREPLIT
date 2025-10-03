import { useMemo, useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { FolderMinus, Menu, AlertCircle, FileText } from "lucide-react";
import { DocumentActions } from "@/components/library/document-actions";
import { getDocumentStatusBadgeProps } from "@/lib/document-status";
import { groupDocumentsByCategory } from "@/lib/afi-categories";
import { cn } from "@/lib/utils";
import { type Folder, type Document } from "@/types/library";

export default function FolderLibrary() {
  const [, params] = useRoute("/folders/:folderId");
  const folderId = params?.folderId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [documentSearch, setDocumentSearch] = useState("");

  useEffect(() => {
    if (!folderId) {
      setLocation("/master-library");
    }
  }, [folderId, setLocation]);

  const {
    data: folders = [],
    isLoading: foldersLoading,
    isError: foldersError,
    error: foldersErrorObj,
  } = useQuery<Folder[]>({
    queryKey: ["/api/folders"],
  });

  const activeFolder = useMemo(() => folders.find((f) => f.id === folderId), [folders, folderId]);

  const {
    data: documents = [],
    isLoading: documentsLoading,
    isError: documentsError,
    error: documentsErrorObj,
    isFetching: documentsFetching,
  } = useQuery<Document[]>({
    queryKey: ["/api/documents", { folderId }],
    enabled: Boolean(folderId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (folderId) {
        params.set("folderId", folderId);
      }
      const response = await fetch(`/api/documents?${params.toString()}`);
      if (!response.ok) {
        const message = (await response.text()) || response.statusText;
        throw new Error(message);
      }
      return (await response.json()) as Document[];
    },
  });

  const removeFromFolder = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      await apiRequest("PATCH", `/api/documents/${id}`, { folderId: null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      toast({ title: "Removed from folder", description: "The document will no longer appear in this folder." });
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error?.message ?? "Unable to update document.", variant: "destructive" });
    },
  });

  const filteredDocuments = useMemo(() => {
    if (!documentSearch) return documents;
    return documents.filter((doc) =>
      doc.filename.toLowerCase().includes(documentSearch.toLowerCase()),
    );
  }, [documents, documentSearch]);

  const groupedDocuments = useMemo(() => groupDocumentsByCategory<Document>(filteredDocuments), [filteredDocuments]);

  const showLoadingState = documentsLoading || (documentsFetching && documents.length === 0);
  const loadingSkeletonItems = Array.from({ length: 5 });
  const documentErrorMessage = documentsError
    ? documentsErrorObj?.message ?? "Unable to load documents. Please try again."
    : null;
  const folderErrorMessage = foldersError
    ? foldersErrorObj?.message ?? "Unable to load folders. Please try again."
    : null;

  const renderStatusBadge = (status: Document["status"]) => {
    const meta = getDocumentStatusBadgeProps(status);
    const StatusIcon = meta.icon;
    return (
      <Badge className={cn("flex items-center gap-1", meta.badgeClassName)}>
        {StatusIcon ? <StatusIcon className="h-3 w-3" /> : null}
        {meta.label}
      </Badge>
    );
  };

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 bg-background sticky top-0 z-10">
          <SidebarTrigger className="h-9 w-9 hover:bg-accent rounded-md transition-colors">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle Sidebar</span>
          </SidebarTrigger>
          <div className="flex items-center justify-between flex-1">
            <div className="flex flex-col">
              <h1 className="text-xl font-semibold">{activeFolder?.name ?? "Organization Folder"}</h1>
              <p className="text-sm text-muted-foreground">
                {activeFolder?.description || "Browse documents scoped to this folder."}
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <Button variant="outline" onClick={() => setLocation("/master-library")}>All Documents</Button>
              <Button onClick={() => setLocation("/upload")}>Upload AFI</Button>
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="space-y-6">
            {folderErrorMessage ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Unable to load folders</AlertTitle>
                <AlertDescription>{folderErrorMessage}</AlertDescription>
              </Alert>
            ) : null}

            {!activeFolder && !foldersLoading ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Folder not found</AlertTitle>
                <AlertDescription>The folder you are looking for could not be found.</AlertDescription>
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Documents in {activeFolder?.name ?? "folder"}</CardTitle>
                <CardDescription>
                  {filteredDocuments.length} document{filteredDocuments.length === 1 ? "" : "s"} in this folder
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col lg:flex-row gap-2 lg:items-center lg:justify-between">
                  <input
                    type="search"
                    placeholder="Search within this folder..."
                    value={documentSearch}
                    onChange={(event) => setDocumentSearch(event.target.value)}
                    className="w-full lg:w-80 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>

                {documentErrorMessage ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Unable to load documents</AlertTitle>
                    <AlertDescription>{documentErrorMessage}</AlertDescription>
                  </Alert>
                ) : showLoadingState ? (
                  <div className="space-y-2">
                    {loadingSkeletonItems.map((_, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-4 rounded-lg border bg-card"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <Skeleton className="h-8 w-8 rounded-md" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-1/3" />
                            <div className="flex gap-2">
                              <Skeleton className="h-3 w-16" />
                              <Skeleton className="h-3 w-12" />
                              <Skeleton className="h-3 w-20" />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-6 w-20" />
                          <Skeleton className="h-9 w-16" />
                          <Skeleton className="h-9 w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredDocuments.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    No documents in this folder yet.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(groupedDocuments)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([code, { category, documents: groupedDocs }]) => (
                        <div key={code} className="space-y-2">
                          <div className="flex items-center gap-2 py-2 border-b">
                            <h3 className="font-semibold text-lg">
                              {category.code} - {category.name}
                            </h3>
                            <Badge variant="secondary">{groupedDocs.length}</Badge>
                          </div>
                          <div className="space-y-2">
                            {groupedDocs.map((doc) => (
                              <div
                                key={doc.id}
                                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                              >
                                <div className="flex items-center gap-4 flex-1">
                                  <FileText className="h-8 w-8 text-primary" />
                                  <div className="flex-1">
                                    <div className="font-medium">{doc.filename}</div>
                                    <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-2">
                                      <span>{doc.afiNumber}</span>
                                      <span>•</span>
                                      <span>{new Date(doc.uploadDate).toLocaleDateString()}</span>
                                      {doc.folderId && doc.folderId !== folderId ? (
                                        <>
                                          <span>•</span>
                                          <span>Currently in another folder</span>
                                        </>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {renderStatusBadge(doc.status)}
                                  <DocumentActions document={doc} size="sm" />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={removeFromFolder.isPending}
                                    onClick={() => removeFromFolder.mutate({ id: doc.id })}
                                  >
                                    <FolderMinus className="h-4 w-4 mr-2" />
                                    Remove from folder
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
