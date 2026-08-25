import { RpcTarget, newMessagePortRpcSession } from "capnweb";
import type { RpcStub } from "capnweb";

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
    sourceType?: "meeting" | "incident" | "note" | "transcript" | "employee" | "other";
    sourceDate?: string;
    freshnessPolicy?: "default" | "evergreen" | "time_sensitive";
    tags?: string[];
  }): Promise<DocumentResult>;
  search(query: string, options?: {
    collectionId?: string;
    tags?: string[];
    freshness?: "prefer_recent" | "include_stale";
    limit?: number;
  }): Promise<SearchResult[]>;
  readDocument(documentId: string): Promise<DocumentResult | null>;
}

interface HostCapability extends RpcTarget {
  readonly ui: RpcStub<KnowledgeAdminApi>;
}

class AppIframe extends RpcTarget {}

type State = {
  collections: CollectionSummary[];
  selectedCollectionId: string;
  results: SearchResult[];
  selectedDocument: DocumentResult | null;
  busy: boolean;
  notice: string;
  error: string;
};

const state: State = {
  collections: [],
  selectedCollectionId: "",
  results: [],
  selectedDocument: null,
  busy: false,
  notice: "",
  error: "",
};

const { port1, port2 } = new MessageChannel();
window.parent.postMessage({ type: "handshake" }, "*", [port2]);
const host = newMessagePortRpcSession<HostCapability>(port1, new AppIframe());
const api = host.ui;

const root = document.getElementById("app");
if (!root) throw new Error("missing #app");
const appRoot = root;

function render(): void {
  appRoot.innerHTML = `
    <style>${styles}</style>
    <main class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Verification Mode</p>
          <h1>Restricted Knowledge</h1>
        </div>
        <button class="icon-text" data-action="refresh" ${state.busy ? "disabled" : ""}>Refresh</button>
      </header>

      ${state.error ? `<div class="banner error">${escapeHtml(state.error)}</div>` : ""}
      ${state.notice ? `<div class="banner ok">${escapeHtml(state.notice)}</div>` : ""}

      <section class="layout">
        <aside class="rail">
          <div class="panel">
            <div class="panel-head">
              <h2>Collections</h2>
              <span>${state.collections.length}</span>
            </div>
            <div class="collection-list">
              ${renderCollections()}
            </div>
          </div>
          <form class="panel form" data-form="collection">
            <h2>New Collection</h2>
            <label>Title<input name="title" required></label>
            <label>Description<textarea name="description" rows="3"></textarea></label>
            <label>Tags<input name="tags" placeholder="incident, backend"></label>
            <label>Readers<input name="readers" placeholder="reader@example.com"></label>
            <label>Editors<input name="editors" placeholder="editor@example.com"></label>
            <button type="submit" ${state.busy ? "disabled" : ""}>Create</button>
          </form>
        </aside>

        <section class="workspace">
          <form class="panel search" data-form="search">
            <div>
              <h2>Search</h2>
              <p>${escapeHtml(currentCollectionLabel())}</p>
            </div>
            <label class="query">Query<input name="query" required placeholder="障害の現状、MTG決定事項、担当者の状況"></label>
            <label>Tags<input name="tags" placeholder="incident"></label>
            <label>Freshness
              <select name="freshness">
                <option value="prefer_recent">Prefer recent</option>
                <option value="include_stale">Include stale</option>
              </select>
            </label>
            <button type="submit" ${state.busy ? "disabled" : ""}>Search</button>
          </form>

          <div class="split">
            <form class="panel form" data-form="document">
              <h2>Add Document</h2>
              <label>Collection${renderCollectionSelect("collectionId")}</label>
              <label>Title<input name="title" required></label>
              <label>Source type
                <select name="sourceType">
                  <option value="note">note</option>
                  <option value="meeting">meeting</option>
                  <option value="incident">incident</option>
                  <option value="transcript">transcript</option>
                  <option value="employee">employee</option>
                  <option value="other">other</option>
                </select>
              </label>
              <label>Source date<input name="sourceDate" type="date"></label>
              <label>Freshness
                <select name="freshnessPolicy">
                  <option value="default">default</option>
                  <option value="time_sensitive">time_sensitive</option>
                  <option value="evergreen">evergreen</option>
                </select>
              </label>
              <label>Tags<input name="tags" placeholder="meeting, action-item"></label>
              <label>Body<textarea name="body" rows="10" required></textarea></label>
              <button type="submit" ${state.busy || !state.collections.length ? "disabled" : ""}>Add</button>
            </form>

            <div class="panel results">
              <div class="panel-head">
                <h2>Results</h2>
                <span>${state.results.length}</span>
              </div>
              ${renderResults()}
            </div>
          </div>

          <article class="panel document">
            ${renderDocument()}
          </article>
        </section>
      </section>
    </main>
  `;
  bindEvents();
}

function renderCollections(): string {
  if (!state.collections.length) {
    return `<p class="empty">No collections yet.</p>`;
  }
  return state.collections.map(collection => `
    <button class="collection ${collection.id === state.selectedCollectionId ? "active" : ""}"
      data-action="select-collection" data-id="${escapeAttr(collection.id)}">
      <strong>${escapeHtml(collection.title)}</strong>
      <span>${escapeHtml(collection.role)} · ${escapeHtml(collection.tags.join(", ") || "no tags")}</span>
    </button>
  `).join("");
}

function renderCollectionSelect(name: string): string {
  return `
    <select name="${name}" required>
      ${state.collections.map(collection => `
        <option value="${escapeAttr(collection.id)}"
          ${collection.id === state.selectedCollectionId ? "selected" : ""}>
          ${escapeHtml(collection.title)}
        </option>
      `).join("")}
    </select>
  `;
}

function renderResults(): string {
  if (!state.results.length) {
    return `<p class="empty">Run a search to inspect matching documents.</p>`;
  }
  return state.results.map(result => `
    <button class="result" data-action="read-document" data-id="${escapeAttr(result.documentId)}">
      <strong>${escapeHtml(result.title)}</strong>
      <span>${escapeHtml(result.sourceType)}${result.sourceDate ? ` · ${escapeHtml(result.sourceDate)}` : ""}${result.freshness ? ` · ${escapeHtml(result.freshness)}` : ""}</span>
      <p>${escapeHtml(result.excerpt)}</p>
      <small>${escapeHtml(result.tags.join(", ") || "no tags")}</small>
    </button>
  `).join("");
}

function renderDocument(): string {
  if (!state.selectedDocument) {
    return `
      <div class="document-empty">
        <h2>Document Preview</h2>
        <p>Select a search result to read the stored document body.</p>
      </div>
    `;
  }
  return `
    <div class="panel-head">
      <div>
        <h2>${escapeHtml(state.selectedDocument.title)}</h2>
        <p>${escapeHtml(state.selectedDocument.sourceType)}${state.selectedDocument.sourceDate ? ` · ${escapeHtml(state.selectedDocument.sourceDate)}` : ""}</p>
      </div>
      <span>${escapeHtml(state.selectedDocument.tags.join(", ") || "no tags")}</span>
    </div>
    <pre>${escapeHtml(state.selectedDocument.content)}</pre>
  `;
}

function bindEvents(): void {
  appRoot.querySelector('[data-action="refresh"]')?.addEventListener("click", () => {
    void loadCollections();
  });
  appRoot.querySelectorAll<HTMLElement>('[data-action="select-collection"]').forEach(button => {
    button.addEventListener("click", () => {
      state.selectedCollectionId = button.dataset.id ?? "";
      render();
    });
  });
  appRoot.querySelectorAll<HTMLElement>('[data-action="read-document"]').forEach(button => {
    button.addEventListener("click", () => {
      void readDocument(button.dataset.id ?? "");
    });
  });
  appRoot.querySelector<HTMLFormElement>('[data-form="collection"]')?.addEventListener("submit", event => {
    event.preventDefault();
    void createCollection(new FormData(event.currentTarget as HTMLFormElement));
  });
  appRoot.querySelector<HTMLFormElement>('[data-form="document"]')?.addEventListener("submit", event => {
    event.preventDefault();
    void addDocument(new FormData(event.currentTarget as HTMLFormElement));
  });
  appRoot.querySelector<HTMLFormElement>('[data-form="search"]')?.addEventListener("submit", event => {
    event.preventDefault();
    void search(new FormData(event.currentTarget as HTMLFormElement));
  });
}

async function loadCollections(): Promise<void> {
  await run(async () => {
    state.collections = await api.listCollections();
    if (!state.selectedCollectionId || !state.collections.some(c => c.id === state.selectedCollectionId)) {
      state.selectedCollectionId = state.collections[0]?.id ?? "";
    }
  });
}

async function createCollection(data: FormData): Promise<void> {
  await run(async () => {
    let collection = await api.createCollection({
      title: field(data, "title"),
      description: field(data, "description"),
      tags: listField(data, "tags"),
      readers: emailPrincipals(field(data, "readers")),
      editors: emailPrincipals(field(data, "editors")),
    });
    state.collections = await api.listCollections();
    state.selectedCollectionId = collection.id;
    state.notice = `Created ${collection.title}.`;
  });
}

async function addDocument(data: FormData): Promise<void> {
  await run(async () => {
    let document = await api.addDocument({
      collectionId: field(data, "collectionId") || state.selectedCollectionId,
      title: field(data, "title"),
      body: field(data, "body"),
      sourceType: field(data, "sourceType") as "meeting" | "incident" | "note" | "transcript" | "employee" | "other",
      sourceDate: optionalField(data, "sourceDate"),
      freshnessPolicy: field(data, "freshnessPolicy") as "default" | "evergreen" | "time_sensitive",
      tags: listField(data, "tags"),
    });
    state.selectedDocument = document;
    state.notice = `Added ${document.title}.`;
  });
}

async function search(data: FormData): Promise<void> {
  await run(async () => {
    state.results = await api.search(field(data, "query"), {
      collectionId: state.selectedCollectionId || undefined,
      tags: listField(data, "tags"),
      freshness: field(data, "freshness") as "prefer_recent" | "include_stale",
      limit: 12,
    });
    state.selectedDocument = null;
  });
}

async function readDocument(documentId: string): Promise<void> {
  await run(async () => {
    state.selectedDocument = await api.readDocument(documentId);
  });
}

async function run(operation: () => Promise<void>): Promise<void> {
  state.busy = true;
  state.error = "";
  state.notice = "";
  render();
  try {
    await operation();
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.busy = false;
    render();
  }
}

function currentCollectionLabel(): string {
  let collection = state.collections.find(item => item.id === state.selectedCollectionId);
  return collection ? `Scope: ${collection.title}` : "Scope: no collection selected";
}

function field(data: FormData, name: string): string {
  return String(data.get(name) ?? "").trim();
}

function optionalField(data: FormData, name: string): string | undefined {
  return field(data, name) || undefined;
}

function listField(data: FormData, name: string): string[] {
  return field(data, name).split(",").map(value => value.trim()).filter(Boolean);
}

function emailPrincipals(value: string): Principal[] {
  return value.split(",")
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
    .map(id => ({ type: "access_email", id }));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]!));
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

const styles = `
  :root {
    color-scheme: light;
    --ink: #13201c;
    --muted: #66746f;
    --line: #cbd8d2;
    --soft: #eef4f1;
    --panel: #fbfdfb;
    --field: #ffffff;
    --accent: #0f6f5c;
    --accent-strong: #094a3d;
    --warn: #915d00;
    --danger: #a52837;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background:
      linear-gradient(90deg, rgba(19,32,28,0.06) 1px, transparent 1px),
      linear-gradient(0deg, rgba(19,32,28,0.05) 1px, transparent 1px),
      #f6faf8;
    background-size: 28px 28px;
    color: var(--ink);
    font-family: "Avenir Next", "Helvetica Neue", Verdana, sans-serif;
    letter-spacing: 0;
  }
  button, input, textarea, select {
    font: inherit;
    letter-spacing: 0;
  }
  .shell {
    min-height: 100vh;
    padding: 22px;
  }
  .topbar {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
    border-bottom: 2px solid var(--ink);
    padding-bottom: 14px;
  }
  .eyebrow {
    margin: 0 0 2px;
    color: var(--accent);
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
  }
  h1, h2, p { margin: 0; }
  h1 {
    font-size: 28px;
    line-height: 1.1;
  }
  h2 {
    font-size: 15px;
    line-height: 1.2;
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
    gap: 14px;
    align-items: start;
  }
  .rail, .workspace {
    display: grid;
    gap: 14px;
  }
  .workspace {
    grid-template-columns: minmax(0, 1fr);
  }
  .split {
    display: grid;
    grid-template-columns: minmax(300px, 0.85fr) minmax(300px, 1.15fr);
    gap: 14px;
  }
  .panel {
    background: rgba(251,253,251,0.96);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(17, 35, 29, 0.08);
    padding: 14px;
  }
  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 12px;
    margin-bottom: 10px;
  }
  .panel-head span {
    color: var(--muted);
    font-size: 12px;
  }
  .collection-list, .results {
    display: grid;
    gap: 8px;
  }
  .collection, .result {
    width: 100%;
    padding: 10px;
    text-align: left;
    background: var(--field);
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--ink);
    cursor: pointer;
  }
  .collection.active {
    border-color: var(--accent);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .collection strong, .collection span, .result strong, .result span, .result small {
    display: block;
  }
  .collection span, .result span, .result small, .search p, .document p {
    color: var(--muted);
    font-size: 12px;
  }
  .result p {
    margin: 7px 0;
    color: #33413c;
    font-size: 13px;
    line-height: 1.45;
  }
  .form, .search {
    display: grid;
    gap: 10px;
  }
  .search {
    grid-template-columns: minmax(160px, 0.7fr) minmax(220px, 1.4fr) minmax(160px, 0.7fr) minmax(150px, 0.55fr) auto;
    align-items: end;
  }
  label {
    display: grid;
    gap: 4px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
  }
  input, textarea, select {
    width: 100%;
    min-height: 36px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--field);
    color: var(--ink);
    padding: 7px 9px;
  }
  textarea {
    resize: vertical;
    line-height: 1.45;
  }
  button {
    min-height: 36px;
    border: 1px solid var(--accent-strong);
    border-radius: 6px;
    background: var(--accent);
    color: white;
    font-weight: 800;
    cursor: pointer;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .icon-text {
    padding: 0 14px;
  }
  .banner {
    margin-bottom: 12px;
    padding: 10px 12px;
    border-radius: 6px;
    border: 1px solid;
    font-size: 13px;
  }
  .banner.ok {
    color: var(--accent-strong);
    background: #e8f6ef;
    border-color: #9dccbe;
  }
  .banner.error {
    color: var(--danger);
    background: #fff0f2;
    border-color: #e0a9b2;
  }
  .empty, .document-empty p {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.5;
  }
  .document pre {
    overflow: auto;
    max-height: 460px;
    margin: 12px 0 0;
    white-space: pre-wrap;
    color: #16231f;
    background: #f2f6f4;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 12px;
    font: 13px/1.55 "SF Mono", Consolas, monospace;
  }
  @media (max-width: 980px) {
    .layout, .split, .search {
      grid-template-columns: 1fr;
    }
    .shell {
      padding: 14px;
    }
  }
`;

render();
void loadCollections();
