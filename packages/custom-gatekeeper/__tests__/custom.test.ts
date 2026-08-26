import { describe, expect, it } from "vitest";
import {
  COLLECTION_RESOURCE,
  CustomSessionImpl,
  KnowledgeCollectionSessionImpl,
  describeCustomAccount,
  describeCustomVendor,
} from "../src/custom.js";
import {
  COLLECTION_RESOURCE_URL_PATTERN,
  collectionIdFromResourceUrl,
  collectionResourceUrl,
} from "../src/collection-resource.js";
import {
  CollectionConfiguratorUi,
  collectionMatchesQuery,
} from "../src/collection-configurator.js";
import {
  freshnessLabel,
  freshnessWeight,
  KnowledgeRepository,
  normalizeTags,
} from "../src/knowledge.js";

describe("custom-gatekeeper", () => {
  it("describes an auto-provisioned singleton", () => {
    expect(describeCustomVendor()).toMatchObject({
      displayName: "Collections",
      autoProvisionsAccount: true,
      providesAuth: false,
    });
    expect(describeCustomAccount()).toMatchObject({
      displayName: "Collections",
      singleton: { tsType: "CustomSession" },
      providesUi: { title: "Collections" },
    });
  });

  it("requires an explicit connection for Access email principals", () => {
    expect(describeCustomVendor("access_email")).toMatchObject({
      autoProvisionsAccount: false,
      providesAuth: false,
    });
  });

  it("advertises a collection-scoped resource", () => {
    expect(COLLECTION_RESOURCE).toMatchObject({
      urlPattern: COLLECTION_RESOURCE_URL_PATTERN,
      title: "コレクション",
    });
  });

  it("round-trips canonical collection resource URLs and rejects lookalikes", () => {
    let resourceUrl = collectionResourceUrl("col_1234-abcd");
    expect(resourceUrl).toBe("custom://restricted-knowledge/collections/col_1234-abcd");
    expect(collectionIdFromResourceUrl(resourceUrl)).toBe("col_1234-abcd");
    expect(collectionIdFromResourceUrl(`${resourceUrl}?collectionId=other`)).toBeNull();
    expect(collectionIdFromResourceUrl("custom://other/collections/col_1234-abcd")).toBeNull();
    expect(collectionIdFromResourceUrl("custom://restricted-knowledge/collections/a/b")).toBeNull();
  });

  it("matches collection picker queries against title, description, and tags", () => {
    let collection = {
      title: "障害対応",
      description: "API incident records",
      tags: ["backend", "urgent"],
    };
    expect(collectionMatchesQuery(collection, "障害")).toBe(true);
    expect(collectionMatchesQuery(collection, "api backend")).toBe(true);
    expect(collectionMatchesQuery(collection, "frontend")).toBe(false);
  });

  it("returns only matching collections from the configurator capability", async () => {
    let repository = {
      listCollections() {
        return Promise.resolve([
          { id: "col_one", title: "障害対応", description: "API", role: "owner", tags: ["backend"] },
          { id: "col_two", title: "採用", description: "面談", role: "reader", tags: ["people"] },
        ]);
      },
    } as unknown as KnowledgeRepository;
    let ui = new CollectionConfiguratorUi(repository, { type: "access_email", id: "a@example.com" });

    await expect(ui.listCollections("backend")).resolves.toEqual([{
      value: "custom://restricted-knowledge/collections/col_one",
      title: "障害対応",
      subtitle: "API",
      meta: "backend",
    }]);
  });

  it("keeps collection resource searches and reads inside the selected collection", async () => {
    let searchOptions: unknown;
    let readArguments: unknown[] = [];
    let observations: unknown[] = [];
    let repository = {
      getCollection() {
        return Promise.resolve({
          id: "col_one",
          title: "障害対応",
          description: "",
          role: "reader",
          tags: [],
        });
      },
      search(_principal: unknown, _query: string, options: unknown) {
        searchOptions = options;
        return Promise.resolve([]);
      },
      readDocumentInCollection(...args: unknown[]) {
        readArguments = args;
        return Promise.resolve(null);
      },
    } as unknown as KnowledgeRepository;
    let session = new KnowledgeCollectionSessionImpl(
      {
        authorizeObservation(value: unknown) {
          observations.push(value);
          return Promise.resolve();
        },
      },
      repository,
      { type: "access_email", id: "a@example.com" },
      "col_one",
    );

    await session.search("status", { limit: 5, collectionId: "col_two" } as never);
    expect(searchOptions).toMatchObject({ collectionId: "col_one", limit: 5 });
    await session.readDocument("doc_two");
    expect(readArguments.slice(1)).toEqual(["doc_two", "col_one"]);
    expect(observations).toHaveLength(1);
  });

  it("authorizes the observation before returning deployment information", async () => {
    let observation: unknown;
    let disposed = false;
    const session = new CustomSessionImpl(
      {
        authorizeObservation(value: unknown) {
          observation = value;
          return Promise.resolve();
        },
        [Symbol.dispose]() {
          disposed = true;
        },
      },
      {
        name: "Acme",
        message: "Use the internal handbook.",
        authMode: "local_account",
        storageReady: false,
      },
      new KnowledgeRepository({}),
      { type: "local_account", id: "acct_1" },
    );

    await expect(session.getDeploymentInfo()).resolves.toEqual({
      name: "Acme",
      message: "Use the internal handbook.",
      authMode: "local_account",
      storageReady: false,
    });
    expect(observation).toEqual({
      title: "Read deployment information",
      description: "Read collection deployment diagnostics.",
    });

    session[Symbol.dispose]();
    expect(disposed).toBe(true);
  });

  it("normalizes tags for stable filtering", () => {
    expect(normalizeTags([" Incident ", "#Backend", "backend", "needs review "])).toEqual([
      "backend",
      "incident",
      "needs-review",
    ]);
  });

  it("labels and weights stale information below fresh information", () => {
    const now = new Date("2026-08-25T00:00:00Z");
    expect(freshnessLabel("2026-08-20", "default", now)).toBe("fresh");
    expect(freshnessLabel("2026-01-01", "default", now)).toBe("stale");
    expect(freshnessWeight("2026-01-01", "time_sensitive", now))
      .toBeLessThan(freshnessWeight("2026-08-20", "time_sensitive", now));
    expect(freshnessWeight("2020-01-01", "evergreen", now)).toBe(1);
  });
});
