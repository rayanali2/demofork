import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import sharp from "sharp";
import { normalizeFormat, type Analysis } from "./format";
import { validateDuration } from "./validation";

const execute = promisify(execFile);
process.env.FONTCONFIG_FILE ??= path.join(process.cwd(), "assets/fonts/fonts.conf");
export async function ffmpeg(args: string[], cwd: string, signal?: AbortSignal) {
  if (!ffmpegPath) throw new Error("ffmpeg is unavailable on this platform.");
  try {
    await execute(ffmpegPath, ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-filter_threads", "1", "-filter_complex_threads", "1", ...args], { cwd, timeout: 120_000, maxBuffer: 2 * 1024 * 1024, signal });
  } catch (error) {
    const detail = error as Error & { stderr?: string };
    console.error("[ffmpeg]", detail.stderr?.slice(-2500) || detail.message);
    throw new Error("Couldn’t build the final video. Check the server’s ffmpeg installation.");
  }
}

export async function inspectVideo(file: string, cwd: string) {
  const { stdout } = await execute(ffprobe.path, ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_format", "-show_streams", "-of", "json", file], { cwd, timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
  const info = JSON.parse(stdout);
  const stream = info.streams?.find((s: { codec_type: string; disposition?: { attached_pic?: number } }) => s.codec_type === "video" && !s.disposition?.attached_pic);
  if (!stream || !stream.width || !stream.height) throw new Error("No video stream found.");
  const [numerator, denominator] = String(stream.avg_frame_rate || "30/1").split("/").map(Number);
  return { duration: Number(info.format?.duration || stream.duration), width: Number(stream.width), height: Number(stream.height), fps: numerator / (denominator || 1) || 30 };
}

export async function analyzeReference(bytes: Buffer, directory: string): Promise<Analysis> {
  try {
    // MP4/MOV containers must have an ftyp atom. Metadata alone is not trusted.
    if (!bytes.subarray(0, 64).includes(Buffer.from("ftyp"))) throw new Error("Unsupported container.");
    await writeFile(path.join(directory, "reference.mp4"), bytes);
    const video = await inspectVideo("reference.mp4", directory);
    validateDuration(video.duration);
    if (video.width > 8192 || video.height > 8192) throw new Error("Reference resolution is too large.");
    const analysis = normalizeFormat(video.duration, { width: video.width, height: video.height, fps: video.fps });
    // These five thumbnails are local debugging artifacts only. Never uploaded to Magic Hour.
    for (const [i, fraction] of [0, .25, .5, .75, 1].entries()) {
      const time = Math.min(video.duration * fraction, Math.max(0, video.duration - .25));
      await ffmpeg(["-ss", String(time), "-protocol_whitelist", "file,pipe", "-i", "reference.mp4", "-frames:v", "1", "-vf", "scale=320:-2", `reference-frame-${i}.jpg`], directory);
    }
    return analysis;
  } catch (error) {
    console.error("[reference analysis]", (error as Error).message);
    if ((error as Error).message.includes("between 3 and 30")) throw error;
    throw new Error("Couldn’t analyze this demo. Try another MP4 or MOV clip.");
  }
}

export async function prepareScreenshot(bytes: Buffer, directory: string, index: number) {
  try {
    const image = sharp(bytes, { limitInputPixels: 30_000_000, animated: false });
    const info = await image.metadata();
    if (!["jpeg", "png"].includes(info.format ?? "") || (info.pages ?? 1) > 1 || !info.width || !info.height || Math.min(info.width, info.height) < 64) throw new Error("Invalid image.");
    const filename = `screenshot-${index}.png`;
    // Decode, auto-orient, strip metadata and bound upload dimensions before leaving the server.
    const { data: buffer, info: oriented } = await image.rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).flatten({ background: "#141610" }).png().toBuffer({ resolveWithObject: true });
    await writeFile(path.join(directory, filename), buffer);
    return { buffer, filename, width: oriented.width, height: oriented.height };
  } catch {
    throw new Error(`Screenshot ${index + 1} isn’t a valid JPG or PNG. Use an image at least 64 pixels wide and tall.`);
  }
}

function wrapCaption(text: string, maxCharacters: number) {
  const words = text.replace(/[\r\n]/g, " ").split(/\s+/);
  const lines = [""];
  for (const word of words) {
    // Long product names also need a bounded line length.
    for (const chunk of word.match(new RegExp(`.{1,${maxCharacters}}`, "gu")) ?? []) {
      const i = lines.length - 1;
      if (lines[i].length + chunk.length + 1 > maxCharacters && lines[i]) lines.push(chunk);
      else lines[i] += `${lines[i] ? " " : ""}${chunk}`;
    }
  }
  return lines;
}

export async function stitchClips(directory: string, clips: string[], captions: string[], durations: number[], aspect: number) {
  if (clips.length !== 3 || captions.length !== 3 || durations.length !== 3) throw new Error("Expected exactly three scenes.");
  const [width, height] = aspect < .8 ? [720, 1280] : aspect > 1.2 ? [1280, 720] : [720, 720];
  for (let i = 0; i < 3; i++) {
    const lines = wrapCaption(captions[i], width > 800 ? 60 : 34);
    // Linux ffmpeg-static omits drawtext. Rasterize local wording with the bundled
    // font, then use ffmpeg's portable overlay filter to burn it into each scene.
    const escaped = lines.join("\n").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const caption = await sharp({ text: { text: `<span foreground="white">${escaped}</span>`, font: "Roboto Bold 32", fontfile: path.join(process.cwd(), "assets/fonts/Roboto-Bold.ttf"), rgba: true, width: width - 70, align: "centre", spacing: 5 } }).png().toBuffer({ resolveWithObject: true });
    await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: caption.data, left: Math.floor((width - caption.info.width) / 2), top: 22 }]).png().toFile(path.join(directory, `caption-${i}.png`));
    const bandHeight = Math.max(110, caption.info.height + 40);
    const contentHeight = height - bandHeight - 20;
    const filter = `[0:v]scale=${width - 40}:${contentHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:${bandHeight}+((${contentHeight}-ih)/2):color=0x10130d,setsar=1,fps=30[base];[base][1:v]overlay=0:0:format=auto,format=yuv420p[out]`;
    await ffmpeg(["-protocol_whitelist", "file,pipe", "-i", clips[i], "-loop", "1", "-i", `caption-${i}.png`, "-filter_complex", filter, "-map", "[out]", "-an", "-t", String(durations[i]), "-c:v", "libx264", "-threads", "2", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `cut-${i}.mp4`], directory);
  }
  return finishCut(directory);
}

export async function finishCut(directory: string, signal?: AbortSignal) {
  await writeFile(path.join(directory, "concat.txt"), "file 'cut-0.mp4'\nfile 'cut-1.mp4'\nfile 'cut-2.mp4'\n");
  await ffmpeg(["-f", "concat", "-safe", "1", "-i", "concat.txt", "-c", "copy", "-movflags", "+faststart", "final-demo.mp4"], directory, signal);
  return { buffer: await readFile(path.join(directory, "final-demo.mp4")), durationSeconds: (await inspectVideo("final-demo.mp4", directory)).duration };
}
