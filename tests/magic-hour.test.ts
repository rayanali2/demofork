import { test } from "node:test";
import assert from "node:assert/strict";
import { MagicHour } from "../src/lib/magic-hour";

test("one generation POST, then GET-only polling through queued/rendering/complete", async () => {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  let polls = 0;
  const transport = (async (input, options) => {
    const url = String(input); const method = options?.method || "GET";
    calls.push({ method, url, body: options?.body && typeof options.body === "string" ? JSON.parse(options.body) : undefined });
    if (url.endsWith("/files/upload-urls")) return Response.json({ items: [{ upload_url: "https://uploads.example/image.png", file_path: "api-assets/one.png" }] });
    if (method === "PUT") return new Response(null, { status: 200 });
    if (url.endsWith("/image-to-video")) return Response.json({ id: "project-one" });
    polls++;
    return Response.json({ id: "project-one", status: ["queued", "rendering", "complete"][polls - 1], downloads: polls === 3 ? [{ url: "https://outputs.example/one.mp4" }] : [] });
  }) as typeof fetch;
  const client = new MagicHour("test-token", transport, async () => {});
  const asset = await client.uploadScreenshot(Buffer.from("png"));
  const id = await client.createClip(asset, "preserve UI, no new text", 3, 0);
  const url = await client.pollClip(id);
  assert.equal(url, "https://outputs.example/one.mp4");
  assert.equal(calls.filter(c => c.url.endsWith("/image-to-video")).length, 1);
  assert.equal(calls.filter(c => c.url.includes("video-projects")).length, 3);
  assert.ok(calls.filter(c => c.url.includes("video-projects")).every(c => c.method === "GET"));
  assert.deepEqual((calls.find(c => c.url.endsWith("/image-to-video"))!.body as { assets: unknown }).assets, { image_file_path: "api-assets/one.png" });
});
test("transient polling errors reuse the same ID and never recreate", async () => {
  let attempts = 0;
  const client = new MagicHour("test", (async (input, options) => {
    assert.equal(options?.method, "GET"); assert.match(String(input), /video-projects\/existing$/);
    if (++attempts === 1) return Response.json({ code: "unavailable" }, { status: 503 });
    return Response.json({ status: "complete", downloads: [{ url: "https://outputs.example/clip.mp4" }] });
  }) as typeof fetch, async () => {});
  assert.equal(await client.pollClip("existing"), "https://outputs.example/clip.mp4");
  assert.equal(attempts, 2);
});
test("failed creation is never automatically retried", async () => {
  let requests = 0;
  const client = new MagicHour("test", (async () => { requests++; return Response.json({ code: "internal_error" }, { status: 500 }); }) as typeof fetch);
  await assert.rejects(client.createClip("asset", "prompt", 3, 0));
  assert.equal(requests, 1);
});
test("failed render and polling timeout terminate without further generations", async () => {
  const client = new MagicHour("test", (async () => Response.json({ id: "failed", status: "error" })) as typeof fetch);
  await assert.rejects(client.pollClip("failed"), /couldn’t render/);
  await assert.rejects(client.pollClip("timeout", { timeoutMs: 0 }), /taking too long/);
});
test("upload failure is clearly reported and no generation is created", async () => {
  let calls = 0;
  const client = new MagicHour("test", (async () => ++calls === 1 ? Response.json({ items: [{ upload_url: "https://uploads.example/one", file_path: "asset" }] }) : new Response(null, { status: 500 })) as typeof fetch);
  await assert.rejects(client.uploadScreenshot(Buffer.from("png")), /couldn’t upload/);
  assert.equal(calls, 2);
});
