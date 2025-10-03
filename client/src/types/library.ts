import type { Document as SharedDocument, Folder as SharedFolder } from "@shared/schema";

export type Folder = SharedFolder & {
  /**
   * Optional document count returned by aggregation endpoints.
   * Not persisted in the folders table but useful for UI summaries.
   */
  documentCount?: number | null;
};

export type Document = SharedDocument & {
  hasPdf?: boolean;
  hasParsedCsv?: boolean;
};
