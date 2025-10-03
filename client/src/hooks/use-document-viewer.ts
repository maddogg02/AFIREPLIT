import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

export interface UseDocumentViewerOptions {
  /** Message to display when running in a non-browser context */
  ssrMessage?: string;
}

export function useDocumentViewer(options: UseDocumentViewerOptions = {}) {
  const { toast } = useToast();

  const openDocument = useCallback(
    (path: string, label: string, target: string = "_blank") => {
      if (typeof window === "undefined") {
        toast({
          title: `Unable to open ${label}`,
          description:
            options.ssrMessage ??
            "Document viewing is only available in the browser. Please try again in a supported environment.",
          variant: "destructive",
        });
        return null;
      }

      try {
        const features = target === "_blank" ? "noopener,noreferrer" : undefined;
        const newWindow = window.open(path, target, features);

        if (!newWindow) {
          toast({
            title: `Pop-up blocked for ${label}`,
            description: "Allow pop-ups for this site to view the document.",
            variant: "destructive",
          });
        }

        return newWindow;
      } catch (error) {
        console.error("Failed to open document viewer", error);
        toast({
          title: `Unable to open ${label}`,
          description:
            error instanceof Error ? error.message : "An unknown error occurred while opening the document.",
          variant: "destructive",
        });
        return null;
      }
    },
    [options.ssrMessage, toast],
  );

  return { openDocument };
}
