export const purposes = ["hook", "explanation", "payoff"] as const;
export type Purpose = typeof purposes[number];
export type Analysis = {
  durationSeconds: number; width: number; height: number; fps: number;
  pacing: "fast" | "medium" | "slow"; sceneCount: 3; payoffPosition: "late";
  formatSummary: string;
  scenes: { purpose: Purpose; durationSeconds: number }[];
};
export type Storyboard = { hook: string; scenes: { caption: string; motionPrompt: string }[] };
export const wordCount = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length;

function splitDuration(duration: number, weights: number[], minimum: number, maximum: number) {
  const values = weights.map(weight => Math.min(maximum, Math.max(minimum, duration * weight)));
  // Redistribute only the clamping difference so the three beats still sum to the total.
  for (let pass = 0; pass < 3; pass++) {
    const difference = duration - values.reduce((a, b) => a + b, 0);
    const eligible = values.map((value, i) => ({ value, i })).filter(({ value }) => difference > 0 ? value < maximum : value > minimum);
    if (Math.abs(difference) < 0.0001 || !eligible.length) break;
    eligible.forEach(({ i }) => { values[i] = Math.min(maximum, Math.max(minimum, values[i] + difference / eligible.length)); });
  }
  const first = Math.round(values[0] * 100) / 100;
  const second = Math.round(values[1] * 100) / 100;
  return [first, second, Math.round((duration - first - second) * 100) / 100];
}

export function normalizeFormat(durationSeconds: number, metadata = { width: 1280, height: 720, fps: 30 }): Analysis {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 3 || durationSeconds > 30.1) throw new Error("Reference must be 3–30 seconds.");
  const duration = Math.round(durationSeconds * 100) / 100;
  const weights = duration <= 9 ? [.3, .35, .35] : duration <= 18 ? [.25, .4, .35] : [.2, .4, .4];
  const timing = splitDuration(duration, weights, 1, 12.1);
  return {
    durationSeconds: duration, ...metadata,
    pacing: duration <= 10 ? "fast" : duration <= 20 ? "medium" : "slow",
    sceneCount: 3, payoffPosition: "late",
    formatSummary: duration <= 9 ? "Quick opening, compact explanation, final payoff" : duration <= 18 ? "Fast opening, short explanation, final payoff" : "Brief opening, longer explanation, extended final payoff",
    scenes: purposes.map((purpose, i) => ({ purpose, durationSeconds: timing[i] })),
  };
}

// Compress long references and extend tiny ones into a launch cut, preserving beat order and proportions.
export function outputTiming(analysis: Analysis) {
  const total = Math.min(11.5, Math.max(9, analysis.durationSeconds * .8));
  return splitDuration(total, analysis.scenes.map(s => s.durationSeconds / analysis.durationSeconds), 2, 4);
}

const motions = [
  "Subtle camera push-in on this product interface, clean product demo motion, preserve UI readability, no new text",
  "Smooth controlled pan across this product screenshot, slight depth and motion, preserve the original interface, no new text",
  "Polished reveal motion, gentle zoom out then settle, emphasize the final result, preserve UI details, no new text",
];

export function buildStoryboard(productName: string, description: string): Storyboard {
  const name = cleanCopy(productName).split(/\s+/u).slice(0, 4).join(" ").slice(0, 42).trim() || "your product";
  const copy = cleanCopy(description);
  let captions = [`Meet ${name}`, "See how it works", "See the finished result"];
  if (/\b(wardrobe|clothes|outfit|try.on)\b/i.test(copy)) {
    captions = ["An outfit for whatever’s on your calendar", "Tell it what your day looks like", "Preview your outfit before you get dressed"];
  } else {
    const parts = copy.split(/[,;.!?]|\band\s+(?=\w)/i).map(part => part.trim()).filter(Boolean);
    const first = parts[0]?.replace(/^(?:it|we|this app|our app)\s+(?:helps you\s+)?/i, "") ?? "";
    const benefit = first.replace(/^.*?\b(?:that|to|for)\s+(?=\w)/i, "");
    if (benefit && wordCount(benefit) >= 2) captions[1] = sentenceCase(benefit.split(/\s+/u).slice(0, 10).join(" ").slice(0, 80));
    if (parts[1] && wordCount(parts[1]) >= 3) captions[2] = sentenceCase(parts[1].split(/\s+/u).slice(0, 10).join(" ").slice(0, 80));
  }
  return { hook: captions[0], scenes: captions.map((caption, i) => ({ caption, motionPrompt: motions[i] })) };
}

function cleanCopy(text: string) {
  return text.replace(/[\p{C}\s]+/gu, " ").trim();
}

function sentenceCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1).trimEnd();
}

export function readCaptions(value: unknown) {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) return undefined;
  if (!Array.isArray(value) || value.length !== 3 || value.some(caption => typeof caption !== "string")) {
    throw new Error("Add one caption for each scene.");
  }
  const captions = value.map(cleanCopy);
  if (captions.some(caption => !caption || caption.length > 90 || wordCount(caption) > 10)) {
    throw new Error("Each caption needs 1–10 words and at most 90 characters.");
  }
  return captions;
}
