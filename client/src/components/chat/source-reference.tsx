import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SourceReferenceProps {
  sources: {
    afiNumber?: string;
    chapter?: string;
    section?: string;
    paragraph?: string;
    text?: string;
  } | {
    afiNumber?: string;
    chapter?: string;
    section?: string;
    paragraph?: string;
    text?: string;
  }[];
}

export default function SourceReference({ sources }: SourceReferenceProps) {
  if (!sources || (Array.isArray(sources) && sources.length === 0)) {
    return null;
  }

  // For now, we'll handle a single source
  const source = Array.isArray(sources) ? sources[0] : sources;

  return (
    <div className="bg-card border border-border rounded-lg p-3" data-testid="source-reference">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <Badge variant="secondary" className="text-xs">
            {source.afiNumber || "AFI"}, {source.chapter || "Ch1"} {source.section || "Sec1"} ¶{source.paragraph || "1.1"}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded border-l-4 border-primary">
          <strong>Source Text:</strong> {source.text || "Source text would appear here showing the exact content from the AFI that supports the assistant's response."}
        </div>
      </div>
    </div>
  );
}
