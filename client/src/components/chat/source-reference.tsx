import { FileText, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface SourceReferenceProps {
  sources: Array<{
    reference?: number;
    afi_number?: string;
    chapter?: string;
    paragraph?: string;
    similarity_score?: number;
    text_preview?: string;
  }>;
}

export default function SourceReference({ sources }: SourceReferenceProps) {
  const [showAll, setShowAll] = useState(false);
  
  if (!sources || sources.length === 0) {
    return null;
  }

  // Show first 5 sources by default
  const displaySources = showAll ? sources : sources.slice(0, 5);
  const hasMore = sources.length > 5;

  return (
    <div className="bg-card border border-border rounded-lg p-3 mt-2" data-testid="source-reference">
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Relevant AFI References ({sources.length} found)</span>
        </div>
        
        {displaySources.map((source, index) => (
          <div key={index} className="border-l-4 border-primary bg-muted/30 p-3 rounded-r">
            <div className="flex items-center justify-between mb-2">
              <Badge variant="secondary" className="text-xs font-mono">
                {source.afi_number || "AFI"} Ch{source.chapter || "?"} ¶{source.paragraph || "?"}
              </Badge>
              {source.similarity_score && (
                <span className="text-xs text-muted-foreground">
                  {Math.round(source.similarity_score * 100)}% match
                </span>
              )}
            </div>
            <div className="text-sm text-foreground">
              <strong>Reference #{source.reference || index + 1}:</strong> {source.text_preview || "Source text would appear here."}
            </div>
          </div>
        ))}
        
        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(!showAll)}
            className="w-full mt-2"
          >
            {showAll ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                Show {sources.length - 5} More References
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
