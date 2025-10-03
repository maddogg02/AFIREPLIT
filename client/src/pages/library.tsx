import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, Plus } from "lucide-react";
import DocumentCard from "@/components/library/document-card";
import { Link } from "wouter";
import { type Document, type Folder } from "@/types/library";

export default function Library() {
  const [selectedFolder, setSelectedFolder] = useState<string>("all");
  const [selectedAfi, setSelectedAfi] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch folders
  const { data: folders = [] } = useQuery<Folder[]>({
    queryKey: ["/api/folders"],
  });

  // Fetch documents
  const { data: documents = [], isLoading } = useQuery<Document[]>({
    queryKey: ["/api/documents", selectedFolder === "all" ? undefined : selectedFolder],
  });

  // Filter documents based on selected criteria
  const filteredDocuments = documents.filter((doc) => {
    if (selectedAfi !== "all" && doc.afiNumber !== selectedAfi) return false;
    if (selectedStatus !== "all" && doc.status !== selectedStatus) return false;
    if (searchQuery && !doc.filename.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Get unique AFI numbers for filter
  const afiNumbers = Array.from(new Set(documents.map(doc => doc.afiNumber)));

  const statusOptions = [
    { value: "processing", label: "Processing" },
    { value: "complete", label: "Complete" },
    { value: "error", label: "Error" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">Document Library</h2>
        <div className="flex gap-2">
          <Button variant="outline" data-testid="filter-button">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
          <Link href="/upload">
            <Button data-testid="upload-new-button">
              <Plus className="h-4 w-4 mr-2" />
              Upload New
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Folder</Label>
              <Select value={selectedFolder} onValueChange={setSelectedFolder}>
                <SelectTrigger data-testid="folder-filter">
                  <SelectValue placeholder="All Folders" />
                </SelectTrigger>
                <SelectContent>
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
              <Label>AFI Number</Label>
              <Select value={selectedAfi} onValueChange={setSelectedAfi}>
                <SelectTrigger data-testid="afi-filter">
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

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger data-testid="status-filter">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {statusOptions.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Search</Label>
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="search-input"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document Grid */}
      {isLoading ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">Loading documents...</p>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No documents found.</p>
          <Link href="/upload">
            <Button className="mt-4" data-testid="upload-first-button">
              Upload your first document
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocuments.map((document) => (
            <DocumentCard key={document.id} document={document} />
          ))}
        </div>
      )}
    </div>
  );
}
