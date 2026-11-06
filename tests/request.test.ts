import { test } from "node:test";
import assert from "node:assert/strict";
import { readInputs } from "../src/lib/request";
test("multipart reader requires exactly one reference and three screenshots", async () => {
  const form = new FormData();
  form.set("productName", "Wardrobe"); form.set("description", "An outfit planner");
  form.set("reference", new File(["fake"], "demo.mp4", { type: "video/mp4" }));
  for (let i = 0; i < 3; i++) form.append("screenshots", new File(["fake"], `screen-${i}.png`, { type: "image/png" }));
  const inputs = await readInputs(new Request("http://localhost/api/generate", { method: "POST", body: form }));
  assert.equal(inputs.images.length, 3);
  assert.equal(inputs.motion, undefined);
  form.set("motion", "magic-hour");
  assert.equal((await readInputs(new Request("http://localhost/api/generate", { method: "POST", body: form }))).motion, "magic-hour");
  form.set("motion", "unknown");
  await assert.rejects(readInputs(new Request("http://localhost/api/generate", { method: "POST", body: form })), /supported motion/);
  form.append("reference", new File(["extra"], "extra.mp4", { type: "video/mp4" }));
  await assert.rejects(readInputs(new Request("http://localhost/api/generate", { method: "POST", body: form })), /only one/);
});
test("non-multipart and oversized requests fail before parsing", async () => {
  await assert.rejects(readInputs(new Request("http://localhost", { method: "POST", body: "hello" })), /using the form/);
  await assert.rejects(readInputs(new Request("http://localhost", { method: "POST", headers: { "content-length": "100000000" }, body: "hello" })), /too large/);
});
