import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { blobConfigured, cleanupBlobs, readSmallJson } from "@/lib/blob-inputs";
import { uploadPolicy, validateBlobPaths } from "@/lib/blob-paths";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!blobConfigured()) return Response.json({ error: "Connect a private Vercel Blob store to this project first." }, { status: 503 });
  try {
    const body = await readSmallJson(request);
    if (body.type === "cleanup") {
      await cleanupBlobs(validateBlobPaths(body.paths, false));
      return Response.json({ ok: true });
    }
    const result = await handleUpload({
      body: body as HandleUploadBody,
      request,
      onBeforeGenerateToken: async pathname => {
        const policy = uploadPolicy(pathname);
        return {
          allowedContentTypes: [policy.contentType], maximumSizeInBytes: policy.maximumSizeInBytes,
          validUntil: Date.now() + 10 * 60_000,
          addRandomSuffix: false, allowOverwrite: false, cacheControlMaxAge: 60,
        };
      },
    });
    return Response.json(result);
  } catch (error) {
    console.error("[DemoFork upload]", (error as Error).name);
    return Response.json({ error: "Couldn’t upload these files. Check that a private Blob store is connected, then try again." }, { status: 400 });
  }
}
