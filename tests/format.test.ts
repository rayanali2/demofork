import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStoryboard, normalizeFormat, outputTiming, purposes, wordCount } from "../src/lib/format";
import { MAX_IMAGE_BYTES, MAX_REFERENCE_BYTES, validateDuration, validateInputs, validateUpload } from "../src/lib/validation";

test("every supported reference produces three ordered beats with bounded, conserved timing", () => {
  for (let duration = 3; duration <= 30; duration += .1) {
    const analysis = normalizeFormat(duration);
    assert.equal(analysis.sceneCount, 3);
    assert.deepEqual(analysis.scenes.map(s => s.purpose), [...purposes]);
    assert.ok(Math.abs(analysis.scenes.reduce((sum, s) => sum + s.durationSeconds, 0) - duration) < .02);
    analysis.scenes.forEach(s => assert.ok(s.durationSeconds >= 1 && s.durationSeconds <= 12.1));
    const cut = outputTiming(analysis);
    cut.forEach(d => assert.ok(d >= 2 && d <= 4.01));
    assert.ok(cut.reduce((a, b) => a + b) >= 8.99 && cut.reduce((a, b) => a + b) <= 12.01);
  }
});
test("timing and pacing use documented duration boundaries", () => {
  assert.deepEqual(normalizeFormat(12).scenes.map(s => s.durationSeconds), [3, 4.8, 4.2]);
  assert.equal(normalizeFormat(10).pacing, "fast");
  assert.equal(normalizeFormat(10.1).pacing, "medium");
  assert.equal(normalizeFormat(20).pacing, "medium");
  assert.equal(normalizeFormat(20.1).pacing, "slow");
});
test("local storyboards are deterministic, original templates and always three short captions", () => {
  for (const name of ["Wardrobe", "a ".repeat(40), "OneVeryLongName".repeat(5), "O'Brien: 50% [Launch]", "服の計画"]) {
    for (const description of ["Plans clothes around your day", "A calendar for tasks", "A product for makers"]) {
      const board = buildStoryboard(name, description);
      assert.equal(board.scenes.length, 3);
      assert.deepEqual(board, buildStoryboard(name, description));
      board.scenes.forEach(s => { assert.ok(wordCount(s.caption) <= 10); assert.match(s.motionPrompt, /no new text/); });
    }
  }
});
const reference = { name: "reference.mov", type: "video/quicktime", size: 100 };
const image = { name: "screen.png", type: "image/png", size: 100 };
test("uploads reject missing, unsupported, empty, oversized, and wrong-count assets", () => {
  assert.doesNotThrow(() => validateInputs(reference, [image, image, image], "Demo", "A tool"));
  assert.throws(() => validateInputs(null, [image, image, image], "Demo", "A tool"), /reference/);
  assert.throws(() => validateInputs(reference, [image, null, image], "Demo", "A tool"), /3 product/);
  assert.throws(() => validateInputs(reference, [image, image], "Demo", "A tool"), /3 product/);
  assert.throws(() => validateInputs(reference, [image, image, image, image], "Demo", "A tool"), /3 product/);
  assert.throws(() => validateInputs(reference, [image, image, image], "Demo", " "), /what your product/);
  assert.throws(() => validateUpload({ ...image, size: 0 }, "image"), /empty/);
  assert.throws(() => validateUpload({ ...image, name: "bad.svg" }, "image"), /JPG or PNG/);
  assert.throws(() => validateUpload({ ...image, type: "image/gif" }, "image"), /JPG or PNG/);
  assert.throws(() => validateUpload({ ...image, size: MAX_IMAGE_BYTES + 1 }, "image"), /8 MB/);
  assert.throws(() => validateUpload({ ...reference, size: MAX_REFERENCE_BYTES + 1 }, "reference"), /40 MB/);
  assert.throws(() => validateUpload({ ...reference, name: "ref.webm" }, "reference"), /MP4 or MOV/);
  [0, NaN, Infinity, 31, 2].forEach(d => assert.throws(() => validateDuration(d)));
});
