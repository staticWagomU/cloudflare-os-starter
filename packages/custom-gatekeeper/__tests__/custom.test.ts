import { describe, expect, it } from "vitest";
import {
  CustomSessionImpl,
  describeCustomAccount,
  describeCustomVendor,
} from "../src/custom.js";
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
