import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { analyzeReference, ffmpeg, prepareScreenshot } from "../src/lib/media";

test("real ffmpeg inspection extracts metadata and exactly five local frames", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "demofork-test-"));
  try {
    await ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "fixture.mp4"], directory);
    const analysis = await analyzeReference(await readFile(path.join(directory, "fixture.mp4")), directory);
    assert.equal(analysis.durationSeconds, 6);
    assert.equal(analysis.width, 640); assert.equal(analysis.height, 360); assert.equal(analysis.fps, 24);
    assert.equal((await readdir(directory)).filter(f => f.startsWith("reference-frame-")).length, 5);
    await assert.rejects(analyzeReference(Buffer.from("not a video"), directory), /Couldn’t analyze/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("image bytes are decoded server-side and corrupt or disguised images fail", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "demofork-test-"));
  try {
    const bytes = await sharp({ create: { width: 640, height: 360, channels: 3, background: "#aabbcc" } }).png().toBuffer();
    const image = await prepareScreenshot(bytes, directory, 0);
    assert.equal(image.width, 640);
    await assert.rejects(prepareScreenshot(Buffer.from("not an image"), directory, 1), /Screenshot 2/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
