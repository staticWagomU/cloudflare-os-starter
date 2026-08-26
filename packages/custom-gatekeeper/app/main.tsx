import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Empty } from "@cloudflare/kumo/components/empty";
import { Input, InputArea } from "@cloudflare/kumo/components/input";
import { Select } from "@cloudflare/kumo/components/select";
import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  DatabaseIcon,
  FileTextIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { RpcTarget, newMessagePortRpcSession } from "capnweb";
import type { RpcStub } from "capnweb";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Principal =
  | { type: "access_email"; id: string }
  | { type: "local_account"; id: string }
  | { type: "identity_user"; id: string }
  | { type: "role"; id: string }
  | { type: "permission"; id: string };

type CollectionSummary = {
  id: string;
  title: string;
  description: string;
  role: "reader" | "editor" | "owner";
  tags: string[];
};

type SearchResult = {
  documentId: string;
  collectionId: string;
  title: string;
  excerpt: string;
  sourceType: string;
  sourceDate?: string;
  tags: string[];
  freshness?: "fresh" | "aging" | "stale" | "evergreen";
  score?: number;
};

type DocumentResult = {
  id: string;
  collectionId: string;
  title: string;
  content: string;
  sourceType: string;
  sourceDate?: string;
  tags: string[];
};

type SourceType = "meeting" | "incident" | "note" | "transcript" | "employee" | "other";
type FreshnessPolicy = "default" | "evergreen" | "time_sensitive";
type SearchFreshness = "prefer_recent" | "include_stale";

interface KnowledgeAdminApi extends RpcTarget {
  listCollections(): Promise<CollectionSummary[]>;
  createCollection(input: {
    title: string;
    description: string;
    readers?: Principal[];
    editors?: Principal[];
    tags?: string[];
  }): Promise<CollectionSummary>;
  addDocument(input: {
    collectionId: string;
    title: string;
    body: string;
    sourceType?: SourceType;
    sourceDate?: string;
    freshnessPolicy?: FreshnessPolicy;
    tags?: string[];
  }): Promise<DocumentResult>;
  search(query: string, options?: {
    collectionId?: string;
    tags?: string[];
    freshness?: SearchFreshness;
    limit?: number;
  }): Promise<SearchResult[]>;
  readDocument(documentId: string): Promise<DocumentResult | null>;
}

interface HostCapability extends RpcTarget {
  readonly ui: RpcStub<KnowledgeAdminApi>;
}

class AppIframe extends RpcTarget {}

const sourceTypeLabels: Record<string, string> = {
  note: "ノート",
  meeting: "会議",
  incident: "障害・インシデント",
  transcript: "文字起こし",
  employee: "社員情報",
  other: "その他",
};

const roleLabels: Record<CollectionSummary["role"], string> = {
  owner: "所有者",
  editor: "編集者",
  reader: "閲覧者",
};

const freshnessLabels: Record<NonNullable<SearchResult["freshness"]>, string> = {
  fresh: "新しい",
  aging: "やや古い",
  stale: "古い",
  evergreen: "常に有効",
};

const freshnessVariants: Record<NonNullable<SearchResult["freshness"]>, "success" | "warning" | "error" | "info"> = {
  fresh: "success",
  aging: "warning",
  stale: "error",
  evergreen: "info",
};

const { port1, port2 } = new MessageChannel();
window.parent.postMessage({ type: "handshake" }, "*", [port2]);
const host = newMessagePortRpcSession<HostCapability>(port1, new AppIframe());
const api = host.ui;

function App() {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<DocumentResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [collectionTitle, setCollectionTitle] = useState("");
  const [collectionDescription, setCollectionDescription] = useState("");
  const [collectionTags, setCollectionTags] = useState("");
  const [collectionReaders, setCollectionReaders] = useState("");
  const [collectionEditors, setCollectionEditors] = useState("");

  const [query, setQuery] = useState("");
  const [searchTags, setSearchTags] = useState("");
  const [searchFreshness, setSearchFreshness] = useState<SearchFreshness>("prefer_recent");

  const [documentCollectionId, setDocumentCollectionId] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("note");
  const [sourceDate, setSourceDate] = useState("");
  const [freshnessPolicy, setFreshnessPolicy] = useState<FreshnessPolicy>("default");
  const [documentTags, setDocumentTags] = useState("");
  const [documentBody, setDocumentBody] = useState("");

  const run = useCallback(async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  const loadCollections = useCallback(async () => {
    await run(async () => {
      const nextCollections = await api.listCollections();
      setCollections(nextCollections);
      setSelectedCollectionId(current => selectAvailableCollection(current, nextCollections));
      setDocumentCollectionId(current => selectAvailableCollection(current, nextCollections));
    });
  }, [run]);

  useEffect(() => {
    void loadCollections();
  }, [loadCollections]);

  const selectedCollection = collections.find(collection => collection.id === selectedCollectionId);
  const collectionItems = useMemo(
    () => Object.fromEntries(collections.map(collection => [collection.id, collection.title])),
    [collections],
  );

  const createCollection = async () => {
    if (!collectionTitle.trim()) {
      setError("コレクション名を入力してください。");
      return;
    }
    await run(async () => {
      const collection = await api.createCollection({
        title: collectionTitle.trim(),
        description: collectionDescription.trim(),
        tags: splitList(collectionTags),
        readers: emailPrincipals(collectionReaders),
        editors: emailPrincipals(collectionEditors),
      });
      const nextCollections = await api.listCollections();
      setCollections(nextCollections);
      setSelectedCollectionId(collection.id);
      setDocumentCollectionId(collection.id);
      setCollectionTitle("");
      setCollectionDescription("");
      setCollectionTags("");
      setCollectionReaders("");
      setCollectionEditors("");
      setNotice(`「${collection.title}」を作成しました。`);
    });
  };

  const addDocument = async () => {
    const targetCollectionId = documentCollectionId || selectedCollectionId;
    if (!targetCollectionId) {
      setError("文書を追加するコレクションを選択してください。");
      return;
    }
    if (!documentTitle.trim()) {
      setError("文書のタイトルを入力してください。");
      return;
    }
    if (!documentBody.trim()) {
      setError("文書の本文を入力してください。");
      return;
    }
    await run(async () => {
      const document = await api.addDocument({
        collectionId: targetCollectionId,
        title: documentTitle.trim(),
        body: documentBody.trim(),
        sourceType,
        sourceDate: sourceDate || undefined,
        freshnessPolicy,
        tags: splitList(documentTags),
      });
      setSelectedDocument(document);
      setDocumentTitle("");
      setSourceDate("");
      setDocumentTags("");
      setDocumentBody("");
      setNotice(`「${document.title}」を追加しました。`);
    });
  };

  const search = async () => {
    if (!query.trim()) {
      setError("検索キーワードを入力してください。");
      return;
    }
    await run(async () => {
      const nextResults = await api.search(query.trim(), {
        collectionId: selectedCollectionId || undefined,
        tags: splitList(searchTags),
        freshness: searchFreshness,
        limit: 12,
      });
      setResults(nextResults);
      setSelectedDocument(null);
      if (!nextResults.length) setNotice("条件に一致する文書はありませんでした。");
    });
  };

  const readDocument = async (documentId: string) => {
    await run(async () => {
      setSelectedDocument(await api.readDocument(documentId));
    });
  };

  const selectCollection = (collectionId: string) => {
    setSelectedCollectionId(collectionId);
    setDocumentCollectionId(collectionId);
    setResults([]);
    setSelectedDocument(null);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="title-block">
          <div className="title-line">
            <h1>コレクション</h1>
            <Badge variant="beta">検証環境</Badge>
          </div>
          <p>閲覧権限のあるコレクションを検索・更新できます。</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<ArrowsClockwiseIcon size={16} />}
          loading={busy}
          onClick={() => void loadCollections()}
        >
          更新
        </Button>
      </header>

      <div className="message-stack" aria-live="polite">
        {error && (
          <Banner
            variant="error"
            size="sm"
            icon={<WarningCircleIcon size={18} />}
            title="処理できませんでした"
            description={error}
          />
        )}
        {notice && (
          <Banner
            size="sm"
            icon={<CheckCircleIcon size={18} />}
            title="完了"
            description={notice}
          />
        )}
      </div>

      <div className="app-layout">
        <aside className="sidebar">
          <section className="panel collection-panel" aria-labelledby="collections-heading">
            <div className="panel-heading">
              <div>
                <p className="section-label">検索範囲</p>
                <h2 id="collections-heading">コレクション</h2>
              </div>
              <Badge variant="secondary">{collections.length}件</Badge>
            </div>
            {collections.length ? (
              <div className="collection-list">
                {collections.map(collection => (
                  <button
                    type="button"
                    className={`collection-item${collection.id === selectedCollectionId ? " is-active" : ""}`}
                    aria-pressed={collection.id === selectedCollectionId}
                    onClick={() => selectCollection(collection.id)}
                    key={collection.id}
                  >
                    <span className="collection-title">{collection.title}</span>
                    <span className="collection-meta">
                      {roleLabels[collection.role]}
                      {collection.tags.length ? ` / ${collection.tags.join(", ")}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                size="sm"
                icon={<DatabaseIcon size={28} />}
                title="コレクションがありません"
                description="下の入力欄から最初のコレクションを作成してください。"
              />
            )}
          </section>

          <section className="panel field-stack" aria-labelledby="create-collection-heading">
            <div className="panel-heading">
              <div>
                <p className="section-label">共有単位</p>
                <h2 id="create-collection-heading">コレクションを作成</h2>
              </div>
            </div>
            <Input label="名前" required value={collectionTitle} onChange={event => setCollectionTitle(event.target.value)} />
            <InputArea label="説明" rows={3} value={collectionDescription} onChange={event => setCollectionDescription(event.target.value)} />
            <Input label="タグ" description="カンマ区切り" placeholder="障害, バックエンド" value={collectionTags} onChange={event => setCollectionTags(event.target.value)} />
            <Input label="閲覧者" description="メールアドレスをカンマ区切り" placeholder="reader@example.com" value={collectionReaders} onChange={event => setCollectionReaders(event.target.value)} />
            <Input label="編集者" description="メールアドレスをカンマ区切り" placeholder="editor@example.com" value={collectionEditors} onChange={event => setCollectionEditors(event.target.value)} />
            <Button type="button" variant="primary" icon={<PlusIcon size={16} />} loading={busy} onClick={() => void createCollection()}>
              作成
            </Button>
          </section>
        </aside>

        <section className="workspace">
          <section className="panel search-panel" aria-labelledby="search-heading">
            <div className="search-context">
              <p className="section-label">{selectedCollection ? "検索対象" : "検索対象なし"}</p>
              <h2 id="search-heading">{selectedCollection?.title ?? "コレクションを選択"}</h2>
            </div>
            <Input
              className="query-input"
              label="検索キーワード"
              required
              placeholder="障害の現状、会議の決定事項、担当者の状況"
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void search();
                }
              }}
            />
            <Input label="タグ" description="カンマ区切り" placeholder="障害" value={searchTags} onChange={event => setSearchTags(event.target.value)} />
            <Select
              label="鮮度"
              value={searchFreshness}
              onValueChange={value => setSearchFreshness(value ?? "prefer_recent")}
              items={{ prefer_recent: "新しい情報を優先", include_stale: "古い情報も含める" }}
            />
            <Button
              type="button"
              variant="primary"
              icon={<MagnifyingGlassIcon size={16} />}
              loading={busy}
              disabled={!selectedCollectionId}
              onClick={() => void search()}
            >
              検索
            </Button>
          </section>

          <div className="content-grid">
            <section className="panel field-stack document-editor" aria-labelledby="add-document-heading">
              <div className="panel-heading">
                <div>
                  <p className="section-label">情報を登録</p>
                  <h2 id="add-document-heading">文書を追加</h2>
                </div>
              </div>
              <Select
                label="コレクション"
                required
                disabled={!collections.length}
                placeholder="コレクションを選択"
                value={documentCollectionId}
                onValueChange={value => setDocumentCollectionId(value ?? "")}
                items={collectionItems}
              />
              <Input label="タイトル" required value={documentTitle} onChange={event => setDocumentTitle(event.target.value)} />
              <div className="field-grid">
                <Select
                  label="情報の種類"
                  value={sourceType}
                  onValueChange={value => setSourceType(value ?? "note")}
                  items={{
                    note: "ノート",
                    meeting: "会議",
                    incident: "障害・インシデント",
                    transcript: "文字起こし",
                    employee: "社員情報",
                    other: "その他",
                  }}
                />
                <Input label="情報の日付" type="date" value={sourceDate} onChange={event => setSourceDate(event.target.value)} />
              </div>
              <Select
                label="鮮度の扱い"
                value={freshnessPolicy}
                onValueChange={value => setFreshnessPolicy(value ?? "default")}
                items={{ default: "標準", time_sensitive: "時間とともに古くなる", evergreen: "常に有効" }}
              />
              <Input label="タグ" description="カンマ区切り" placeholder="会議, 対応事項" value={documentTags} onChange={event => setDocumentTags(event.target.value)} />
              <InputArea label="本文" required rows={11} value={documentBody} onChange={event => setDocumentBody(event.target.value)} />
              <Button
                type="button"
                variant="primary"
                icon={<PlusIcon size={16} />}
                loading={busy}
                disabled={!collections.length}
                onClick={() => void addDocument()}
              >
                追加
              </Button>
            </section>

            <section className="panel results-panel" aria-labelledby="results-heading">
              <div className="panel-heading">
                <div>
                  <p className="section-label">関連度と鮮度で並び替え</p>
                  <h2 id="results-heading">検索結果</h2>
                </div>
                <Badge variant="secondary">{results.length}件</Badge>
              </div>
              {results.length ? (
                <div className="result-list">
                  {results.map(result => (
                    <button
                      type="button"
                      className={`result-item${selectedDocument?.id === result.documentId ? " is-active" : ""}`}
                      onClick={() => void readDocument(result.documentId)}
                      key={result.documentId}
                    >
                      <span className="result-title-row">
                        <strong>{result.title}</strong>
                        {result.freshness && (
                          <Badge variant={freshnessVariants[result.freshness]}>{freshnessLabels[result.freshness]}</Badge>
                        )}
                      </span>
                      <span className="result-meta">
                        {sourceTypeLabel(result.sourceType)}
                        {result.sourceDate ? ` / ${result.sourceDate}` : ""}
                        {typeof result.score === "number" ? ` / 関連度 ${Math.round(result.score * 100)}%` : ""}
                      </span>
                      <span className="result-excerpt">{result.excerpt}</span>
                      {result.tags.length > 0 && <span className="tag-line">{result.tags.join(" / ")}</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <Empty
                  size="sm"
                  icon={<MagnifyingGlassIcon size={28} />}
                  title="検索結果はまだありません"
                  description="コレクションを選び、キーワードを入力して検索してください。"
                />
              )}
            </section>
          </div>

          <article className="panel preview-panel" aria-labelledby="preview-heading">
            <div className="panel-heading">
              <div>
                <p className="section-label">保存された原文</p>
                <h2 id="preview-heading">文書プレビュー</h2>
              </div>
            </div>
            {selectedDocument ? (
              <div className="document-content">
                <div className="document-heading">
                  <div>
                    <h3>{selectedDocument.title}</h3>
                    <p>
                      {sourceTypeLabel(selectedDocument.sourceType)}
                      {selectedDocument.sourceDate ? ` / ${selectedDocument.sourceDate}` : ""}
                    </p>
                  </div>
                  {selectedDocument.tags.length > 0 && <Badge variant="outline">{selectedDocument.tags.join(" / ")}</Badge>}
                </div>
                <pre>{selectedDocument.content}</pre>
              </div>
            ) : (
              <Empty
                size="sm"
                icon={<FileTextIcon size={28} />}
                title="文書が選択されていません"
                description="検索結果を選択すると、保存された本文を確認できます。"
              />
            )}
          </article>
        </section>
      </div>
    </main>
  );
}

function selectAvailableCollection(current: string, collections: CollectionSummary[]): string {
  return current && collections.some(collection => collection.id === current)
    ? current
    : collections[0]?.id ?? "";
}

function splitList(value: string): string[] {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

function emailPrincipals(value: string): Principal[] {
  return splitList(value).map(id => ({ type: "access_email", id: id.toLowerCase() }));
}

function sourceTypeLabel(value: string): string {
  return sourceTypeLabels[value] ?? value;
}

function errorMessage(caught: unknown): string {
  const detail = caught instanceof Error ? caught.message : String(caught);
  return detail ? `処理に失敗しました: ${detail}` : "処理に失敗しました。時間をおいて再度お試しください。";
}

const root = document.getElementById("app");
if (!root) throw new Error("missing #app");
createRoot(root).render(<App />);
