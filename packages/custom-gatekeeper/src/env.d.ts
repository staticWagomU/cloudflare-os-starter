declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("./index.js");
    durableNamespaces: "AccessConnect" | "CustomGatekeeper";
  }

  interface Env {
    AUTH_MODE?: "access_email" | "local_account" | "identity_future";
    BASE_URL?: string;
    CF_ACCESS_AUD?: string;
    CF_ACCESS_ISS?: string;
    ACCESS_CONNECT: DurableObjectNamespace<import("./connect.js").AccessConnect>;
    KNOWLEDGE_EMBEDDING_MODEL?: string;
    KNOWLEDGE_DB?: D1Database;
    KNOWLEDGE_OBJECTS?: R2Bucket;
    KNOWLEDGE_INDEX?: {
      upsert(vectors: Array<{
        id: string;
        values: number[];
        metadata?: Record<string, unknown>;
      }>): Promise<unknown>;
      query(values: number[], options?: {
        topK?: number;
      }): Promise<{
        matches?: Array<{
          id: string;
          score?: number;
          metadata?: Record<string, unknown> | null;
        }>;
      }>;
    };
    WORKERS_AI?: {
      run(model: string, input: unknown): Promise<unknown>;
    };
  }
}
