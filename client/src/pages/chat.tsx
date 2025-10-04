import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { type Folder, type Document } from "@/types/library";

type SearchResult = {
  id: string;
  text: string;
  metadata: {
    paragraph?: string;
    afi_number?: string;
    chapter?: string;
    doc_id?: string;
    compliance_tier?: string;
    folder?: string;
  };
  similarity_score: number;
};

type SearchResponse = {
  success: boolean;
  query: string;
  total_matches: number;
  results: SearchResult[];
  error?: string;
};

type ScopeSummary = {
  folderLabel: string;
  afiLabel: string | null;
};

export default function Chat() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [scopeFolder, setScopeFolder] = useState("all");
  const [scopeAfi, setScopeAfi] = useState("all");
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [lastScope, setLastScope] = useState<ScopeSummary | null>(null);
  const [smartMode, setSmartMode] = useState<boolean>(false);

  const { data: folders = [] } = useQuery<Folder[]>({
    queryKey: ["/api/folders"],
  });
  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });

  const selectedFolder = scopeFolder === "all" ? null : folders.find((folder) => folder.id === scopeFolder);

  // Filter documents by selected folder
  const filteredDocuments = scopeFolder === "all" 
    ? documents 
    : documents.filter((doc) => doc.folderId === scopeFolder);

  // Only show AFIs that are in the selected folder (or all if no folder selected)
  const afiNumbers = Array.from(
    new Set(
      filteredDocuments
        .map((doc) => doc.afiNumber?.trim())
        .filter((afi): afi is string => Boolean(afi)),
    ),
  ).sort();

  const searchMutation = useMutation<
    SearchResponse,
    unknown,
    { query: string; filters: Record<string, string>; scopeSummary: ScopeSummary; smart: boolean }
  >({
    mutationFn: async ({ query: searchText, filters, smart }) => {
      const payload: Record<string, unknown> = {
        query: searchText,
        n_results: 60,
      };

      if (Object.keys(filters).length > 0) {
        payload.filters = filters;
      }

      // Route to smart endpoint when enabled
      const endpoint = smart ? "/api/search/smart" : "/api/search";
      const response = await apiRequest("POST", endpoint, payload);
      return response.json() as Promise<SearchResponse>;
    },
    onSuccess: (data, variables) => {
      console.log("🔍 Search response:", data);
      
      if (!data.success) {
        toast({
          title: "Search failed",
          description: data.error || "Unable to complete search.",
          variant: "destructive",
        });
        setResults([]);
        return;
      }

      console.log(`✅ Received ${data.results.length} results`);
      setResults(data.results);
      setLastQuery(data.query);
      setLastScope(variables.scopeSummary);
    },
    onError: (error: unknown) => {
      console.error(error);
      toast({
        title: "Search failed",
        description: "Something went wrong while searching. Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const handleSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) {
      toast({
        title: "Enter a question",
        description: "Ask for an AFI topic, e.g. 'male hair requirements' or 'impoundment procedures'.",
      });
      return;
    }

    const filters: Record<string, string> = {};
    if (selectedFolder) {
      filters.folderId = selectedFolder.id;
      console.log("📁 Filtering by folder:", selectedFolder.name, `(${selectedFolder.id})`);
    }
    if (scopeAfi !== "all") {
      filters.afi_number = scopeAfi;
      console.log("📄 Filtering by AFI:", scopeAfi);
    }
    console.log("🔍 Final filters:", filters);

    const scopeSummary: ScopeSummary = {
      folderLabel: selectedFolder?.name ?? "All folders",
      afiLabel: scopeAfi !== "all" ? scopeAfi : null,
    };

    searchMutation.mutate({
      query: trimmed,
      filters,
      scopeSummary,
      smart: smartMode,
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSearch();
    }
  };

  return (
    <SidebarLayout title="Semantic Search">
      <div className="space-y-6">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search Scope
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="folder-select">Folder</Label>
                <Select value={scopeFolder} onValueChange={(value) => {
                  setScopeFolder(value);
                  // Reset AFI filter when folder changes since AFI list will change
                  setScopeAfi("all");
                }}>
                  <SelectTrigger id="folder-select" data-testid="scope-folder-select">
                    <SelectValue placeholder="All Folders" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All folders</SelectItem>
                    {folders.map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {folder.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="afi-select">Specific AFI (optional)</Label>
                <Select value={scopeAfi} onValueChange={setScopeAfi}>
                  <SelectTrigger id="afi-select" data-testid="scope-afi-select">
                    <SelectValue placeholder="All AFIs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All AFIs</SelectItem>
                    {afiNumbers.map((afi) => (
                      <SelectItem key={afi} value={afi}>
                        {afi}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {selectedFolder
                ? `Limiting results to ${selectedFolder.name}${scopeAfi !== "all" ? ` • AFI ${scopeAfi}` : ""}.`
                : `Searching all folders${scopeAfi !== "all" ? ` • AFI ${scopeAfi}` : ""}.`}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search the AFI Library
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Example: male hair grooming, impoundment procedures, QA notifications"
                data-testid="semantic-search-input"
              />
              <Button
                onClick={handleSearch}
                disabled={searchMutation.isPending}
                data-testid="semantic-search-button"
              >
                {searchMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="smart-mode" checked={smartMode} onCheckedChange={(v) => setSmartMode(!!v)} />
              <Label htmlFor="smart-mode" className="text-sm">Smart mode</Label>
              <p className="text-xs text-muted-foreground">
                Uses an LLM to expand scenario-style questions before searching. Turn off for direct keyword queries.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Searches the AFI corpus using semantic embeddings{smartMode ? " with LLM-assisted query expansion" : ""}. Matching paragraphs are returned with subordinate subparagraphs included.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">
              {lastQuery ? (
                <span>
                  Results for <span className="font-semibold">“{lastQuery}”</span> ({results.length} matches)
                </span>
              ) : (
                "No results yet"
              )}
            </CardTitle>
            {lastQuery && lastScope && (
              <p className="text-xs text-muted-foreground">
                Scope: {lastScope.folderLabel}
                {lastScope.afiLabel ? ` • AFI ${lastScope.afiLabel}` : " • All AFIs"}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {searchMutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching…
              </div>
            )}

            {!searchMutation.isPending && lastQuery && results.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No matching AFI paragraphs were found. Try a different phrasing or adjust your scope filters.
              </p>
            )}

            {results.map((result) => {
              const metadata = result.metadata || {};
              const afi = metadata.afi_number || "Unknown AFI";
              const paragraph = metadata.paragraph || "—";
              const chapter = metadata.chapter ? `Chapter ${metadata.chapter}` : null;
              const folderLabel = metadata.folder || null;

              return (
                <div
                  key={`${result.id}-${paragraph}`}
                  className="rounded-lg border border-border bg-muted/40 p-4 space-y-2"
                >
                  <div className="text-sm font-medium text-foreground flex flex-wrap items-center gap-2">
                    <span>{afi}</span>
                    <span className="text-muted-foreground">•</span>
                    <span>Paragraph {paragraph}</span>
                    {chapter && (
                      <>
                        <span className="text-muted-foreground">•</span>
                        <span>{chapter}</span>
                      </>
                    )}
                    {folderLabel && (
                      <>
                        <span className="text-muted-foreground">•</span>
                        <span>{folderLabel}</span>
                      </>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      Similarity {(result.similarity_score || 0).toFixed(3)}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-line text-foreground">
                    {result.text}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </SidebarLayout>
  );
}
