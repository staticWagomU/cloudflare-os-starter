export type CollectionRole = "owner" | "editor" | "reader";
export type Freshness = "fresh" | "aging" | "stale" | "evergreen";
export type FreshnessPolicy = "decay" | "no_decay";

export type MockCollection = {
  id: string;
  title: string;
  description: string;
  role: CollectionRole;
  readers: string[];
  editors: string[];
  documentCount: number;
  memberCount: number;
  updatedAt: string;
};

export type MockDocument = {
  id: string;
  collectionId: string;
  title: string;
  excerpt: string;
  content: string;
  sourceDate: string;
  tags: string[];
  freshnessPolicy: FreshnessPolicy;
  freshness: Freshness;
  score: number;
  updatedAt: string;
  author: string;
};

export const initialCollections: MockCollection[] = [
  {
    id: "product-ops",
    title: "プロダクト運用",
    description: "障害対応、運用手順、週次ミーティングの記録",
    role: "owner",
    readers: ["support@example.com", "sales@example.com", "qa@example.com", "viewer@example.com"],
    editors: ["ops@example.com", "developer@example.com"],
    documentCount: 18,
    memberCount: 7,
    updatedAt: "12分前",
  },
  {
    id: "customer-projects",
    title: "顧客プロジェクト",
    description: "プロジェクトごとの決定事項と進行状況",
    role: "editor",
    readers: ["project-viewers@example.com"],
    editors: ["project-editors@example.com"],
    documentCount: 31,
    memberCount: 3,
    updatedAt: "昨日",
  },
  {
    id: "people-ops",
    title: "採用・オンボーディング",
    description: "採用面談、入社準備、オンボーディング資料",
    role: "reader",
    readers: ["members@example.com"],
    editors: ["people-ops@example.com"],
    documentCount: 24,
    memberCount: 3,
    updatedAt: "3日前",
  },
  {
    id: "research",
    title: "リサーチ資料",
    description: "市場調査、技術検証、参考資料の要約",
    role: "editor",
    readers: ["research-viewers@example.com"],
    editors: ["researchers@example.com"],
    documentCount: 42,
    memberCount: 3,
    updatedAt: "8月20日",
  },
  {
    id: "empty-collection",
    title: "プロジェクト準備",
    description: "これから文書を追加する新しいコレクション",
    role: "owner",
    readers: [],
    editors: [],
    documentCount: 0,
    memberCount: 1,
    updatedAt: "たった今",
  },
];

export const initialDocuments: MockDocument[] = [
  {
    id: "auth-incident-update",
    collectionId: "product-ops",
    title: "認証エラーの対応状況",
    excerpt: "Cloudflare Access経由の一部リクエストで401が発生。Audience設定の差異を修正し、現在は監視を継続しています。",
    content: `## 現状

Cloudflare Access経由の一部リクエストで401が発生していました。原因は検証環境と本番環境でAudience設定が異なっていたことです。

## 対応

- 本番WorkerのAudience設定をAccess Applicationと一致させた
- 認証済みユーザー3名で再現しないことを確認した
- 24時間はエラーログを重点監視する

## 次の確認

8月27日 10:00に監視結果を確認し、問題がなければ対応完了とします。`,
    sourceDate: "2026-08-26",
    tags: ["認証", "Cloudflare", "対応中"],
    freshnessPolicy: "decay",
    freshness: "fresh",
    score: 0.96,
    updatedAt: "12分前",
    author: "林 透和",
  },
  {
    id: "weekly-decisions",
    collectionId: "product-ops",
    title: "8月26日 運用定例の決定事項",
    excerpt: "検索結果の鮮度表示、Collection単位の権限確認、障害記録テンプレートの見直しについて合意しました。",
    content: `## 決定事項

1. 検索結果には情報の日付と鮮度を表示する
2. Collectionを切り替えるたびに閲覧権限を再確認する
3. 障害記録には現状、対応、次回確認日時を必須項目として持たせる

## 担当

- UIモックアップ: 林
- 権限テスト: 開発チーム
- テンプレート整理: 運用チーム`,
    sourceDate: "2026-08-26",
    tags: ["定例", "決定事項"],
    freshnessPolicy: "decay",
    freshness: "fresh",
    score: 0.91,
    updatedAt: "34分前",
    author: "山田 真紀",
  },
  {
    id: "access-runbook",
    collectionId: "product-ops",
    title: "Cloudflare Access 設定確認手順",
    excerpt: "Team domain、Application Audience、許可ポリシーを順番に照合するための運用手順です。",
    content: `## 確認順序

1. Access Applicationの対象ドメインを確認
2. Team domainとJWT issuerが一致していることを確認
3. Application AudienceをWorker設定と照合
4. 許可ポリシーの対象ユーザーでログイン
5. 対象外ユーザーが拒否されることを確認

設定値そのものはこの文書に保存せず、Cloudflare Dashboardを正本とします。`,
    sourceDate: "2026-08-18",
    tags: ["認証", "手順", "Cloudflare"],
    freshnessPolicy: "no_decay",
    freshness: "evergreen",
    score: 0.86,
    updatedAt: "8日前",
    author: "開発チーム",
  },
  {
    id: "old-deploy-note",
    collectionId: "product-ops",
    title: "旧デプロイ手順メモ",
    excerpt: "初期検証時に利用していたworkers.dev向けの手順。現在のカスタムドメイン構成とは異なります。",
    content: `この手順は初期検証用です。

現在はカスタムドメインとCloudflare Accessを利用しているため、この文書のデプロイ先や認証設定をそのまま利用しないでください。`,
    sourceDate: "2026-06-02",
    tags: ["デプロイ", "旧手順"],
    freshnessPolicy: "decay",
    freshness: "stale",
    score: 0.52,
    updatedAt: "2か月前",
    author: "開発チーム",
  },
  {
    id: "project-a-status",
    collectionId: "customer-projects",
    title: "A社プロジェクト 週次状況",
    excerpt: "データ移行の検証は完了。顧客確認を待って本番移行日を確定します。",
    content: "データ移行の検証は完了しました。残件は顧客側の最終確認と本番移行日の確定です。",
    sourceDate: "2026-08-25",
    tags: ["A社", "進行状況"],
    freshnessPolicy: "decay",
    freshness: "fresh",
    score: 0.93,
    updatedAt: "昨日",
    author: "佐藤 健",
  },
  {
    id: "onboarding-checklist",
    collectionId: "people-ops",
    title: "エンジニア入社初週チェックリスト",
    excerpt: "アカウント発行、端末設定、開発環境、担当メンターとの面談を初週に確認します。",
    content: "アカウント発行、端末設定、開発環境、担当メンターとの面談を確認します。",
    sourceDate: "2026-07-10",
    tags: ["入社", "チェックリスト"],
    freshnessPolicy: "no_decay",
    freshness: "evergreen",
    score: 0.88,
    updatedAt: "7月10日",
    author: "人事チーム",
  },
  {
    id: "vector-search-notes",
    collectionId: "research",
    title: "ベクトル検索の評価メモ",
    excerpt: "メタデータによる事前絞り込みと、日付を考慮した再ランキングを組み合わせた評価結果です。",
    content: "Collection IDによる事前絞り込み後に、関連度と鮮度を使って再ランキングしました。",
    sourceDate: "2026-08-20",
    tags: ["検索", "Vectorize", "評価"],
    freshnessPolicy: "decay",
    freshness: "fresh",
    score: 0.89,
    updatedAt: "6日前",
    author: "技術検証チーム",
  },
];
