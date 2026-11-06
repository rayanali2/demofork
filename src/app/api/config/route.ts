import { magicHourAvailable } from "@/lib/magic-hour";

export const runtime = "nodejs";
export function GET() {
  const hosted = Boolean(process.env.VERCEL);
  const blob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  return Response.json({ uploadMode: blob ? "blob" : "multipart", hosted, configured: !hosted || blob, magicHourAvailable: magicHourAvailable() }, { headers: { "Cache-Control": "no-store" } });
}
