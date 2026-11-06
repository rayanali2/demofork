// Official REST contracts: docs.magichour.ai/api-reference/{files/generate-asset-upload-urls,video-projects/image-to-video,video-projects/get-video-details}
const API = "https://api.magichour.ai/v1";
export function magicHourAvailable() {
  return process.env.NEXT_PUBLIC_DEMO_MODE !== "true" && Boolean(process.env.MAGIC_HOUR_API_KEY);
}
type Project = { id: string; status: string; error?: { code?: string; message?: string } | null; downloads?: { url: string }[] };
type Transport = typeof fetch;
export class MagicHour {
  constructor(private token: string, private transport: Transport = fetch, private sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))) {
    if (!token) throw new Error("Add MAGIC_HOUR_API_KEY to .env.local and restart the server.");
  }

  private async request<T>(endpoint: string, body?: object): Promise<T> {
    const response = await this.transport(`${API}${endpoint}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(45_000), cache: "no-store",
    });
    if (!response.ok) {
      let code = "unknown";
      try { code = String((await response.json()).code ?? "unknown").replace(/[^a-z_]/gi, "").slice(0, 60); } catch { /* HTTP status is sufficient. */ }
      console.error("[Magic Hour API]", body ? "POST" : "GET", endpoint.split("/")[1], response.status, code);
      if (response.status === 401) throw new Error("Magic Hour rejected the API key. Check .env.local.");
      if (response.status === 402) throw new Error("Magic Hour needs more credits to generate this video.");
      throw new Error(`Magic Hour request failed (${response.status}, ${code}).`);
    }
    return response.json() as Promise<T>;
  }

  async uploadScreenshot(bytes: Buffer) {
    const upload = await this.request<{ items: { upload_url: string; file_path: string }[] }>("/files/upload-urls", { items: [{ type: "image", extension: "png" }] });
    const item = upload.items?.[0];
    if (!item?.upload_url || !item.file_path) throw new Error("Magic Hour didn’t return an upload URL.");
    const response = await this.transport(item.upload_url, { method: "PUT", headers: { "Content-Type": "image/png" }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error("Magic Hour couldn’t upload this screenshot. Try again.");
    return item.file_path;
  }

  async createClip(imagePath: string, motionPrompt: string, duration: number, scene: number) {
    // Exactly one POST. Never retry a creation request whose result may already have incurred a charge.
    const result = await this.request<{ id: string }>("/image-to-video", {
      name: `DemoFork scene ${scene + 1}`,
      model: "ltx-2.5", resolution: "480p", end_seconds: Math.min(4, Math.max(3, Math.ceil(duration))),
      audio: false, assets: { image_file_path: imagePath }, style: { prompt: motionPrompt },
    });
    if (!result.id) throw new Error("Magic Hour didn’t return a project ID. Check your Magic Hour history before retrying.");
    console.info("[Magic Hour created]", { scene: scene + 1, projectId: result.id });
    return result.id;
  }

  async pollClip(id: string, options: { timeoutMs?: number; intervalMs?: number; signal?: AbortSignal } = {}) {
    const deadline = Date.now() + (options.timeoutMs ?? 240_000);
    let consecutiveErrors = 0;
    while (Date.now() < deadline) {
      options.signal?.throwIfAborted();
      let project: Project;
      try { project = await this.request<Project>(`/video-projects/${encodeURIComponent(id)}`); consecutiveErrors = 0; }
      catch (error) {
        if (++consecutiveErrors >= 3 || /API key|credits/.test((error as Error).message)) throw error;
        await this.sleep(options.intervalMs ?? 4000); continue;
      }
      if (project.status === "complete") {
        const url = project.downloads?.[0]?.url;
        if (!url) throw new Error("Magic Hour finished without a downloadable clip.");
        if (new URL(url).protocol !== "https:") throw new Error("Magic Hour returned an unsupported download URL.");
        return url;
      }
      if (["error", "canceled"].includes(project.status)) {
        console.error("[Magic Hour render failed]", { projectId: id, status: project.status, code: project.error?.code });
        throw new Error("Magic Hour couldn’t render this scene.");
      }
      await this.sleep(options.intervalMs ?? 4000);
    }
    console.error("[Magic Hour poll timeout]", { projectId: id });
    throw new Error("Magic Hour is taking too long. The existing project may still finish; check your Magic Hour history before starting again.");
  }

  async downloadClip(url: string) {
    const response = await this.transport(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok || !response.body) throw new Error("Couldn’t download the generated clip from Magic Hour.");
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 60 * 1024 * 1024) { await reader.cancel(); throw new Error("The generated clip exceeded the download limit."); }
      chunks.push(value);
    }
    if (!size) throw new Error("Magic Hour returned an empty clip.");
    return Buffer.concat(chunks);
  }
}
