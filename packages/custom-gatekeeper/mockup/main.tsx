import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Empty } from "@cloudflare/kumo/components/empty";
import { Input, InputArea } from "@cloudflare/kumo/components/input";
import { Select } from "@cloudflare/kumo/components/select";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import {
  ArchiveBoxIcon,
  ArrowLeftIcon,
  CalendarBlankIcon,
  ClockIcon,
  DatabaseIcon,
  FileTextIcon,
  FunnelSimpleIcon,
  GearSixIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TagIcon,
  UsersThreeIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  initialCollections,
  initialDocuments,
  type Freshness,
  type MockCollection,
  type MockDocument,
  type SourceType,
} from "./data";
import "./styles.css";

type View = "search" | "documents";
type FreshnessFilter = "recent" | "all" | "stale";
type Page = "library" | "empty" | "create" | "settings";

const roleLabels: Record<MockCollection["role"], string> = {
  owner: "所有者",
  editor: "編集者",
  reader: "閲覧者",
};

const sourceLabels: Record<SourceType, string> = {
  meeting: "会議",
  incident: "障害・インシデント",
  note: "ノート",
  transcript: "文字起こし",
  employee: "人物情報",
  other: "その他",
};

const freshnessLabels: Record<Freshness, string> = {
  fresh: "新しい",
  aging: "更新を確認",
  stale: "古い情報",
  evergreen: "常に有効",
};

const freshnessVariants: Record<Freshness, "success" | "warning" | "error" | "info"> = {
  fresh: "success",
  aging: "warning",
  stale: "error",
  evergreen: "info",
};

function App() {
  const queryParameters = new URLSearchParams(window.location.search);
  const startsEmpty = queryParameters.get("state") === "empty";
  const startsWithEmptyCollection = queryParameters.get("collection") === "empty";
  const [page, setPage] = useState<Page>(startsEmpty ? "empty" : "library");
  const [collections, setCollections] = useState(startsEmpty ? [] : initialCollections);
  const [documents, setDocuments] = useState(startsEmpty ? [] : initialDocuments);
  const [selectedCollectionId, setSelectedCollectionId] = useState(
    startsEmpty ? "" : startsWithEmptyCollection ? "empty-collection" : initialCollections[0].id,
  );
  const [selectedDocumentId, setSelectedDocumentId] = useState(
    startsEmpty || startsWithEmptyCollection ? "" : initialDocuments[0].id,
  );
  const [collectionQuery, setCollectionQuery] = useState("");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [freshnessFilter, setFreshnessFilter] = useState<FreshnessFilter>("recent");
  const [view, setView] = useState<View>("search");
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const [collectionTitle, setCollectionTitle] = useState("");
  const [collectionDescription, setCollectionDescription] = useState("");
  const [collectionTagsInput, setCollectionTagsInput] = useState("");
  const [collectionReaders, setCollectionReaders] = useState("");
  const [collectionEditors, setCollectionEditors] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentBody, setDocumentBody] = useState("");
  const [documentTags, setDocumentTags] = useState("");
  const [documentSource, setDocumentSource] = useState<SourceType>("note");
  const [documentDate, setDocumentDate] = useState("2026-08-26");

  const selectedCollection = collections.find(collection => collection.id === selectedCollectionId) ?? collections[0] ?? null;
  const collectionDocuments = useMemo(
    () => selectedCollection ? documents.filter(document => document.collectionId === selectedCollection.id) : [],
    [documents, selectedCollection],
  );
  const collectionTags = useMemo(
    () => [...new Set(collectionDocuments.flatMap(document => document.tags))].toSorted((a, b) => a.localeCompare(b, "ja")),
    [collectionDocuments],
  );
  const visibleCollections = collections.filter(collection => {
    const normalized = collectionQuery.trim().toLocaleLowerCase("ja");
    if (!normalized) return true;
    return [collection.title, collection.description, ...collection.tags]
      .join(" ")
      .toLocaleLowerCase("ja")
      .includes(normalized);
  });
  const visibleDocuments = useMemo(() => {
    const normalized = (view === "search" ? submittedQuery : "").trim().toLocaleLowerCase("ja");
    return collectionDocuments
      .filter(document => {
        const matchesQuery = !normalized || [document.title, document.excerpt, document.content, ...document.tags]
          .join(" ")
          .toLocaleLowerCase("ja")
          .includes(normalized);
        const matchesTag = tagFilter === "all" || document.tags.includes(tagFilter);
        const matchesFreshness = freshnessFilter === "all"
          || (freshnessFilter === "recent" && document.freshness !== "stale")
          || (freshnessFilter === "stale" && document.freshness === "stale");
        return matchesQuery && matchesTag && matchesFreshness;
      })
      .toSorted((a, b) => b.score - a.score);
  }, [collectionDocuments, freshnessFilter, submittedQuery, tagFilter, view]);

  const selectedDocument = visibleDocuments.find(document => document.id === selectedDocumentId)
    ?? visibleDocuments[0]
    ?? null;

  const selectCollection = (collectionId: string) => {
    setSelectedCollectionId(collectionId);
    setSelectedDocumentId("");
    setQuery("");
    setSubmittedQuery("");
    setTagFilter("all");
  };

  const runSearch = () => {
    setSubmittedQuery(query.trim());
    setSelectedDocumentId("");
    setView("search");
  };

  const createCollection = () => {
    const title = collectionTitle.trim();
    if (!title) return;
    const id = `collection-${Date.now()}`;
    const next: MockCollection = {
      id,
      title,
      description: collectionDescription.trim() || "説明なし",
      role: "owner",
      tags: splitList(collectionTagsInput),
      readers: splitList(collectionReaders),
      editors: splitList(collectionEditors),
      documentCount: 0,
      memberCount: countMembers(collectionReaders, collectionEditors),
      updatedAt: "たった今",
    };
    setCollections(current => [next, ...current]);
    selectCollection(id);
    setCollectionTitle("");
    setCollectionDescription("");
    setCollectionTagsInput("");
    setCollectionReaders("");
    setCollectionEditors("");
    setPage("library");
    setNotice(`「${title}」を作成しました。`);
  };

  const openCollectionSettings = () => {
    if (!selectedCollection) return;
    setCollectionTitle(selectedCollection.title);
    setCollectionDescription(selectedCollection.description);
    setCollectionTagsInput(selectedCollection.tags.join(", "));
    setCollectionReaders(selectedCollection.readers.join(", "));
    setCollectionEditors(selectedCollection.editors.join(", "));
    setPage("settings");
  };

  const saveCollectionSettings = () => {
    if (!selectedCollection || selectedCollection.role !== "owner") return;
    const title = collectionTitle.trim();
    if (!title) return;
    const readers = splitList(collectionReaders);
    const editors = splitList(collectionEditors);
    setCollections(current => current.map(collection => collection.id === selectedCollection.id
      ? {
          ...collection,
          title,
          description: collectionDescription.trim() || "説明なし",
          tags: splitList(collectionTagsInput),
          readers,
          editors,
          memberCount: countMembers(collectionReaders, collectionEditors),
          updatedAt: "たった今",
        }
      : collection));
    setPage("library");
    setNotice(`「${title}」の設定を更新しました。`);
  };

  const addDocument = () => {
    const title = documentTitle.trim();
    const body = documentBody.trim();
    if (!selectedCollection || !title || !body) return;
    const id = `document-${Date.now()}`;
    const tags = splitList(documentTags);
    const next: MockDocument = {
      id,
      collectionId: selectedCollection.id,
      title,
      excerpt: body.replaceAll("\n", " ").slice(0, 110),
      content: body,
      sourceType: documentSource,
      sourceDate: documentDate,
      tags,
      freshness: "fresh",
      score: 1,
      updatedAt: "たった今",
      author: "自分",
    };
    setDocuments(current => [next, ...current]);
    setCollections(current => current.map(collection => collection.id === selectedCollection.id
      ? { ...collection, documentCount: collection.documentCount + 1, updatedAt: "たった今" }
      : collection));
    setSelectedDocumentId(id);
    setDocumentTitle("");
    setDocumentBody("");
    setDocumentTags("");
    setDocumentDialogOpen(false);
    setView("documents");
    setNotice(`「${title}」を追加しました。`);
  };

  if (page === "create") {
    return (
      <CollectionFormPage
        mode="create"
        canCancel={collections.length > 0}
        canEdit
        title={collectionTitle}
        description={collectionDescription}
        tags={collectionTagsInput}
        readers={collectionReaders}
        editors={collectionEditors}
        onTitleChange={setCollectionTitle}
        onDescriptionChange={setCollectionDescription}
        onTagsChange={setCollectionTagsInput}
        onReadersChange={setCollectionReaders}
        onEditorsChange={setCollectionEditors}
        onCancel={() => setPage(collections.length ? "library" : "empty")}
        onCreate={createCollection}
      />
    );
  }

  if (page === "settings" && selectedCollection) {
    return (
      <CollectionFormPage
        mode="settings"
        canCancel
        canEdit={selectedCollection.role === "owner"}
        title={collectionTitle}
        description={collectionDescription}
        tags={collectionTagsInput}
        readers={collectionReaders}
        editors={collectionEditors}
        onTitleChange={setCollectionTitle}
        onDescriptionChange={setCollectionDescription}
        onTagsChange={setCollectionTagsInput}
        onReadersChange={setCollectionReaders}
        onEditorsChange={setCollectionEditors}
        onCancel={() => setPage("library")}
        onCreate={saveCollectionSettings}
      />
    );
  }

  if (!selectedCollection || page === "empty") {
    return <CollectionEmptyPage onCreate={() => setPage("create")} />;
  }

  return (
    <main className="mock-app">
      <header className="app-header">
        <div className="product-mark" aria-hidden="true"><DatabaseIcon size={18} weight="fill" /></div>
        <div className="product-title">
          <h1>コレクション</h1>
          <Badge variant="beta">UIモック</Badge>
        </div>
        <div className="header-actions">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            shape="square"
            title="コレクションを作成"
            icon={<PlusIcon size={16} />}
            onClick={() => setPage("create")}
          />
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={<FileTextIcon size={16} />}
            onClick={() => setDocumentDialogOpen(true)}
          >
            文書を追加
          </Button>
        </div>
      </header>

      {notice && (
        <div className="notice" aria-live="polite">
          <Banner size="sm" title="完了しました" description={notice} />
        </div>
      )}

      <div className="collection-layout">
        <aside className="collection-sidebar" aria-label="コレクション一覧">
          <div className="sidebar-heading">
            <span>コレクション</span>
            <Badge variant="secondary">{collections.length}</Badge>
          </div>
          <div className="collection-filter">
            <MagnifyingGlassIcon size={15} aria-hidden="true" />
            <input
              aria-label="コレクションを絞り込む"
              placeholder="コレクションを絞り込む"
              value={collectionQuery}
              onChange={event => setCollectionQuery(event.target.value)}
            />
          </div>
          <nav className="collection-list">
            {visibleCollections.map(collection => (
              <button
                type="button"
                className={`collection-row${collection.id === selectedCollection.id ? " is-selected" : ""}`}
                aria-current={collection.id === selectedCollection.id ? "page" : undefined}
                onClick={() => selectCollection(collection.id)}
                key={collection.id}
              >
                <span className="collection-row-main">
                  <strong>{collection.title}</strong>
                  <span>{collection.description}</span>
                </span>
                <span className="collection-row-meta">
                  <span>{collection.documentCount}件</span>
                  <span>{collection.updatedAt}</span>
                </span>
              </button>
            ))}
          </nav>
          <button type="button" className="sidebar-create" onClick={() => setPage("create")}>
            <PlusIcon size={15} />
            新しいコレクション
          </button>
        </aside>

        <section className="collection-workspace">
          <header className="collection-header">
            <div className="collection-heading">
              <div className="collection-icon" aria-hidden="true"><ArchiveBoxIcon size={20} weight="duotone" /></div>
              <div>
                <div className="collection-title-line">
                  <h2>{selectedCollection.title}</h2>
                  <Badge variant="outline">{roleLabels[selectedCollection.role]}</Badge>
                </div>
                <p>{selectedCollection.description}</p>
              </div>
            </div>
            <div className="collection-header-actions">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<GearSixIcon size={15} />}
                onClick={openCollectionSettings}
              >
                設定
              </Button>
              <dl className="collection-stats">
                <div><dt>文書</dt><dd>{selectedCollection.documentCount}</dd></div>
                <div><dt>メンバー</dt><dd>{selectedCollection.memberCount}</dd></div>
                <div><dt>更新</dt><dd>{selectedCollection.updatedAt}</dd></div>
              </dl>
            </div>
          </header>

          <div className="search-toolbar">
            <div className="search-box">
              <MagnifyingGlassIcon size={19} aria-hidden="true" />
              <input
                aria-label="文書を検索"
                placeholder="文書を検索"
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter") runSearch();
                }}
              />
              {query && (
                <button type="button" className="clear-search" aria-label="検索語を消去" onClick={() => setQuery("")}>
                  <XIcon size={14} />
                </button>
              )}
            </div>
            <Select
              aria-label="タグで絞り込む"
              className="toolbar-select"
              value={tagFilter}
              onValueChange={value => setTagFilter(value ?? "all")}
              items={{ all: "すべてのタグ", ...Object.fromEntries(collectionTags.map(tag => [tag, tag])) }}
            />
            <Select
              aria-label="鮮度で絞り込む"
              className="toolbar-select freshness-select"
              value={freshnessFilter}
              onValueChange={value => setFreshnessFilter((value ?? "recent") as FreshnessFilter)}
              items={{ recent: "新しい情報を優先", all: "すべての鮮度", stale: "古い情報のみ" }}
            />
            <Button type="button" variant="primary" size="base" onClick={runSearch}>検索</Button>
          </div>

          <div className="view-bar">
            <Tabs
              variant="underline"
              value={view}
              onValueChange={value => setView(value as View)}
              tabs={[
                { value: "search", label: submittedQuery ? `検索結果 ${visibleDocuments.length}` : "検索" },
                { value: "documents", label: `すべての文書 ${collectionDocuments.length}` },
              ]}
            />
            <div className="filter-summary">
              <FunnelSimpleIcon size={14} />
              {freshnessFilter === "recent" ? "新しい情報を優先" : freshnessFilter === "stale" ? "古い情報のみ" : "鮮度指定なし"}
            </div>
          </div>

          <div className="document-browser">
            <section className="result-pane" aria-label={view === "search" ? "検索結果" : "文書一覧"}>
              <div className="result-heading">
                <span>{view === "search" && submittedQuery ? `「${submittedQuery}」` : selectedCollection.title}</span>
                <span>{visibleDocuments.length}件</span>
              </div>
              {visibleDocuments.length > 0 ? (
                <div className="result-list">
                  {visibleDocuments.map(document => (
                    <button
                      type="button"
                      className={`document-row${selectedDocument?.id === document.id ? " is-selected" : ""}`}
                      onClick={() => setSelectedDocumentId(document.id)}
                      key={document.id}
                    >
                      <span className="document-row-topline">
                        <strong>{document.title}</strong>
                        <Badge variant={freshnessVariants[document.freshness]}>{freshnessLabels[document.freshness]}</Badge>
                      </span>
                      <span className="document-excerpt">{document.excerpt}</span>
                      <span className="document-meta">
                        <span><FileTextIcon size={13} />{sourceLabels[document.sourceType]}</span>
                        <span><CalendarBlankIcon size={13} />{document.sourceDate}</span>
                        <span><ClockIcon size={13} />{document.updatedAt}</span>
                      </span>
                      {document.tags.length > 0 && (
                        <span className="tag-list">
                          {document.tags.map(tag => <span className="tag" key={tag}>{tag}</span>)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <Empty
                  size="sm"
                  icon={<MagnifyingGlassIcon size={28} />}
                  title={collectionDocuments.length ? "一致する文書はありません" : "文書がありません"}
                  description={collectionDocuments.length
                    ? "検索語または絞り込み条件を変更してください。"
                    : "このコレクションに最初の文書を追加します。"}
                  contents={!collectionDocuments.length
                    ? <Button type="button" variant="primary" size="sm" icon={<PlusIcon size={15} />} onClick={() => setDocumentDialogOpen(true)}>文書を追加</Button>
                    : undefined}
                />
              )}
            </section>

            <article className="preview-pane" aria-labelledby="preview-title">
              {selectedDocument ? (
                <>
                  <header className="preview-header">
                    <div>
                      <div className="preview-label">{sourceLabels[selectedDocument.sourceType]}</div>
                      <h3 id="preview-title">{selectedDocument.title}</h3>
                    </div>
                    <Badge variant={freshnessVariants[selectedDocument.freshness]} appearance="dot">
                      {freshnessLabels[selectedDocument.freshness]}
                    </Badge>
                  </header>
                  <div className="preview-byline">
                    <span>{selectedDocument.author}</span>
                    <span>{selectedDocument.sourceDate}</span>
                    {view === "search" && submittedQuery && <span>関連度 {Math.round(selectedDocument.score * 100)}%</span>}
                  </div>
                  <div className="preview-tags">
                    <TagIcon size={14} />
                    {selectedDocument.tags.map(tag => (
                      <button type="button" onClick={() => setTagFilter(tag)} key={tag}>{tag}</button>
                    ))}
                  </div>
                  <div className="document-body">
                    {selectedDocument.content.split("\n").map((line, index) => renderLine(line, index))}
                  </div>
                </>
              ) : (
                <Empty
                  size="sm"
                  icon={<FileTextIcon size={30} />}
                  title="文書が選択されていません"
                  description="左側の一覧から文書を選択してください。"
                />
              )}
            </article>
          </div>
        </section>
      </div>

      <Dialog.Root open={documentDialogOpen} onOpenChange={setDocumentDialogOpen}>
        <Dialog className="mock-dialog document-dialog" size="lg">
          <DialogHeader title="文書を追加" description={selectedCollection.title} onClose={() => setDocumentDialogOpen(false)} />
          <div className="dialog-fields">
            <Input label="タイトル" required placeholder="文書のタイトル" value={documentTitle} onChange={event => setDocumentTitle(event.target.value)} />
            <div className="dialog-grid">
              <Select
                label="情報の種類"
                value={documentSource}
                onValueChange={value => setDocumentSource((value ?? "note") as SourceType)}
                items={sourceLabels}
              />
              <Input label="情報の日付" type="date" value={documentDate} onChange={event => setDocumentDate(event.target.value)} />
            </div>
            <Input label="タグ" description="カンマ区切り" placeholder="認証, 対応中" value={documentTags} onChange={event => setDocumentTags(event.target.value)} />
            <InputArea label="本文" required rows={10} placeholder="保存する内容" value={documentBody} onChange={event => setDocumentBody(event.target.value)} />
          </div>
          <div className="dialog-actions">
            <Button type="button" variant="secondary" onClick={() => setDocumentDialogOpen(false)}>キャンセル</Button>
            <Button type="button" variant="primary" disabled={!documentTitle.trim() || !documentBody.trim()} onClick={addDocument}>追加</Button>
          </div>
        </Dialog>
      </Dialog.Root>
    </main>
  );
}

function CollectionEmptyPage({ onCreate }: { onCreate: () => void }) {
  return (
    <main className="mock-app standalone-page">
      <SimpleHeader />
      <section className="empty-collection-page">
        <Empty
          className="empty-collection-content"
          size="lg"
          icon={<DatabaseIcon size={34} />}
          title="コレクションがありません"
          description="文書を整理する最初のコレクションを作成します。"
          contents={(
            <Button type="button" variant="primary" icon={<PlusIcon size={16} />} onClick={onCreate}>
              コレクションを作成
            </Button>
          )}
        />
      </section>
    </main>
  );
}

function CollectionFormPage({
  mode,
  canCancel,
  canEdit,
  title,
  description,
  tags,
  readers,
  editors,
  onTitleChange,
  onDescriptionChange,
  onTagsChange,
  onReadersChange,
  onEditorsChange,
  onCancel,
  onCreate,
}: {
  mode: "create" | "settings";
  canCancel: boolean;
  canEdit: boolean;
  title: string;
  description: string;
  tags: string;
  readers: string;
  editors: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onTagsChange: (value: string) => void;
  onReadersChange: (value: string) => void;
  onEditorsChange: (value: string) => void;
  onCancel: () => void;
  onCreate: () => void;
}) {
  const isSettings = mode === "settings";
  return (
    <main className="mock-app standalone-page">
      <SimpleHeader />
      <section className="create-collection-page">
        <header className="create-page-heading">
          {canCancel && (
            <Button type="button" variant="ghost" shape="square" size="sm" title="戻る" icon={<ArrowLeftIcon size={17} />} onClick={onCancel} />
          )}
          <div>
            <h2>{isSettings ? "コレクション設定" : "コレクションを作成"}</h2>
            <p>{isSettings ? "基本情報とアクセス権を確認・変更します。" : "文書の整理と共有に使う単位を設定します。"}</p>
          </div>
        </header>
        {isSettings && !canEdit && (
          <div className="settings-readonly" role="status">
            <UsersThreeIcon size={18} />
            <div><strong>参照のみ</strong><span>コレクション設定を変更できるのは所有者だけです。</span></div>
          </div>
        )}
        <div className="create-page-body">
          <section className="create-section" aria-labelledby="collection-basic-heading">
            <div className="create-section-heading">
              <span>1</span>
              <div><h3 id="collection-basic-heading">基本情報</h3><p>一覧と検索範囲に表示されます。</p></div>
            </div>
            <div className="create-fields">
              <Input disabled={!canEdit} label="名前" required placeholder="例: プロダクト運用" value={title} onChange={event => onTitleChange(event.target.value)} />
              <InputArea disabled={!canEdit} label="説明" rows={3} placeholder="このコレクションで扱う情報" value={description} onChange={event => onDescriptionChange(event.target.value)} />
              <Input disabled={!canEdit} label="タグ" description="カンマ区切り" placeholder="運用, 障害対応" value={tags} onChange={event => onTagsChange(event.target.value)} />
            </div>
          </section>
          <section className="create-section" aria-labelledby="collection-access-heading">
            <div className="create-section-heading">
              <span>2</span>
              <div><h3 id="collection-access-heading">アクセス権</h3><p>自分は所有者として登録されます。</p></div>
            </div>
            <div className="create-fields">
              <Input disabled={!canEdit} label="閲覧者" description="メールアドレスをカンマ区切り" placeholder="reader@example.com" value={readers} onChange={event => onReadersChange(event.target.value)} />
              <Input disabled={!canEdit} label="編集者" description="メールアドレスをカンマ区切り" placeholder="editor@example.com" value={editors} onChange={event => onEditorsChange(event.target.value)} />
              <div className="permission-preview">
                <UsersThreeIcon size={18} />
                <div>
                  <strong>所有者 1名</strong>
                  <span>{isSettings ? "所有者だけがアクセス権を変更できます。" : "作成後もアクセス権を変更できます。"}</span>
                </div>
              </div>
            </div>
          </section>
        </div>
        <footer className="create-page-actions">
          {canCancel && <Button type="button" variant="secondary" onClick={onCancel}>{isSettings ? "戻る" : "キャンセル"}</Button>}
          {canEdit && <Button type="button" variant="primary" disabled={!title.trim()} onClick={onCreate}>{isSettings ? "変更を保存" : "作成"}</Button>}
        </footer>
      </section>
    </main>
  );
}

function SimpleHeader() {
  return (
    <header className="app-header">
      <div className="product-mark" aria-hidden="true"><DatabaseIcon size={18} weight="fill" /></div>
      <div className="product-title"><h1>コレクション</h1><Badge variant="beta">UIモック</Badge></div>
    </header>
  );
}

function DialogHeader({ title, description, onClose }: { title: string; description: string; onClose: () => void }) {
  return (
    <header className="dialog-header">
      <div>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Description>{description}</Dialog.Description>
      </div>
      <Button type="button" variant="ghost" shape="square" size="sm" title="閉じる" icon={<XIcon size={16} />} onClick={onClose} />
    </header>
  );
}

function renderLine(line: string, index: number) {
  if (line.startsWith("## ")) return <h4 key={index}>{line.slice(3)}</h4>;
  if (line.startsWith("- ")) return <p className="bullet-line" key={index}>{line.slice(2)}</p>;
  if (/^\d+\. /.test(line)) return <p className="number-line" key={index}>{line}</p>;
  if (!line) return <span className="body-space" aria-hidden="true" key={index} />;
  return <p key={index}>{line}</p>;
}

function splitList(value: string): string[] {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

function countMembers(readers: string, editors: string): number {
  return 1 + new Set([...splitList(readers), ...splitList(editors)]).size;
}

const root = document.getElementById("app");
if (!root) throw new Error("missing #app");
createRoot(root).render(<App />);
