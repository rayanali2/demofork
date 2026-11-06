// Build the test fixtures from hard-coded artwork. This script reads no user files or credentials.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { ffmpeg } from "../src/lib/media";
import { runPipeline } from "../src/lib/pipeline";

async function main() {
  const out = path.resolve("tests/fixtures/sample");
  const directory = await mkdtemp(path.join(tmpdir(), "demofork-sample-"));
  try {
    await mkdir(out, { recursive: true });
    for (let i = 0; i < 3; i++) {
      const titles = ["Your day. Your look.", "A little context. A better outfit.", "Ready for whatever’s next."];
      const subtitle = ["WHAT’S THE PLAN TODAY?", "YOUR PERSONAL WARDROBE", "YOUR LOOK IS READY"];
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#101510"/><rect x="24" y="24" width="200" height="752" rx="18" fill="#1b241a"/><text x="52" y="83" font-size="29" font-family="sans-serif" fill="#d3f86a">wardrobe /</text><text x="52" y="157" font-size="18" font-family="sans-serif" fill="#d3ddcd">Today</text><text x="52" y="207" font-size="18" font-family="sans-serif" fill="#7f9276">My wardrobe</text><text x="52" y="257" font-size="18" font-family="sans-serif" fill="#7f9276">Saved looks</text><text x="278" y="95" font-size="14" letter-spacing="2" font-family="sans-serif" fill="#a2b395">${subtitle[i]}</text><text x="278" y="157" font-size="36" font-family="sans-serif" fill="#f1f4ea">${titles[i]}</text><rect x="278" y="195" width="940" height="72" rx="12" fill="#222f20"/><text x="304" y="239" font-size="21" font-family="sans-serif" fill="#bfcdb5">${["Coffee, a team lunch, and a walk home.", "Comfortable layers. A little character.", "A good fit for a full day."][i]}</text>${[0, 1, 2].map((j) => `<rect x="${278 + j * 320}" y="300" width="300" height="330" rx="14" fill="${["#adbaa1", "#687b5b", "#d1d5be"][j]}"/><path d="M${358+j*320} 390 l35 -22 35 0 35 22 32 70 -38 17 -10 -24 0 107 -75 0 0 -107 -12 24 -35 -17Z" fill="${["#e8e5db", "#253c2b", "#8c624b"][j]}"/><text x="${298+j*320}" y="602" font-size="18" font-family="sans-serif" fill="#182216">${["The everyday shirt", "The easy layer", "Your favorite fit"][j]}</text>`).join("")}<rect x="278" y="676" width="940" height="64" rx="12" fill="#d3f86a"/><text x="748" y="716" text-anchor="middle" font-size="20" font-family="sans-serif" fill="#23321b">${["Build my look", "Try this combination", "Save this look"][i]} →</text></svg>`;
      await sharp(Buffer.from(svg)).png().toFile(path.join(out, `screenshot-${i}.png`));
    }
    await ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=12", "-c:v", "libx264", "-pix_fmt", "yuv420p", "reference.mp4"], directory);
    const reference = new File([new Uint8Array(await readFile(path.join(directory, "reference.mp4")))], "reference.mp4", { type: "video/mp4" });
    const images = await Promise.all([0, 1, 2].map(async index => {
      const name = `screenshot-${index}.png`;
      return new File([new Uint8Array(await readFile(path.join(out, name)))], name, { type: "image/png" });
    }));
    process.env.DEMOFORK_MOTION = "screenshot";
    const result = await runPipeline({
      reference, images, name: "Wardrobe", description: "An outfit planner that picks clothes for your calendar and generates a virtual try-on.",
    }, () => {}, new AbortController().signal);
    await writeFile(path.join(out, "demo.mp4"), result.buffer);
    await ffmpeg(["-ss", "0.85", "-i", "demo.mp4", "-frames:v", "1", "-q:v", "2", "poster.jpg"], out);
    console.log(`Generated a ${result.durationSeconds}s synthetic sample.`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
