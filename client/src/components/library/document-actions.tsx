import { useCallback } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Document } from "@/types/library";
import { FileText, FileSpreadsheet, Loader2, AlertTriangle } from "lucide-react";
import { useDocumentViewer } from "@/hooks/use-document-viewer";

export interface DocumentActionsProps {
  document: Document;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  showLabels?: boolean;
  className?: string;
  testIds?: {
    pdf?: string;
    csv?: string;
  };
  disableCsv?: boolean;
}

export function DocumentActions({
  document,
  size = "sm",
  variant = "outline",
  showLabels = true,
  className,
  testIds,
  disableCsv = false,
}: DocumentActionsProps) {
  const { openDocument } = useDocumentViewer();
  const isReady = document.status === "complete";

  const openResource = useCallback(
    (path: string, label: string) => {
      if (!isReady) {
        return;
      }

      openDocument(path, label);
    },
    [isReady, openDocument],
  );

  const PdfIcon = !isReady
    ? document.status === "error"
      ? AlertTriangle
      : Loader2
    : FileText;

  const CsvIcon = !isReady ? Loader2 : FileSpreadsheet;

  const pdfAvailable = document.hasPdf ?? (!!document.storagePath && isReady);
  const csvAvailable = document.hasParsedCsv ?? (!!document.csvStoragePath && isReady);

  const pdfDisabled = !pdfAvailable;
  const showCsvButton = csvAvailable;
  const csvDisabled = disableCsv || !csvAvailable;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
  variant={variant}
  size={size}
  disabled={pdfDisabled}
        onClick={() => openResource(`/api/documents/${document.id}/view`, "PDF")}
        data-testid={testIds?.pdf}
      >
        <PdfIcon className={cn("h-4 w-4", !isReady && document.status === "processing" && "animate-spin")} />
        {showLabels && <span className="ml-1">PDF</span>}
      </Button>
      {showCsvButton ? (
        <Button
          variant={variant}
          size={size}
          disabled={csvDisabled}
          onClick={() => openResource(`/api/documents/${document.id}/view-csv`, "CSV")}
          data-testid={testIds?.csv}
        >
          <CsvIcon className={cn("h-4 w-4", !isReady && "animate-spin")} />
          {showLabels && <span className="ml-1">CSV</span>}
        </Button>
      ) : null}
    </div>
  );
}
