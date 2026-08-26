import type {
  KnowledgeCollectionInput,
  KnowledgeCollectionSummary,
  KnowledgeDocument,
  KnowledgeDocumentInput,
  KnowledgePrincipal,
  KnowledgeSearchResult,
} from "./types.js";

type CollectionRole = "reader" | "editor" | "owner";
type FreshnessPolicy = "default" | "evergreen" | "time_sensitive";

type SearchOptions = {
  collectionId?: string;
  tags?: string[];
  from?: string;
  to?: string;
  freshness?: "prefer_recent" | "include_stale";
  limit?: number;
};

type CollectionRow = {
  id: string;
  title: string;
  description: string;
  role: CollectionRole;
};

type DocumentRow = {
  id: string;
  collection_id: string;
  title: string;
  source_type: string;
  source_date: string | null;
  freshness_policy: FreshnessPolicy | null;
  r2_key: string;
};

type VectorizeBinding = {
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

type AiBinding = {
  run(model: string, input: unknown): Promise<unknown>;
};

export type KnowledgeEnv = {
  KNOWLEDGE_DB?: D1Database;
  KNOWLEDGE_OBJECTS?: R2Bucket;
  KNOWLEDGE_INDEX?: VectorizeBinding;
  WORKERS_AI?: AiBinding;
  KNOWLEDGE_EMBEDDING_MODEL?: string;
};

export function storageReady(env: KnowledgeEnv): boolean {
  return Boolean(env.KNOWLEDGE_DB && env.KNOWLEDGE_OBJECTS);
}

export function normalizeTags(tags: string[] | undefined): string[] {
  let seen = new Set<string>();
  for (let tag of tags ?? []) {
    let normalized = tag.trim().replace(/^#/, "").replace(/\s+/g, "-").toLowerCase();
    if (normalized && normalized.length <= 64) seen.add(normalized);
  }
  return [...seen].toSorted();
}

export function freshnessWeight(
  sourceDate: string | undefined,
  policy: FreshnessPolicy | null | undefined,
  now = new Date(),
): number {
  if (policy === "evergreen" || !sourceDate) return 1;
  let timestamp = Date.parse(sourceDate);
  if (!Number.isFinite(timestamp)) return 1;
  let ageDays = Math.max(0, (now.getTime() - timestamp) / 86_400_000);
  let halfLifeDays = policy === "time_sensitive" ? 30 : 180;
  return Math.max(0.25, Math.pow(0.5, ageDays / halfLifeDays));
}

export function freshnessLabel(
  sourceDate: string | undefined,
  policy: FreshnessPolicy | null | undefined,
  now = new Date(),
): KnowledgeSearchResult["freshness"] {
  if (policy === "evergreen") return "evergreen";
  if (!sourceDate) return undefined;
  let timestamp = Date.parse(sourceDate);
  if (!Number.isFinite(timestamp)) return undefined;
  let ageDays = Math.max(0, (now.getTime() - timestamp) / 86_400_000);
  if (ageDays <= 30) return "fresh";
  if (ageDays <= 180) return "aging";
  return "stale";
}

export class KnowledgeRepository {
  readonly #env: KnowledgeEnv;
  #schemaReady: Promise<void> | null = null;

  constructor(env: KnowledgeEnv) {
    this.#env = env;
  }

  async listCollections(principal: KnowledgePrincipal): Promise<KnowledgeCollectionSummary[]> {
    await this.#ensureSchema();
    let rows = await this.#db().prepare(`
      select c.id, c.title, c.description, a.role
      from collections c
      join collection_acl a on a.collection_id = c.id
      where c.archived_at is null
        and a.principal_type = ?
        and a.principal_id = ?
      order by c.updated_at desc, c.title asc
    `).bind(principal.type, principal.id).all<CollectionRow>();

    return Promise.all((rows.results ?? []).map(async row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      role: row.role,
      tags: await this.#tagsFor("collection_tags", "collection_id", row.id),
    })));
  }

  async createCollection(
    principal: KnowledgePrincipal,
    input: KnowledgeCollectionInput,
  ): Promise<KnowledgeCollectionSummary> {
    await this.#ensureSchema();
    let title = requiredText(input.title, "title");
    let description = input.description?.trim() ?? "";
    let collectionId = `col_${crypto.randomUUID()}`;
    let now = new Date().toISOString();
    let tags = normalizeTags(input.tags);

    await this.#db().batch([
      this.#db().prepare(`
        insert into collections (
          id, title, description, owner_principal_type, owner_principal_id,
          visibility, created_at, updated_at
        ) values (?, ?, ?, ?, ?, 'restricted', ?, ?)
      `).bind(collectionId, title, description, principal.type, principal.id, now, now),
      this.#db().prepare(`
        insert into collection_acl (collection_id, principal_type, principal_id, role)
        values (?, ?, ?, 'owner')
      `).bind(collectionId, principal.type, principal.id),
      ...this.#aclStatements(collectionId, input.readers ?? [], "reader"),
      ...this.#aclStatements(collectionId, input.editors ?? [], "editor"),
    ]);
    await this.#setTags("collection_tags", "collection_id", collectionId, tags);

    return { id: collectionId, title, description, role: "owner", tags };
  }

  async addDocument(
    principal: KnowledgePrincipal,
    input: KnowledgeDocumentInput,
  ): Promise<KnowledgeDocument> {
    await this.#ensureSchema();
    await this.#assertCollectionRole(principal, input.collectionId, ["editor", "owner"]);

    let title = requiredText(input.title, "title");
    let body = requiredText(input.body, "body");
    let sourceType = input.sourceType ?? "note";
    let freshnessPolicy = input.freshnessPolicy ?? "default";
    let documentId = `doc_${crypto.randomUUID()}`;
    let chunkId = `chunk_${crypto.randomUUID()}`;
    let normalizedKey = `documents/${documentId}/normalized.md`;
    let sourceKey = `documents/${documentId}/source`;
    let chunkKey = `chunks/${chunkId}.txt`;
    let now = new Date().toISOString();
    let tags = normalizeTags(input.tags);

    await Promise.all([
      this.#r2().put(normalizedKey, body, { httpMetadata: { contentType: "text/markdown" } }),
      this.#r2().put(sourceKey, body, { httpMetadata: { contentType: "text/markdown" } }),
      this.#r2().put(chunkKey, body, { httpMetadata: { contentType: "text/plain" } }),
    ]);

    await this.#db().batch([
      this.#db().prepare(`
        insert into documents (
          id, collection_id, title, source_type, source_date, freshness_policy,
          r2_key, content_type, created_by_principal_type, created_by_principal_id,
          created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, 'text/markdown', ?, ?, ?, ?)
      `).bind(
        documentId,
        input.collectionId,
        title,
        sourceType,
        input.sourceDate ?? null,
        freshnessPolicy,
        normalizedKey,
        principal.type,
        principal.id,
        now,
        now,
      ),
      this.#db().prepare(`
        insert into chunks (id, document_id, collection_id, chunk_index, r2_text_key, vector_id)
        values (?, ?, ?, 0, ?, ?)
      `).bind(chunkId, documentId, input.collectionId, chunkKey, chunkId),
      this.#db().prepare("update collections set updated_at = ? where id = ?")
        .bind(now, input.collectionId),
    ]);
    await this.#setTags("document_tags", "document_id", documentId, tags);
    await this.#indexChunk(chunkId, documentId, input.collectionId, body, {
      sourceType,
      tags,
      sourceDate: input.sourceDate,
      updatedAt: now,
    });

    return {
      id: documentId,
      collectionId: input.collectionId,
      title,
      content: body,
      sourceType,
      sourceDate: input.sourceDate,
      tags,
    };
  }

  async readDocument(
    principal: KnowledgePrincipal,
    documentId: string,
  ): Promise<KnowledgeDocument | null> {
    await this.#ensureSchema();
    let row = await this.#db().prepare(`
      select id, collection_id, title, source_type, source_date, freshness_policy, r2_key
      from documents
      where id = ? and deleted_at is null
    `).bind(documentId).first<DocumentRow>();
    if (!row) return null;
    await this.#assertCollectionRole(principal, row.collection_id, ["reader", "editor", "owner"]);
    let content = await this.#readText(row.r2_key);
    return {
      id: row.id,
      collectionId: row.collection_id,
      title: row.title,
      content,
      sourceType: row.source_type,
      sourceDate: row.source_date ?? undefined,
      tags: await this.#tagsFor("document_tags", "document_id", row.id),
    };
  }

  async search(
    principal: KnowledgePrincipal,
    query: string,
    options: SearchOptions = {},
  ): Promise<KnowledgeSearchResult[]> {
    await this.#ensureSchema();
    let terms = tokenize(query);
    let limit = Math.min(Math.max(options.limit ?? 10, 1), 25);
    let collections = await this.listCollections(principal);
    let readable = new Set(collections.map(collection => collection.id));
    if (options.collectionId) {
      readable = readable.has(options.collectionId) ? new Set([options.collectionId]) : new Set();
    }
    if (readable.size === 0) return [];

    let vectorScores = await this.#vectorScores(query, limit);
    let rows = await this.#db().prepare(`
      select id, collection_id, title, source_type, source_date, freshness_policy, r2_key
      from documents
      where deleted_at is null
      order by updated_at desc
      limit 250
    `).all<DocumentRow>();
    let requiredTags = new Set(normalizeTags(options.tags));
    let results: KnowledgeSearchResult[] = [];

    for (let row of rows.results ?? []) {
      if (!readable.has(row.collection_id)) continue;
      if (options.from && row.source_date && row.source_date < options.from) continue;
      if (options.to && row.source_date && row.source_date > options.to) continue;

      let tags = await this.#tagsFor("document_tags", "document_id", row.id);
      if (requiredTags.size && !tags.some(tag => requiredTags.has(tag))) continue;

      let content = await this.#readText(row.r2_key);
      let keywordScore = scoreText(terms, content, row.title, tags);
      let vectorScore = vectorScores.get(row.id) ?? 0;
      let baseScore = Math.max(keywordScore, vectorScore);
      if (baseScore <= 0 && terms.length > 0) continue;

      let weight = options.freshness === "include_stale"
        ? 1
        : freshnessWeight(row.source_date ?? undefined, row.freshness_policy);
      let tagBoost = requiredTags.size ? 1.15 : 1;
      let score = baseScore * weight * tagBoost;
      results.push({
        documentId: row.id,
        collectionId: row.collection_id,
        title: row.title,
        excerpt: excerpt(content, terms),
        sourceType: row.source_type,
        sourceDate: row.source_date ?? undefined,
        tags,
        freshness: freshnessLabel(row.source_date ?? undefined, row.freshness_policy),
        score,
      });
    }

    return results.toSorted((left, right) => (right.score ?? 0) - (left.score ?? 0))
      .slice(0, limit);
  }

  async #ensureSchema(): Promise<void> {
    if (!storageReady(this.#env)) {
      throw new Error("Restricted Knowledge requires KNOWLEDGE_DB and KNOWLEDGE_OBJECTS bindings.");
    }
    this.#schemaReady ??= this.#createSchema();
    await this.#schemaReady;
  }

  async #createSchema(): Promise<void> {
    await this.#db().batch([
      this.#db().prepare(`
        create table if not exists collections (
          id text primary key,
          title text not null,
          description text not null,
          owner_principal_type text not null,
          owner_principal_id text not null,
          visibility text not null,
          created_at text not null,
          updated_at text not null,
          archived_at text
        )
      `),
      this.#db().prepare(`
        create table if not exists collection_acl (
          collection_id text not null,
          principal_type text not null,
          principal_id text not null,
          role text not null,
          primary key(collection_id, principal_type, principal_id)
        )
      `),
      this.#db().prepare(`
        create table if not exists documents (
          id text primary key,
          collection_id text not null,
          title text not null,
          source_type text not null,
          source_date text,
          freshness_policy text,
          r2_key text not null,
          content_type text not null,
          created_by_principal_type text not null,
          created_by_principal_id text not null,
          created_at text not null,
          updated_at text not null,
          deleted_at text
        )
      `),
      this.#db().prepare(`
        create table if not exists tags (
          id text primary key,
          name text not null unique,
          description text
        )
      `),
      this.#db().prepare(`
        create table if not exists document_tags (
          document_id text not null,
          tag_id text not null,
          primary key(document_id, tag_id)
        )
      `),
      this.#db().prepare(`
        create table if not exists collection_tags (
          collection_id text not null,
          tag_id text not null,
          primary key(collection_id, tag_id)
        )
      `),
      this.#db().prepare(`
        create table if not exists chunks (
          id text primary key,
          document_id text not null,
          collection_id text not null,
          chunk_index integer not null,
          r2_text_key text not null,
          vector_id text not null
        )
      `),
    ]);
  }

  #aclStatements(collectionId: string, principals: KnowledgePrincipal[], role: CollectionRole) {
    return principals.map(principal => this.#db().prepare(`
      insert or replace into collection_acl (collection_id, principal_type, principal_id, role)
      values (?, ?, ?, ?)
    `).bind(collectionId, principal.type, principal.id, role));
  }

  async #assertCollectionRole(
    principal: KnowledgePrincipal,
    collectionId: string,
    allowed: CollectionRole[],
  ): Promise<CollectionRole> {
    let role = await this.#collectionRole(principal, collectionId);
    if (!role || !allowed.includes(role)) {
      throw new Error(`Principal cannot access collection ${collectionId}.`);
    }
    return role;
  }

  async #collectionRole(
    principal: KnowledgePrincipal,
    collectionId: string,
  ): Promise<CollectionRole | null> {
    let row = await this.#db().prepare(`
      select role
      from collection_acl
      where collection_id = ? and principal_type = ? and principal_id = ?
      order by case role when 'owner' then 3 when 'editor' then 2 else 1 end desc
      limit 1
    `).bind(collectionId, principal.type, principal.id).first<{ role: CollectionRole }>();
    return row?.role ?? null;
  }

  async #setTags(
    relationTable: "collection_tags" | "document_tags",
    relationColumn: "collection_id" | "document_id",
    entityId: string,
    tags: string[],
  ): Promise<void> {
    for (let name of tags) {
      await this.#db().prepare("insert or ignore into tags (id, name) values (?, ?)")
        .bind(`tag_${crypto.randomUUID()}`, name)
        .run();
      let tag = await this.#db().prepare("select id from tags where name = ?")
        .bind(name)
        .first<{ id: string }>();
      if (!tag) continue;
      await this.#db().prepare(`
        insert or ignore into ${relationTable} (${relationColumn}, tag_id)
        values (?, ?)
      `).bind(entityId, tag.id).run();
    }
  }

  async #tagsFor(
    relationTable: "collection_tags" | "document_tags",
    relationColumn: "collection_id" | "document_id",
    entityId: string,
  ): Promise<string[]> {
    let rows = await this.#db().prepare(`
      select t.name
      from tags t
      join ${relationTable} r on r.tag_id = t.id
      where r.${relationColumn} = ?
      order by t.name asc
    `).bind(entityId).all<{ name: string }>();
    return (rows.results ?? []).map(row => row.name);
  }

  async #readText(key: string): Promise<string> {
    let object = await this.#r2().get(key);
    if (!object) throw new Error(`Missing R2 object: ${key}`);
    return object.text();
  }

  async #indexChunk(
    chunkId: string,
    documentId: string,
    collectionId: string,
    body: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!this.#env.WORKERS_AI || !this.#env.KNOWLEDGE_INDEX) return;
    let embedding = await this.#embedding([body]);
    let values = embedding[0];
    if (!values) return;
    await this.#env.KNOWLEDGE_INDEX.upsert([{
      id: chunkId,
      values,
      metadata: { ...metadata, chunkId, documentId, collectionId },
    }]);
  }

  async #vectorScores(query: string, limit: number): Promise<Map<string, number>> {
    if (!this.#env.WORKERS_AI || !this.#env.KNOWLEDGE_INDEX || !query.trim()) {
      return new Map();
    }
    let [values] = await this.#embedding([query]);
    if (!values) return new Map();
    let response = await this.#env.KNOWLEDGE_INDEX.query(values, { topK: Math.max(limit * 4, 10) });
    let scores = new Map<string, number>();
    for (let match of response.matches ?? []) {
      let metadata = match.metadata ?? {};
      let documentId = typeof metadata.documentId === "string" ? metadata.documentId : undefined;
      if (documentId) scores.set(documentId, Math.max(scores.get(documentId) ?? 0, match.score ?? 0));
    }
    return scores;
  }

  async #embedding(text: string[]): Promise<number[][]> {
    let model = this.#env.KNOWLEDGE_EMBEDDING_MODEL ?? "@cf/baai/bge-base-en-v1.5";
    let response = await this.#env.WORKERS_AI!.run(model, { text });
    if (isEmbeddingResponse(response)) return response.data;
    return [];
  }

  #db(): D1Database {
    if (!this.#env.KNOWLEDGE_DB) throw new Error("Missing KNOWLEDGE_DB binding.");
    return this.#env.KNOWLEDGE_DB;
  }

  #r2(): R2Bucket {
    if (!this.#env.KNOWLEDGE_OBJECTS) throw new Error("Missing KNOWLEDGE_OBJECTS binding.");
    return this.#env.KNOWLEDGE_OBJECTS;
  }
}

function requiredText(value: string | undefined, field: string): string {
  let trimmed = value?.trim();
  if (!trimmed) throw new Error(`${field} is required.`);
  return trimmed;
}

function tokenize(query: string): string[] {
  return query.toLowerCase().split(/[^\p{Letter}\p{Number}]+/u).filter(Boolean);
}

function scoreText(terms: string[], content: string, title: string, tags: string[]): number {
  if (terms.length === 0) return 0.1;
  let haystack = `${title}\n${tags.join(" ")}\n${content}`.toLowerCase();
  return terms.reduce((score, term) => score + countOccurrences(haystack, term), 0);
}

function countOccurrences(text: string, term: string): number {
  let count = 0;
  let index = text.indexOf(term);
  while (index >= 0) {
    count += 1;
    index = text.indexOf(term, index + term.length);
  }
  return count;
}

function excerpt(content: string, terms: string[]): string {
  let normalized = content.replace(/\s+/g, " ").trim();
  let lower = normalized.toLowerCase();
  let index = terms.map(term => lower.indexOf(term)).filter(value => value >= 0).at(0) ?? 0;
  let start = Math.max(0, index - 80);
  let end = Math.min(normalized.length, index + 220);
  return `${start > 0 ? "..." : ""}${normalized.slice(start, end)}${end < normalized.length ? "..." : ""}`;
}

function isEmbeddingResponse(value: unknown): value is { data: number[][] } {
  return Boolean(
    value &&
    typeof value === "object" &&
    Array.isArray((value as { data?: unknown }).data) &&
    Array.isArray((value as { data: unknown[] }).data[0]),
  );
}
