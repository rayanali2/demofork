import { MAX_IMAGE_BYTES, MAX_REFERENCE_BYTES } from "./validation";

const pattern = /^demofork\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(reference\.(mp4|mov)|screenshot-([0-2])\.(png|jpg|jpeg))$/;

export function uploadPolicy(pathname: string) {
  const match = pattern.exec(pathname);
  if (!match) throw new Error("Invalid temporary upload path.");
  const reference = Boolean(match[3]);
  const extension = pathname.split(".").pop()!;
  const contentType = reference ? extension === "mov" ? "video/quicktime" : "video/mp4" : extension === "png" ? "image/png" : "image/jpeg";
  return { session: match[1], role: reference ? "reference" : `screenshot-${match[4]}`, filename: match[2], contentType, maximumSizeInBytes: reference ? MAX_REFERENCE_BYTES : MAX_IMAGE_BYTES };
}

export function validateBlobPaths(value: unknown, complete = true): string[] {
  if (!Array.isArray(value) || value.length > 4 || (complete && value.length !== 4) || value.some(p => typeof p !== "string")) throw new Error("Upload one reference and exactly three screenshots.");
  const paths = value as string[];
  const policies = paths.map(uploadPolicy);
  if (new Set(policies.map(p => p.session)).size > 1 || new Set(policies.map(p => p.role)).size !== paths.length) throw new Error("Uploads must belong to one session with no duplicate scenes.");
  if (complete && !["reference", "screenshot-0", "screenshot-1", "screenshot-2"].every(role => policies.some(p => p.role === role))) throw new Error("Add all four required uploads.");
  return paths;
}
