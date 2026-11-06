// Explicit manual verification only. Never run by npm test; consumes exactly three Magic Hour generations across both phases.
import { loadEnvFile } from "node:process";
import { mkdir, readFile, writeFile, access, copyFile } from "node:fs/promises";
import path from "node:path";
import { MagicHour } from "../src/lib/magic-hour";
import { buildStoryboard, normalizeFormat, outputTiming } from "../src/lib/format";
import { ffmpeg, analyzeReference, stitchClips } from "../src/lib/media";
async function main() {
loadEnvFile(".env.local");
const directory = path.resolve("/private/tmp/demofork-verification");
await mkdir(directory, { recursive: true });
const board = buildStoryboard("Wardrobe", "An AI wardrobe agent that picks clothes based on your plans and generates a virtual try-on.");
const timings = outputTiming(normalizeFormat(12));
const mh = new MagicHour(process.env.MAGIC_HOUR_API_KEY!);
const phase = process.argv[2] || "one";
for (let i = 0; i < 3; i++) {
  await copyFile(`public/sample/screenshot-${i}.png`, path.join(directory, `screenshot-${i}.png`));
}
if (phase === "one") {
  const receipt = path.join(directory, "project-0.txt");
  let id: string;
  try { id = (await readFile(receipt, "utf8")).trim(); console.info("Resuming existing scene 1:", id); }
  catch { const asset = await mh.uploadScreenshot(await readFile(path.join(directory, "screenshot-0.png"))); id = await mh.createClip(asset, board.scenes[0].motionPrompt, timings[0], 0); await writeFile(receipt, id); }
  const url = await mh.pollClip(id);
  await writeFile(path.join(directory, "scene-0.mp4"), await mh.downloadClip(url));
  console.info("ONE REAL GENERATION COMPLETE:", id);
} else if (phase === "finish") {
  await access(path.join(directory, "scene-0.mp4"));
  for (let i = 1; i < 3; i++) {
    const receipt = path.join(directory, `project-${i}.txt`);
    let id: string;
    try { id = (await readFile(receipt, "utf8")).trim(); }
    catch { const asset = await mh.uploadScreenshot(await readFile(path.join(directory, `screenshot-${i}.png`))); id = await mh.createClip(asset, board.scenes[i].motionPrompt, timings[i], i); await writeFile(receipt, id); }
    const url = await mh.pollClip(id);
    await writeFile(path.join(directory, `scene-${i}.mp4`), await mh.downloadClip(url));
    console.info(`REAL SCENE ${i + 1} COMPLETE:`, id);
  }
  await ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=12", "-c:v", "libx264", "-pix_fmt", "yuv420p", "reference.mp4"], directory);
  const analysis = await analyzeReference(await readFile(path.join(directory, "reference.mp4")), directory);
  const result = await stitchClips(directory, ["scene-0.mp4", "scene-1.mp4", "scene-2.mp4"], board.scenes.map(s => s.caption), outputTiming(analysis), 1.6);
  await writeFile(path.join(directory, "verification.json"), JSON.stringify({ analysis, storyboard: board, outputDuration: result.durationSeconds, outputBytes: result.buffer.length }, null, 2));
  console.info("REAL PIPELINE COMPLETE", { duration: result.durationSeconds, bytes: result.buffer.length, output: path.join(directory, "final-demo.mp4") });
}
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
