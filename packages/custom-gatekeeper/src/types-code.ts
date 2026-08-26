const TYPES_CODE = `/** Information supplied by the organization operating this CloudflareOS deployment. */
export interface CustomDeploymentInfo {
  name: string;
  message: string;
  authMode: "access_email" | "local_account" | "identity_future";
  storageReady: boolean;
}

export type KnowledgePrincipal =
  | { type: "access_email"; id: string }
  | { type: "local_account"; id: string }
  | { type: "identity_user"; id: string }
  | { type: "role"; id: string }
  | { type: "permission"; id: string };

export interface KnowledgeCollectionSummary {
  id: string;
  title: string;
  description: string;
  role: "reader" | "editor" | "owner";
  tags: string[];
}

export interface KnowledgeSearchResult {
  documentId: string;
  collectionId: string;
  title: string;
  excerpt: string;
  sourceType: string;
  sourceDate?: string;
  tags: string[];
  freshness?: "fresh" | "aging" | "stale" | "evergreen";
  score?: number;
}

export interface KnowledgeDocument {
  id: string;
  collectionId: string;
  title: string;
  content: string;
  sourceType: string;
  sourceDate?: string;
  tags: string[];
}

export interface KnowledgeCollectionInput {
  title: string;
  description: string;
  readers?: KnowledgePrincipal[];
  editors?: KnowledgePrincipal[];
  tags?: string[];
}

export interface KnowledgeDocumentInput {
  collectionId: string;
  title: string;
  body: string;
  sourceType?: "meeting" | "incident" | "note" | "transcript" | "employee" | "other";
  sourceDate?: string;
  freshnessPolicy?: "default" | "evergreen" | "time_sensitive";
  tags?: string[];
}

/** Collection management capability provided to the CloudflareOS agent. */
export interface CustomSession {
  /** Returns deployment diagnostics after recording an observation. */
  getDeploymentInfo(): Promise<CustomDeploymentInfo>;
  /** Lists collections readable by the current principal. */
  listCollections(): Promise<KnowledgeCollectionSummary[]>;
  /** Creates a collection owned by the current principal. */
  createCollection(input: KnowledgeCollectionInput): Promise<KnowledgeCollectionSummary>;
  /** Searches readable documents. Falls back to keyword search when Vectorize is not configured. */
  search(query: string, options?: {
    collectionId?: string;
    tags?: string[];
    from?: string;
    to?: string;
    freshness?: "prefer_recent" | "include_stale";
    limit?: number;
  }): Promise<KnowledgeSearchResult[]>;
  /** Reads one document if the current principal can access its collection. */
  readDocument(documentId: string): Promise<KnowledgeDocument | null>;
  /** Adds a document to a collection writable by the current principal. */
  addDocument(input: KnowledgeDocumentInput): Promise<KnowledgeDocument>;
}

/** Read-only capability scoped to one selected collection. */
export interface KnowledgeCollectionSession {
  /** Returns the selected collection if access is still available. */
  getCollection(): Promise<KnowledgeCollectionSummary>;
  /** Searches only documents in the selected collection. */
  search(query: string, options?: {
    tags?: string[];
    from?: string;
    to?: string;
    freshness?: "prefer_recent" | "include_stale";
    limit?: number;
  }): Promise<KnowledgeSearchResult[]>;
  /** Reads one document only when it belongs to the selected collection. */
  readDocument(documentId: string): Promise<KnowledgeDocument | null>;
}
`;

export default TYPES_CODE;
