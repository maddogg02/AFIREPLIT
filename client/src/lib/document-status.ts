import type { Document } from "@/types/library";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

export type DocumentStatusBadgeProps = {
  label: string;
  badgeClassName: string;
  icon?: LucideIcon;
};

const STATUS_META: Record<Document["status"], DocumentStatusBadgeProps> = {
  processing: {
    label: "Processing",
    badgeClassName: "bg-primary/10 text-primary border border-primary/20",
    icon: Loader2,
  },
  complete: {
    label: "Complete",
    badgeClassName: "bg-success/10 text-success border border-success/20",
    icon: CheckCircle2,
  },
  error: {
    label: "Error",
    badgeClassName: "bg-destructive/10 text-destructive border border-destructive/20",
    icon: AlertTriangle,
  },
};

const FALLBACK_META: DocumentStatusBadgeProps = {
  label: "Unknown",
  badgeClassName: "bg-muted text-muted-foreground border border-border",
};

export function getDocumentStatusBadgeProps(status: Document["status"] | string | null | undefined): DocumentStatusBadgeProps {
  if (!status) {
    return FALLBACK_META;
  }

  return STATUS_META[status as Document["status"]] ?? {
    label: status.charAt(0).toUpperCase() + status.slice(1),
    badgeClassName: "bg-muted text-muted-foreground border border-border",
  };
}
