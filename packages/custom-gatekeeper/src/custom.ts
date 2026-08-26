import {
  DurableObject,
  RpcStub as NativeRpcStub,
  RpcTarget,
  WorkerEntrypoint,
} from "cloudflare:workers";
import { RpcStub } from "capnweb";
import { skipRpcValidation, validateRpc } from "capnweb-validate";
import type {
  AccountDescription,
  AppUiContext,
  ApprovalQueue,
  Gatekeeper,
  GatekeeperConnectCallback,
  GatekeeperConnectOptions,
  GatekeeperUiFrame,
  GatekeeperUser,
  GatekeeperUserVerifier,
  ResourceConfiguratorFrame,
  ResourceDescription,
  SupportedResource,
  VendorDescription,
} from "@gadgets/workshop-shared/gatekeeper";
import {
  KnowledgeRepository,
  storageReady,
} from "./knowledge.js";
import { generateConnectNonce } from "./connect.js";
import type {
  CustomDeploymentInfo,
  CustomSession,
  KnowledgeCollectionInput,
  KnowledgeCollectionSummary,
  KnowledgeDocument,
  KnowledgeDocumentInput,
  KnowledgePrincipal,
  KnowledgeSearchResult,
} from "./types.js";
import TYPES_CODE from "./types-code.js";
import APP_HTML from "./generated/app.txt";

const CUSTOM_ICON = {
  url:
    "data:image/svg+xml," +
    encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='none' stroke='currentColor' stroke-width='20'><path d='M52 72h152v112H52z'/><path d='m52 88 76 52 76-52'/></svg>",
    ),
};

type ObservationQueue = Pick<ApprovalQueue, "authorizeObservation"> &
  Partial<{ [Symbol.dispose](): void }>;

type CustomAccountProps = {
  accountId: string;
  principal: KnowledgePrincipal;
};

const KNOWLEDGE_RESOURCE: SupportedResource = {
  urlPattern: "custom://restricted-knowledge",
  title: "Collections",
  description: "Permission-scoped collections with freshness-aware search.",
  icon: CUSTOM_ICON,
};

export function describeCustomVendor(
  authMode: Cloudflare.Env["AUTH_MODE"] = "local_account",
): VendorDescription {
  return {
    displayName: "Collections",
    url: "https://github.com/cloudflare/cloudflare-os-starter",
    logo: CUSTOM_ICON,
    color: "#eef8f5",
    tagline: "Search and maintain permission-scoped collections",
    description:
      "A verification-mode Gatekeeper for collections, documents, tags, and freshness-aware search.",
    autoProvisionsAccount: authMode === "local_account",
    providesAuth: false,
  };
}

export function describeCustomAccount(): AccountDescription {
  return {
    displayName: "Collections",
    avatar: CUSTOM_ICON,
    singleton: { tsType: "CustomSession" },
    providesUi: { title: "Collections", icon: CUSTOM_ICON },
  };
}

@validateRpc()
export class CustomSessionImpl extends RpcTarget implements CustomSession {
  readonly #approvalQueue: ObservationQueue;
  readonly #info: CustomDeploymentInfo;
  readonly #repository: KnowledgeRepository;
  readonly #principal: KnowledgePrincipal;

  constructor(
    approvalQueue: ObservationQueue,
    info: CustomDeploymentInfo,
    repository: KnowledgeRepository,
    principal: KnowledgePrincipal,
  ) {
    super();
    this.#approvalQueue = approvalQueue;
    this.#info = info;
    this.#repository = repository;
    this.#principal = principal;
  }

  async getDeploymentInfo(): Promise<CustomDeploymentInfo> {
    await this.#approvalQueue.authorizeObservation({
      title: "Read deployment information",
      description: "Read collection deployment diagnostics.",
    });
    return this.#info;
  }

  async listCollections(): Promise<KnowledgeCollectionSummary[]> {
    let collections = await this.#repository.listCollections(this.#principal);
    await this.#approvalQueue.authorizeObservation({
      title: "List collections",
      description: `Listed ${collections.length} collection(s) visible to the current principal.`,
      prohibitAllSharing: true,
    });
    return collections;
  }

  async createCollection(input: KnowledgeCollectionInput): Promise<KnowledgeCollectionSummary> {
    return this.#repository.createCollection(this.#principal, input);
  }

  async search(
    query: string,
    options?: {
      collectionId?: string;
      tags?: string[];
      from?: string;
      to?: string;
      freshness?: "prefer_recent" | "include_stale";
      limit?: number;
    },
  ): Promise<KnowledgeSearchResult[]> {
    let results = await this.#repository.search(this.#principal, query, options);
    await this.#approvalQueue.authorizeObservation({
      title: "Search restricted knowledge",
      description: `Searched restricted knowledge and returned ${results.length} result(s).`,
      prohibitAllSharing: true,
    });
    return results;
  }

  async readDocument(documentId: string): Promise<KnowledgeDocument | null> {
    let document = await this.#repository.readDocument(this.#principal, documentId);
    if (document) {
      await this.#approvalQueue.authorizeObservation({
        title: `Read restricted document: ${document.title}`,
        description: `Read document ${document.id} from collection ${document.collectionId}.`,
        prohibitAllSharing: true,
      });
    }
    return document;
  }

  async addDocument(input: KnowledgeDocumentInput): Promise<KnowledgeDocument> {
    return this.#repository.addDocument(this.#principal, input);
  }

  [Symbol.dispose](): void {
    this.#approvalQueue[Symbol.dispose]?.();
  }
}

@validateRpc()
export class KnowledgeAdminUi extends RpcTarget {
  readonly #repository: KnowledgeRepository;
  readonly #principal: KnowledgePrincipal;

  constructor(repository: KnowledgeRepository, principal: KnowledgePrincipal) {
    super();
    this.#repository = repository;
    this.#principal = principal;
  }

  listCollections(): Promise<KnowledgeCollectionSummary[]> {
    return this.#repository.listCollections(this.#principal);
  }

  createCollection(input: KnowledgeCollectionInput): Promise<KnowledgeCollectionSummary> {
    return this.#repository.createCollection(this.#principal, input);
  }

  addDocument(input: KnowledgeDocumentInput): Promise<KnowledgeDocument> {
    return this.#repository.addDocument(this.#principal, input);
  }

  search(query: string, options?: Parameters<CustomSession["search"]>[1]):
      Promise<KnowledgeSearchResult[]> {
    return this.#repository.search(this.#principal, query, options);
  }

  readDocument(documentId: string): Promise<KnowledgeDocument | null> {
    return this.#repository.readDocument(this.#principal, documentId);
  }
}

@validateRpc()
export class CustomGatekeeper
  extends DurableObject<Cloudflare.Env, CustomAccountProps>
  implements Gatekeeper<CustomSession> {
  async describe(): Promise<ResourceDescription> {
    return {
      url: "custom://restricted-knowledge",
      title: "Collections",
      snippet: "Search and maintain permission-scoped collections.",
      suggestedBindingName: "KNOWLEDGE",
      tsType: "CustomSession",
    };
  }

  async getTypeScriptTypes(): Promise<string> {
    return TYPES_CODE;
  }

  async getAutoApprovableActions(): Promise<[]> {
    return [];
  }

  async startSession(approvalQueue: NativeRpcStub<ApprovalQueue>): Promise<CustomSession> {
    return new CustomSessionImpl(approvalQueue.dup(), {
      name: this.env.CUSTOM_NAME,
      message: this.env.CUSTOM_MESSAGE,
      authMode: this.env.AUTH_MODE ?? "local_account",
      storageReady: storageReady(this.env),
    }, new KnowledgeRepository(this.env), this.ctx.props.principal);
  }

  async addObserver(_id: string, _user: Fetcher<GatekeeperUserVerifier>): Promise<void> {
    throw new Error("Collection observations are not shareable in verification mode.");
  }
  async removeObserver(_id: string): Promise<void> {}

  async applyAction(action: number): Promise<void> {
    throw new Error(`Collections has no queued actions (${action}) in verification mode.`);
  }

  async rejectAction(_action: number): Promise<void> {}

  async revertAction(_action: number): Promise<void> {
    throw new Error("Collections has no queued actions to revert in verification mode.");
  }
}

@validateRpc()
export class CustomAccount
  extends WorkerEntrypoint<Cloudflare.Env, CustomAccountProps>
  implements GatekeeperUser {
  async describe(): Promise<AccountDescription> {
    return describeCustomAccount();
  }

  async getSingletonGatekeeperClass(): Promise<DurableObjectClass<Gatekeeper<CustomSession>>> {
    return this.ctx.exports.CustomGatekeeper({ props: this.ctx.props });
  }

  async startAppUi(_context: AppUiContext): Promise<GatekeeperUiFrame> {
    return {
      iframeHtml: APP_HTML,
      ui: new RpcStub(new KnowledgeAdminUi(
        new KnowledgeRepository(this.env),
        this.ctx.props.principal,
      )),
    };
  }

  async getSupportedResources(): Promise<SupportedResource[]> {
    return [];
  }

  getGatekeeperClassFor(_url: string): never {
    throw new Error("Custom Gatekeeper has no URL-addressed resources.");
  }

  startResourceConfigurator(_resourceUrlPattern: string): Promise<ResourceConfiguratorFrame> {
    throw new Error("Custom Gatekeeper has no URL-addressed resources.");
  }

  async ensureResources(_resourceUrlPatterns: string[]): Promise<{ url?: string }> {
    return {};
  }

  async revoke(): Promise<void> {}

  reconnect(): Promise<{ url: string }> {
    throw new Error("Collections is auto-provisioned and has no credentials to reconnect.");
  }

  async getAuthenticatedEmail(): Promise<string | null> {
    return this.ctx.props.principal.type === "access_email" ? this.ctx.props.principal.id : null;
  }

  @skipRpcValidation()
  async getVerifier(): Promise<Fetcher<GatekeeperUserVerifier>> {
    return this.ctx.exports.CustomVerifier({ props: this.ctx.props });
  }
}

@validateRpc()
export class CustomVerifier
  extends WorkerEntrypoint<Cloudflare.Env, CustomAccountProps>
  implements GatekeeperUserVerifier {
  verify(): void {}
}

@validateRpc()
export class GatekeeperVendor extends WorkerEntrypoint<Cloudflare.Env> {
  async describe(): Promise<VendorDescription> {
    return describeCustomVendor(this.env.AUTH_MODE);
  }

  @skipRpcValidation()
  async createAccount(): Promise<Fetcher<GatekeeperUser>> {
    if ((this.env.AUTH_MODE ?? "local_account") !== "local_account") {
      throw new Error("Collections requires a verified Access connection.");
    }
    let accountId = crypto.randomUUID();
    return this.ctx.exports.CustomAccount({
      props: {
        accountId,
        principal: { type: "local_account", id: accountId },
      },
    });
  }

  async connectAccount(
    callback: Fetcher<GatekeeperConnectCallback>,
    _options?: GatekeeperConnectOptions,
  ): Promise<{ url: string }> {
    if (this.env.AUTH_MODE !== "access_email") {
      throw new Error("Collections is auto-provisioned in local verification mode.");
    }
    if (!this.env.BASE_URL) {
      throw new Error("Collections BASE_URL is not configured.");
    }

    const objectId = this.env.ACCESS_CONNECT.newUniqueId();
    const nonce = generateConnectNonce();
    await this.env.ACCESS_CONNECT.get(objectId).prepare(callback, nonce);
    return {
      url: `${this.env.BASE_URL.replace(/\/$/, "")}/${objectId.toString()}/${nonce}`,
    };
  }

  async getSupportedResources(_options?: { userId?: string }): Promise<SupportedResource[]> {
    return [KNOWLEDGE_RESOURCE];
  }

  async getTypeScriptTypes(): Promise<string> {
    return TYPES_CODE;
  }
}
