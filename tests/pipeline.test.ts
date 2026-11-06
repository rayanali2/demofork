import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runPipeline } from "../src/lib/pipeline";

test("complete screenshot pipeline analyzes locally, renders three scenes, returns MP4, and cleans uploads", async () => {
  const previous = process.env.NEXT_PUBLIC_DEMO_MODE;
  process.env.NEXT_PUBLIC_DEMO_MODE = "true";
  const before = new Set(await readdir(tmpdir()));
  const events: Record<string, unknown>[] = [];
  try {
    const reference = new File([await readFile("public/sample/demo.mp4")], "reference.mp4", { type: "video/mp4" });
    const images = await Promise.all([0, 1, 2].map(async i => new File([await readFile(`public/sample/screenshot-${i}.png`)], `screen-${i}.png`, { type: "image/png" })));
    const result = await runPipeline({ reference, images, name: "Maker's 50% [demo]: launch", description: "A workflow for makers" }, e => events.push(e), new AbortController().signal);
    assert.equal(result.buffer.subarray(4, 8).toString(), "ftyp");
    assert.ok(Math.abs(result.durationSeconds - 9) < .05);
    assert.deepEqual(events.filter(e => e.type === "progress").map(e => e.stage), [0, 1, 2, 3, 6]);
    assert.equal(events.filter(e => e.type === "scene" && e.status === "complete").length, 3);
    assert.equal(events.filter(e => e.type === "complete").length, 1);
    assert.equal(result.analysis.sceneCount, 3);
    const leaked = (await readdir(tmpdir())).filter(f => f.startsWith("demofork-") && !before.has(f));
    assert.deepEqual(leaked, []);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_DEMO_MODE;
    else process.env.NEXT_PUBLIC_DEMO_MODE = previous;
  }
});
