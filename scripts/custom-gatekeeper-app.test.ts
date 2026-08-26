import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../packages/custom-gatekeeper/app/main.ts", import.meta.url),
  "utf8",
);

test("custom Gatekeeper UI does not submit forms from its sandbox", () => {
  assert.doesNotMatch(appSource, /<\/?form\b/i);
  assert.doesNotMatch(appSource, /addEventListener\(["']submit["']/);
});
