import { test } from "node:test";
import assert from "node:assert/strict";
import { uploadPolicy, validateBlobPaths } from "../src/lib/blob-paths";
import { readBlobInputs, readSmallJson } from "../src/lib/blob-inputs";
import { get, del } from "@vercel/blob";

const prefix = "demofork/12345678-1234-4123-8123-123456789abc/";
const paths = ["reference.mp4", "screenshot-0.png", "screenshot-1.png", "screenshot-2.png"].map(p => prefix + p);
test("Blob paths are fixed roles in a single unguessable session; URLs and traversal are rejected", () => {
  assert.deepEqual(validateBlobPaths(paths), paths);
  for (const value of ["https://example.com/a.mp4", "../private/file", `${prefix}final.mp4`]) assert.throws(() => uploadPolicy(value));
  assert.throws(() => validateBlobPaths([paths[0], paths[1], paths[1], paths[3]]));
  assert.throws(() => validateBlobPaths([paths[0], paths[1].replace("123456789abc", "123456789abd"), paths[2], paths[3]]));
  assert.equal(uploadPolicy(paths[0]).maximumSizeInBytes, 40 * 1024 * 1024);
  assert.equal(uploadPolicy(paths[1]).maximumSizeInBytes, 8 * 1024 * 1024);
});
test("private Blob staging is consumed into four files and deleted before rendering", async () => {
  const removed: string[][] = [];
  const fetchBlob = (async (pathname: string, options: { access: string }) => {
    assert.equal(options.access, "private");
    const policy = uploadPolicy(pathname);
    return { statusCode: 200, blob: { size: 4, contentType: policy.contentType }, stream: new Response("test").body };
  }) as typeof get;
  const remove = (async (p: string | string[]) => { removed.push(p as string[]); }) as typeof del;
  const inputs = await readBlobInputs({ paths, productName: "Demo", description: "A product", motion: "magic-hour" }, fetchBlob, remove);
  assert.equal(inputs.reference.size, 4); assert.equal(inputs.images.length, 3);
  assert.equal(inputs.motion, "magic-hour");
  assert.deepEqual(removed, [paths]);
});
test("failed staging reads still delete all known uploads", async () => {
  let cleaned = false;
  await assert.rejects(readBlobInputs({ paths, productName: "Demo", description: "A product" }, (async () => null) as typeof get, (async () => { cleaned = true; }) as typeof del), /upload is missing/);
  assert.equal(cleaned, true);
});
test("JSON control requests are small and never accept large inline files", async () => {
  await assert.rejects(readSmallJson(new Request("http://localhost", { method: "POST", body: "x".repeat(17000) })), /too large/);
});
