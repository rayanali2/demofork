import { MAX_REQUEST_BYTES, validateInputs } from "./validation";
import { readCaptions } from "./format";

export async function readInputs(request: Request) {
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > MAX_REQUEST_BYTES) throw new Error("Uploads are too large. Use a reference under 40 MB and images under 8 MB.");
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new Error("Upload the reference and screenshots using the form.");
  // Enforce the byte limit even when Content-Length is absent or forged.
  if (!request.body) throw new Error("No uploads received.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > MAX_REQUEST_BYTES) { await reader.cancel(); throw new Error("Uploads are too large. Keep the complete upload under 65 MB."); }
    chunks.push(value);
  }
  let form: FormData;
  try { form = await new Request(request.url, { method: "POST", headers: { "content-type": request.headers.get("content-type")! }, body: Buffer.concat(chunks) }).formData(); }
  catch { throw new Error("Couldn’t read these uploads. Choose your files again."); }
  const references = form.getAll("reference");
  const reference = form.get("reference");
  const images = form.getAll("screenshots");
  const name = form.get("productName"); const description = form.get("description");
  if (references.length > 1) throw new Error("Upload only one reference demo.");
  if (reference !== null && !(reference instanceof File)) throw new Error("Choose an MP4 or MOV reference demo.");
  if (images.some(image => !(image instanceof File))) throw new Error("Screenshots must be JPG or PNG images.");
  if (typeof name !== "string" || typeof description !== "string") throw new Error("Add your product name and description.");
  validateInputs(reference as File | null, images as File[], name, description);
  return { reference: reference as File, images: images as File[], name: name.trim(), description: description.trim(), captions: readCaptions(form.getAll("captions")) };
}
