import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { ffmpeg } from "./media";

const fontfile = path.join(process.cwd(), "assets/fonts/Roboto-Bold.ttf");
const accent = "#d3f86a";
const beats = ["THE HOOK", "HOW IT WORKS", "THE PAYOFF"];

export function editDimensions(aspect: number) {
  if (aspect < .8) return { width: 720, height: 1280 };
  if (aspect > 1.2) return { width: 1280, height: 720 };
  return { width: 720, height: 720 };
}

function makeText(value: string, size: number, width: number, color: string) {
  const escaped = value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return sharp({ text: {
    text: `<span foreground="${color}">${escaped}</span>`,
    font: `Roboto Bold ${size}`, fontfile, width, rgba: true, spacing: 2,
  } }).png().toBuffer({ resolveWithObject: true });
}

export async function renderScreenshotScene(options: {
  directory: string;
  screenshot: Buffer;
  name: string;
  caption: string;
  duration: number;
  index: number;
  size: ReturnType<typeof editDimensions>;
  signal: AbortSignal;
}) {
  const { directory, screenshot, name, caption, duration, index, size, signal } = options;
  const { width, height } = size;
  const landscape = width > height;
  const margin = landscape ? 72 : 48;
  const captionWidth = width - margin * 2;
  const top = landscape ? 32 : 45;
  const identity = name.trim().replace(/[\p{C}\s]+/gu, " ").slice(0, 36).trim() || "Product demo";
  const [brand, beat] = await Promise.all([
    makeText(identity, 18, width - margin * 2 - 240, "#f1f3e9"),
    makeText(`0${index + 1} / 03   ${beats[index]}`, 14, 220, accent),
  ]);
  let title = await makeText(caption, landscape ? 46 : 43, captionWidth, "#f6f8f0");
  if (title.info.height > 102) title = await makeText(caption, landscape ? 38 : 35, captionWidth, "#f6f8f0");
  const titleTop = top + Math.max(brand.info.height, beat.info.height) + 24;
  const imageTop = titleTop + title.info.height + 30;
  const imageBottom = height - 57;
  const barWidth = (width - margin * 2 - 16) / 3;
  const bars = beats.map((_, i) => `<rect x="${margin + i * (barWidth + 8)}" y="${height - 30}" width="${barWidth}" height="3" rx="1.5" fill="${i === index ? accent : i < index ? "#687a41" : "#333b29"}"/>`).join("");
  const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><radialGradient id="light" cx="${["22%", "72%", "50%"][index]}" cy="75%" r="83%"><stop stop-color="#26351d"/><stop offset="1" stop-color="#10120f"/></radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#light)"/>
    <rect x="${margin}" y="${top + 5}" width="7" height="7" rx="2" fill="${accent}"/>
    ${bars}
  </svg>`);
  const layers: OverlayOptions[] = [
    { input: brand.data, left: margin + 17, top },
    { input: beat.data, left: width - margin - beat.info.width, top: top + 2 },
    { input: title.data, left: margin, top: titleTop },
  ];
  const frame = `frame-${index}.png`;
  await sharp(background).composite(layers).png().toFile(path.join(directory, frame));

  // Fit every screenshot in full. Only the framed layer moves, so UI text stays intact.
  const resized = await sharp(screenshot).resize({
    width: width - margin * 2 - 32, height: imageBottom - imageTop - 24, fit: "inside",
  }).png().toBuffer({ resolveWithObject: true });
  const panelWidth = resized.info.width + 12;
  const panelHeight = resized.info.height + 12;
  const panel = `panel-${index}.png`;
  await sharp({ create: { width: panelWidth, height: panelHeight, channels: 4, background: "#414e36" } })
    .composite([{ input: resized.data, left: 6, top: 6 }]).png().toFile(path.join(directory, panel));

  const x = Math.round((width - panelWidth) / 2);
  const y = Math.round(imageTop + (imageBottom - imageTop - panelHeight) / 2);
  const ease = "pow(1-min(t/0.8,1),3)";
  const offset = [[0, 14], [-24, 0], [16, 10]][index];
  const filter = `[0:v]loop=loop=-1:size=1:start=0,setpts=N/(30*TB)[base];` +
    `[base][1:v]overlay=x='${x}+(${offset[0]})*${ease}':y='${y}+${offset[1]}*${ease}':format=yuv444,fps=30,format=yuv420p[out]`;
  await ffmpeg([
    "-framerate", "30", "-i", frame, "-framerate", "30", "-i", panel, "-filter_complex", filter, "-map", "[out]",
    "-an", "-r", "30", "-frames:v", String(Math.round(duration * 30)), "-c:v", "libx264", "-threads", "2",
    "-preset", "veryfast", "-crf", "20", `cut-${index}.mp4`,
  ], directory, signal);
}
