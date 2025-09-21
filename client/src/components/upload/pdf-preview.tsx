import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PDFPreviewProps {
  file: File | null;
  numPages: number;
  onPageChange: (page: number) => void;
}

export default function PDFPreview({ file, numPages, onPageChange }: PDFPreviewProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    onPageChange(newPage);
  };

  if (!file) {
    return (
      <div className="bg-muted/30 border border-border rounded-lg aspect-[8.5/11] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl text-muted-foreground mb-4">📄</div>
          <p className="text-muted-foreground">PDF Preview</p>
          <p className="text-sm text-muted-foreground">Upload a file to preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-muted/30 border border-border rounded-lg aspect-[8.5/11] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl text-muted-foreground mb-4">📄</div>
          <p className="text-muted-foreground">PDF Preview</p>
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {numPages}
          </p>
        </div>
      </div>

      <div className="flex justify-center items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          data-testid="pdf-prev-page"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {currentPage} of {numPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePageChange(Math.min(numPages, currentPage + 1))}
          disabled={currentPage >= numPages}
          data-testid="pdf-next-page"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
