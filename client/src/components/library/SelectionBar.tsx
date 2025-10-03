import { Button } from "@/components/ui/button";
import { X, FolderPlus } from "lucide-react";

interface SelectionBarProps {
  count: number;
  onClear: () => void;
  onAdd: () => void;
  onDelete?: () => void;
}

export default function SelectionBar({ count, onClear, onAdd, onDelete }: SelectionBarProps) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-primary text-primary-foreground rounded-lg shadow-lg px-6 py-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{count}</span>
          <span>document{count !== 1 ? 's' : ''} selected</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onAdd}
            className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
          >
            <FolderPlus className="h-4 w-4 mr-2" />
            Add to Folder
          </Button>
          {onDelete ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
            >
              <X className="h-4 w-4 mr-2" />
              Delete Selected
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-primary-foreground hover:bg-primary-foreground/20"
          >
            <X className="h-4 w-4 mr-2" />
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
