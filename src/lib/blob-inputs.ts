import { del, get } from "@vercel/blob";
import { uploadPolicy, validateBlobPaths } from "./blob-paths";
import { readMotion, validateInputs, validateUpload } from "./validation";
import { readCaptions } from "./format";

export const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export async function cleanupBlobs(paths: string[], remove = del) {
  if (!paths.length) return;
  validateBlobPaths(paths, false);
  try { await remove(paths); }
  catch { console.error("[DemoFork] Temporary Blob cleanup failed; remove abandoned demofork/ uploads in the Vercel Storage dashboard."); }
}

export async function readBlobInputs(data: { paths?: unknown; productName?: unknown; description?: unknown; captions?: unknown; motion?: unknown }, fetchBlob = get, removeBlob = del) {
  const paths = validateBlobPaths(data.paths);
  try {
    if (typeof data.productName !== "string" || typeof data.description !== "string") throw new Error("Add your product name and description.");
    const captions = readCaptions(data.captions);
    const motion = readMotion(data.motion);
    const files = new Map<string, File>();
    for (const pathname of paths) {
      const policy = uploadPolicy(pathname);
      const blob = await fetchBlob(pathname, { access: "private", useCache: false, abortSignal: AbortSignal.timeout(60_000) });
      if (!blob || blob.statusCode !== 200) throw new Error("A temporary upload is missing. Choose your files and try again.");
      validateUpload({ name: policy.filename, size: blob.blob.size, type: blob.blob.contentType }, policy.role === "reference" ? "reference" : "image");
      const reader = blob.stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length;
        if (size > policy.maximumSizeInBytes) { await reader.cancel(); throw new Error("This upload exceeded the file size limit."); }
        chunks.push(value);
      }
      const bytes = Buffer.concat(chunks);
      files.set(policy.role, new File([new Uint8Array(bytes)], policy.filename, { type: policy.contentType }));
    }
    const reference = files.get("reference")!;
    const images = [0, 1, 2].map(i => files.get(`screenshot-${i}`)!);
    validateInputs(reference, images, data.productName, data.description);
    return { reference, images, name: data.productName.trim(), description: data.description.trim(), captions, motion };
  } finally {
    // The provider receives only in-memory product images. Cloud staging is removed before paid rendering.
    await cleanupBlobs(paths, removeBlob);
  }
}

export async function readSmallJson(request: Request) {
  if (!request.body) throw new Error("Missing request body.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 16_384) { await reader.cancel(); throw new Error("Request is too large."); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
