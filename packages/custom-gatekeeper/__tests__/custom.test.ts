import { describe, expect, it } from "vitest";
import {
  CustomSessionImpl,
  describeCustomAccount,
  describeCustomVendor,
} from "../src/custom.js";
import { verifiedAccessEmail } from "../src/access.js";
import { generateConnectNonce } from "../src/connect.js";
import {
  freshnessLabel,
  freshnessWeight,
  KnowledgeRepository,
  normalizeTags,
} from "../src/knowledge.js";

describe("custom-gatekeeper", () => {
  it("describes an auto-provisioned singleton", () => {
    expect(describeCustomVendor()).toMatchObject({
      displayName: "Restricted Knowledge",
      autoProvisionsAccount: true,
      providesAuth: false,
    });
    expect(describeCustomAccount()).toMatchObject({
      displayName: "Restricted Knowledge",
      singleton: { tsType: "CustomSession" },
      providesUi: { title: "Restricted Knowledge" },
    });
  });

  it("requires an explicit connection for Access email principals", () => {
    expect(describeCustomVendor("access_email")).toMatchObject({
      autoProvisionsAccount: false,
      providesAuth: false,
    });
  });

  it("accepts an email only from verified Access claims", async () => {
    const request = new Request("https://knowledge.example/gatekeeper/custom/connect", {
      headers: { "cf-access-jwt-assertion": "signed-token" },
    });
    const env = {
      CF_ACCESS_AUD: "knowledge-audience",
      CF_ACCESS_ISS: "https://team.cloudflareaccess.com",
    };

    await expect(verifiedAccessEmail(request, env, async () => ({
      email: " Person@Example.com ",
    }))).resolves.toBe("person@example.com");
    await expect(verifiedAccessEmail(request, env, async () => ({
      email: "not-an-email",
    }))).resolves.toBeNull();
    await expect(verifiedAccessEmail(new Request(request.url), env, async () => ({
      email: "person@example.com",
    }))).resolves.toBeNull();
  });

  it("generates URL-safe connection nonces with sufficient entropy", () => {
    const first = generateConnectNonce();
    const second = generateConnectNonce();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
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
      description: "Read Restricted Knowledge deployment diagnostics.",
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
