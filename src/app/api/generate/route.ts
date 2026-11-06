import { readInputs } from "@/lib/request";
import { runPipeline } from "@/lib/pipeline";
import { blobConfigured, readBlobInputs, readSmallJson } from "@/lib/blob-inputs";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  let inputs;
  try {
    if (request.headers.get("content-type")?.startsWith("application/json")) {
      if (!blobConfigured()) throw new Error("Connect a private Vercel Blob store before uploading on Vercel.");
      inputs = await readBlobInputs(await readSmallJson(request));
    } else inputs = await readInputs(request);
  }
  catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let connected = true;
      const emit = (event: Record<string, unknown>) => {
        if (connected) { try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { connected = false; abort.abort(); } }
      };
      // Keep the response streaming during long provider renders; these events do not move UI progress.
      const heartbeat = setInterval(() => emit({ type: "heartbeat" }), 15_000);
      try { await runPipeline(inputs, emit, abort.signal); }
      catch (error) {
        console.error("[DemoFork pipeline]", (error as Error).message);
        if (!abort.signal.aborted) emit({ type: "error", message: (error as Error).message || "Couldn’t build your demo. Try again." });
      } finally {
        clearInterval(heartbeat);
        if (connected) { try { controller.close(); } catch { /* Client already disconnected. */ } }
      }
    },
    cancel() { abort.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff" } });
}
