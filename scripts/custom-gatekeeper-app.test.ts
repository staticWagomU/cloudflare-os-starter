import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../packages/custom-gatekeeper/app/main.tsx", import.meta.url),
  "utf8",
);

test("custom Gatekeeper UI does not submit forms from its sandbox", () => {
  assert.doesNotMatch(appSource, /<\/?form\b/i);
  assert.doesNotMatch(appSource, /addEventListener\(["']submit["']/);
});

test("custom Gatekeeper UI is localized for Japanese operators", () => {
  assert.match(appSource, /社内ナレッジ/);
  assert.match(appSource, /コレクションを作成/);
  assert.match(appSource, /文書を追加/);
});
