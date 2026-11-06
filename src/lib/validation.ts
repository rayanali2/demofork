export const MAX_REFERENCE_BYTES = 40 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 65 * 1024 * 1024;
export type Upload = { name: string; size: number; type: string };

export function validateUpload(file: Upload, kind: "reference" | "image") {
  if (!file.size) throw new Error("This file is empty. Choose another file.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (kind === "reference") {
    if (!["mp4", "mov"].includes(extension ?? "") || (file.type && !["video/mp4", "video/quicktime"].includes(file.type))) throw new Error("Choose an MP4 or MOV reference demo.");
    if (file.size > MAX_REFERENCE_BYTES) throw new Error("Your reference must be smaller than 40 MB.");
  } else {
    if (!["jpg", "jpeg", "png"].includes(extension ?? "") || (file.type && !["image/jpeg", "image/png"].includes(file.type))) throw new Error("Screenshots must be JPG or PNG images.");
    if (file.size > MAX_IMAGE_BYTES) throw new Error("Each screenshot must be smaller than 8 MB.");
  }
}

export function validateInputs(reference: Upload | null, images: (Upload | null)[], name: string, description: string) {
  if (!reference) throw new Error("Add a reference demo first.");
  validateUpload(reference, "reference");
  if (!name.trim()) throw new Error("Give your product a name.");
  if (name.trim().length > 80) throw new Error("Keep your product name under 80 characters.");
  if (!description.trim()) throw new Error("Tell us what your product does.");
  if (description.trim().length > 1200) throw new Error("Keep your description under 1,200 characters.");
  if (images.length !== 3 || images.some(image => !image)) throw new Error("Add exactly 3 product screenshots.");
  images.forEach(image => validateUpload(image!, "image"));
}

export function validateDuration(duration: number) {
  if (!Number.isFinite(duration) || duration < 3 || duration > 30.1) throw new Error("Choose a reference between 3 and 30 seconds long.");
}
