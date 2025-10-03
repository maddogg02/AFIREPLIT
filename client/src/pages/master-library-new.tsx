import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// Dialog imports removed (no longer used)
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { Search, FileText, Filter, FolderPlus, Menu, AlertCircle, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { type Folder, type Document } from "@/types/library";
import { getDocumentStatusBadgeProps } from "@/lib/document-status";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getCategoryForAfi, getAllCategories, groupDocumentsByCategory } from "@/lib/afi-categories";
import { DocumentActions } from "@/components/library/document-actions";

type DocumentsQueryKey = [string, { folderId: string | null; afiSeries: string | null }];

export default function MasterLibraryNew() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedAfiSeries, setSelectedAfiSeries] = useState("all");
  const [groupByCategory, setGroupByCategory] = useState(true);
  const [collapsedSeries, setCollapsedSeries] = useState<Record<string, boolean>>({});
  const toggleSeries = (code: string) => {
    setCollapsedSeries((prev) => ({
      ...prev,
      [code]: !prev[code],
    }));
  };

  const formatFileSize = (bytes?: number | null) => {
    if (typeof bytes !== "number" || Number.isNaN(bytes)) {
      return "Unknown size";
    }

    if (bytes <= 0) {
      return "0 MB";
    }

    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  // SEO: set page title and description
  useEffect(() => {
    document.title = "Master AFI Library | Add to Organizational Folders";
    const desc = "Browse AFIs and add selected PDFs to your organizational folders.";
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = desc;
  }, []);

  // Fetch folders and documents from API
  const {
    data: foldersData,
    isError: foldersError,
    error: foldersErrorObj,
  } = useQuery<Folder[], Error>({
    queryKey: ["/api/folders"],
  });

  const folders = foldersData ?? [];

  const folderFilter = selectedCategory === "all" ? null : selectedCategory;
  const afiSeriesFilter = selectedAfiSeries === "all" ? null : selectedAfiSeries;

  const documentsQueryKey = useMemo<DocumentsQueryKey>(
    () => ["/api/documents", { folderId: folderFilter, afiSeries: afiSeriesFilter }],
    [folderFilter, afiSeriesFilter],
  );

  const {
    data: documentsData,
    isLoading: documentsLoading,
    isError: documentsError,
    error: documentsErrorObj,
    isFetching: documentsFetching,
  } = useQuery<Document[], Error, Document[], DocumentsQueryKey>({
    queryKey: documentsQueryKey,
    queryFn: async ({ queryKey }) => {
      const [, filters] = queryKey as DocumentsQueryKey;
      const params = new URLSearchParams();

      if (filters.folderId) {
        params.set("folderId", filters.folderId);
      }

      if (filters.afiSeries) {
        params.set("afiSeries", filters.afiSeries);
      }

      const queryString = params.toString();
      const response = await fetch(`/api/documents${queryString ? `?${queryString}` : ""}`, {
        credentials: "include",
      });

      if (!response.ok) {
        const message = (await response.text()) || response.statusText;
        throw new Error(message);
      }

      return (await response.json()) as Document[];
    },
  });

  const documents: Document[] = documentsData ?? [];
  const showLoadingState = documentsLoading || (documentsFetching && documents.length === 0);
  const loadingSkeletonItems = Array.from({ length: 6 });
  const documentErrorMessage = documentsError
    ? documentsErrorObj?.message ?? "Unable to load documents. Please try again."
    : null;
  const folderErrorMessage = foldersError
    ? foldersErrorObj?.message ?? "Unable to load folders. Please try again."
    : null;

  // Get unique AFI numbers
  const afiNumbers = Array.from(
    new Set(documents.map((doc) => doc.afiNumber).filter(Boolean))
  ).sort();

  // Get all AFI series categories
  const allCategories = getAllCategories();

  // Filter documents
  const filteredDocuments = useMemo<Document[]>(() => {
    if (!searchQuery) {
      return documents;
    }

    return documents.filter((doc) =>
      doc.filename.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [documents, searchQuery]);

  // no selection state

  // Group documents by AFI category
  const groupedDocuments = useMemo(() => {
    if (!groupByCategory) {
      return null;
    }

    return groupDocumentsByCategory<Document>(filteredDocuments);
  }, [groupByCategory, filteredDocuments]);

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

  // Per-document Move to Folder
  const moveToFolder = useMutation({
    mutationFn: async ({ id, folderId }: { id: string; folderId: string }) => {
      await apiRequest("PATCH", `/api/documents/${id}`, { folderId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Updated", description: "Document moved to selected folder." });
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error?.message ?? "Unable to move document.", variant: "destructive" });
    },
  });

  // Bulk delete selected documents
  // bulk delete removed with selection UI

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 bg-background sticky top-0 z-10">
          <SidebarTrigger className="h-9 w-9 hover:bg-accent rounded-md transition-colors">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle Sidebar</span>
          </SidebarTrigger>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">Master AFI Library</h1>
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
            {/* Stats Cards removed by request */}

            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="search">Search</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="search"
                        placeholder="Search by filename..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="series">AFI Series</Label>
                    <Select value={selectedAfiSeries} onValueChange={setSelectedAfiSeries}>
                      <SelectTrigger id="series">
                        <SelectValue placeholder="All Series" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50 max-h-[300px]">
                        <SelectItem value="all">All Series</SelectItem>
                        {allCategories.map((cat) => (
                          <SelectItem key={cat.code} value={cat.code}>
                            {cat.code} - {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Organization Folder</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger id="category">
                        <SelectValue placeholder="All Folders" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        <SelectItem value="all">All Folders</SelectItem>
                        {folders.map((folder) => (
                          <SelectItem key={folder.id} value={folder.id}>
                            {folder.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="group">View</Label>
                    <Select 
                      value={groupByCategory ? "grouped" : "list"} 
                      onValueChange={(val) => setGroupByCategory(val === "grouped")}
                    >
                      <SelectTrigger id="group">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        <SelectItem value="list">List View</SelectItem>
                        <SelectItem value="grouped">Grouped by Series</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Documents List */}
            <Card>
              <CardHeader>
                <CardTitle>AFI Documents Library</CardTitle>
                <CardDescription>
                  {filteredDocuments.length} document{filteredDocuments.length !== 1 ? 's' : ''} found
                </CardDescription>
              </CardHeader>
              <CardContent>
                  {documentsError ? (
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
                            <Skeleton className="h-4 w-4 rounded" />
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
                    <div className="text-center py-8 text-muted-foreground">
                      No documents found matching your filters
                    </div>
                  ) : groupByCategory && groupedDocuments ? (
                  // Grouped view by AFI Series
                  <div className="space-y-6">
                    {Object.entries(groupedDocuments)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([code, { category, documents: groupDocs }]) => (
                        <div key={code} className="space-y-2">
                          <div className="flex items-center justify-between py-2 border-b">
                            <button
                              type="button"
                              onClick={() => toggleSeries(code)}
                              className="flex items-center gap-2 text-left hover:text-primary transition-colors"
                              aria-expanded={!collapsedSeries[code]}
                            >
                              {collapsedSeries[code] ? (
                                <ChevronRight className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                              <h3 className="font-semibold text-lg">{category.code} - {category.name}</h3>
                            </button>
                            <Badge variant="secondary">{groupDocs.length}</Badge>
                          </div>
                          {!collapsedSeries[code] ? (
                            <div className="space-y-2">
                              {groupDocs.map((doc) => (
                                <div
                                  key={doc.id}
                                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                                >
                                  <div className="flex items-center gap-4 flex-1">
                                    <FileText className="h-8 w-8 text-primary" />
                                    <div className="flex-1">
                                      <div className="font-medium">{doc.filename}</div>
                                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                                        <span>{doc.afiNumber}</span>
                                        <span>•</span>
                                        <span>{formatFileSize(doc.fileSize)}</span>
                                        <span>•</span>
                                        <span>{new Date(doc.uploadDate).toLocaleDateString()}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {renderStatusBadge(doc.status)}
                                    <DocumentActions document={doc} size="sm" />
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm">
                                          <FolderPlus className="h-4 w-4 mr-2" />
                                          Add to Folder
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        {folders.map((f) => (
                                          <DropdownMenuItem key={f.id} onClick={() => moveToFolder.mutate({ id: doc.id, folderId: f.id })}>
                                            {f.name}
                                          </DropdownMenuItem>
                                        ))}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={async () => {
                                        const ok = window.confirm(`Delete ${doc.filename}? This cannot be undone.`);
                                        if (!ok) return;
                                        try {
                                          await apiRequest("DELETE", `/api/documents/${doc.id}`);
                                          toast({ title: "Document deleted", description: `${doc.filename} removed.` });
                                          queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
                                        } catch (e: any) {
                                          toast({ title: "Delete failed", description: e?.message ?? "Unable to delete document.", variant: "destructive" });
                                        }
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                  </div>
                ) : (
                  // List view
                  <div className="space-y-2">
                    {filteredDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <FileText className="h-8 w-8 text-primary" />
                          <div className="flex-1">
                            <div className="font-medium">{doc.filename}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-2">
                              <span>{doc.afiNumber}</span>
                              <span>•</span>
                              <span className="text-xs">{getCategoryForAfi(doc.afiNumber).name}</span>
                              <span>•</span>
                              <span>{formatFileSize(doc.fileSize)}</span>
                              <span>•</span>
                              <span>{new Date(doc.uploadDate).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {renderStatusBadge(doc.status)}
                          <DocumentActions document={doc} size="sm" />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm">
                                <FolderPlus className="h-4 w-4 mr-2" />
                                Add to Folder
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {folders.map((f) => (
                                <DropdownMenuItem key={f.id} onClick={() => moveToFolder.mutate({ id: doc.id, folderId: f.id })}>
                                  {f.name}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              const ok = window.confirm(`Delete ${doc.filename}? This cannot be undone.`);
                              if (!ok) return;
                              try {
                                await apiRequest("DELETE", `/api/documents/${doc.id}`);
                                toast({ title: "Document deleted", description: `${doc.filename} removed.` });
                                queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
                              } catch (e: any) {
                                toast({ title: "Delete failed", description: e?.message ?? "Unable to delete document.", variant: "destructive" });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Selection UI removed; per-document Add to Folder is available on each row */}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
