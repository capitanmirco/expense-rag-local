export type RetrievedChunk = {
  text: string;
  meta: Record<string, any>;
  score: number; // higher = better
};

export type QueryFilter = Record<string, string | number | boolean>;

export interface VectorStore {
  upsert(docs: { id: string; text: string; meta?: Record<string, any> }[]): Promise<{ chunks: number }>;
  query(queryText: string, k: number, options?: { filter?: QueryFilter }): Promise<RetrievedChunk[]>;
}
