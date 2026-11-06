// End-to-end verification: uploads through the hosted client-token route,
// calls the real generation route exactly once, and saves the streamed final MP4 locally.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { upload } from "@vercel/blob/client";
import { inspectVideo } from "../src/lib/media";

async function main() {
  const base = process.argv[2]?.replace(/\/$/, "");
  if (!base || process.argv[3] !== "--real") throw new Error("Usage: node --import tsx scripts/verify-hosted.ts <deployment-url> --real");
  const config = await (await fetch(`${base}/api/config`)).json();
  if (!config.configured || config.uploadMode !== "blob") throw new Error("The deployment needs a private Blob store.");
  const session = crypto.randomUUID();
  const paths: string[] = [];
  try {
    for (let i = 0; i < 4; i++) {
      const source = i === 0 ? "public/sample/demo.mp4" : `public/sample/screenshot-${i - 1}.png`;
      const bytes = await readFile(source);
      const filename = i === 0 ? "reference.mp4" : `screenshot-${i - 1}.png`;
      const pathname = `demofork/${session}/${filename}`;
      paths.push(pathname);
      await upload(pathname, new Blob([new Uint8Array(bytes)]), { access: "private", contentType: i === 0 ? "video/mp4" : "image/png", handleUploadUrl: `${base}/api/upload` });
      console.info("Uploaded", filename, `${bytes.length} bytes`);
    }
    const response = await fetch(`${base}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths, productName: "Wardrobe", description: "An AI wardrobe agent that picks clothes based on your plans and generates a virtual try-on." }), signal: AbortSignal.timeout(310_000) });
    if (!response.ok) throw new Error(`Generation failed: ${response.status} ${await response.text()}`);
    const reader = response.body!.getReader(); let buffer = ""; const decoder = new TextDecoder(); let complete = false;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); if (!line) continue;
        const event = JSON.parse(line);
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "progress") console.info(event.message);
        if (event.type === "scene") console.info(`Scene ${event.index + 1}: ${event.status}`);
        if (event.type === "complete") {
          const bytes = Buffer.from(event.video, "base64");
          await mkdir("examples", { recursive: true });
          await writeFile("examples/hosted-final-demo.mp4", bytes);
          const info = await inspectVideo("hosted-final-demo.mp4", `${process.cwd()}/examples`);
          if (event.motion === "screenshot" && (Math.abs(info.duration - 9) > .1 || info.fps !== 30)) {
            throw new Error(`Unexpected screenshot export timing: ${info.duration}s at ${info.fps} fps.`);
          }
          console.info("HOSTED FLOW VERIFIED", { bytes: bytes.length, ...info, renderer: event.motion });
          complete = true;
        }
      }
    }
    if (!complete) throw new Error("Connection ended without a final MP4.");
  } finally {
    if (paths.length) await fetch(`${base}/api/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "cleanup", paths }) }).catch(() => {});
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
