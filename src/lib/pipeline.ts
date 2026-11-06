import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildStoryboard, outputTiming } from "./format";
import { analyzeReference, finishCut, prepareScreenshot, stitchClips } from "./media";
import { editDimensions, renderScreenshotScene } from "./screenshot-edit";
import { MagicHour } from "./magic-hour";
import type { readInputs } from "./request";

export type PipelineInputs = Omit<Awaited<ReturnType<typeof readInputs>>, "captions"> & { captions?: string[] };
export type Emit = (event: Record<string, unknown>) => void;

export async function runPipeline(inputs: PipelineInputs, emit: Emit, signal: AbortSignal) {
  const directory = await mkdtemp(path.join(tmpdir(), "demofork-"));
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const useMagicHour = !demo && process.env.DEMOFORK_MOTION === "magic-hour" && Boolean(process.env.MAGIC_HOUR_API_KEY);
  const progress = (stage: number, message: string) => { signal.throwIfAborted(); emit({ type: "progress", stage, message }); };
  try {
    progress(0, "Analyzing the reference...");
    const analysis = await analyzeReference(Buffer.from(await inputs.reference.arrayBuffer()), directory);
    progress(1, "Breaking down the format...");
    emit({ type: "analysis", analysis });
    // Verify all three images BEFORE creating any billable Magic Hour project.
    const screenshots: Awaited<ReturnType<typeof prepareScreenshot>>[] = [];
    for (let i = 0; i < 3; i++) screenshots.push(await prepareScreenshot(Buffer.from(await inputs.images[i].arrayBuffer()), directory, i));
    progress(2, "Building your version...");
    const storyboard = buildStoryboard(inputs.name, inputs.description);
    if (inputs.captions) {
      storyboard.hook = inputs.captions[0];
      storyboard.scenes.forEach((scene, index) => { scene.caption = inputs.captions![index]; });
    }
    const durations = outputTiming(analysis);
    emit({ type: "storyboard", storyboard });
    const client = useMagicHour ? new MagicHour(process.env.MAGIC_HOUR_API_KEY!) : null;
    const aspect = screenshots[0].width / screenshots[0].height;
    const size = editDimensions(aspect);
    progress(3, useMagicHour ? "Animating your three scenes with Magic Hour..." : "Rendering your three scenes...");
    // Render concurrently to fit Vercel Hobby's five-minute request budget.
    // allSettled ensures no sibling task writes into a directory after cleanup.
    const scenes = await Promise.allSettled([0, 1, 2].map(async i => {
      signal.throwIfAborted();
      emit({ type: "scene", index: i, status: "running" });
      const filename = `scene-${i}.mp4`;
      if (!client) {
        await renderScreenshotScene({ directory, screenshot: screenshots[i].buffer, name: inputs.name,
          caption: storyboard.scenes[i].caption, duration: durations[i], index: i, size, signal });
      } else {
        let projectId: string | undefined;
        try {
          const asset = await client.uploadScreenshot(screenshots[i].buffer);
          signal.throwIfAborted();
          projectId = await client.createClip(asset, storyboard.scenes[i].motionPrompt, durations[i], i);
          // Poll this ID only; neither poll failures nor downloads resubmit generation.
          const output = await client.pollClip(projectId, { signal, timeoutMs: 175_000 });
          signal.throwIfAborted();
          await writeFile(path.join(directory, filename), await client.downloadClip(output));
        } catch (error) {
          const message = (error as Error).message;
          console.error("[DemoFork scene failed]", { scene: i + 1, projectId, message });
          if (/API key|credits|taking too long|existing project|history/.test(message)) throw error;
          throw new Error(`Magic Hour couldn’t generate scene ${i + 1}. Check your Magic Hour history before trying again.`);
        }
      }
      emit({ type: "scene", index: i, status: "complete" });
      return filename;
    }));
    const failed = scenes.find(result => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    const clips = scenes.map(result => (result as PromiseFulfilledResult<string>).value);
    progress(6, "Building the final cut...");
    const result = useMagicHour
      ? await stitchClips(directory, clips, storyboard.scenes.map(scene => scene.caption), durations, aspect)
      : await finishCut(directory, signal);
    signal.throwIfAborted();
    emit({ type: "complete", video: result.buffer.toString("base64"), durationSeconds: result.durationSeconds, demoMode: demo, motion: useMagicHour ? "magic-hour" : "screenshot" });
    return { analysis, storyboard, ...result };
  } finally {
    // Uploads, reference frames, intermediary clips and final file share one disposable directory.
    await rm(directory, { recursive: true, force: true });
  }
}
