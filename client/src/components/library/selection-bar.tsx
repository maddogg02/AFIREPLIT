import { Button } from "@/components/ui/button";
import { BadgeCheck, XCircle, CopyPlus } from "lucide-react";

interface SelectionBarProps {
  count: number;
  visibleCount: number;
  totalVisible: number;
  allVisibleSelected: boolean;
  onClear: () => void;
  onSelectVisible: () => void;
  onAdd: () => void;
  disabled?: boolean;
}

export default function SelectionBar({
  count,
  visibleCount,
  totalVisible,
  allVisibleSelected,
  onClear,
  onSelectVisible,
  onAdd,
  disabled,
}: SelectionBarProps) {
  return (
    <div className="fixed bottom-6 left-0 right-0 flex justify-center pointer-events-none z-40">
      <div className="pointer-events-auto bg-background border border-border shadow-lg rounded-full px-6 py-3 flex items-center gap-4">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {count} selected
          </p>
          <p className="text-xs text-muted-foreground">
            {visibleCount} of {totalVisible} visible in view
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSelectVisible}
            className="gap-1"
          >
            <BadgeCheck className="h-4 w-4" />
            {allVisibleSelected ? "Deselect Visible" : "Select Visible"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="gap-1"
          >
            <XCircle className="h-4 w-4" />
            Clear
          </Button>
          <Button
            size="sm"
            onClick={onAdd}
            disabled={disabled}
            className="gap-1"
          >
            <CopyPlus className="h-4 w-4" />
            Add to Folder
          </Button>
        </div>
      </div>
    </div>
  );
}
