import { NextResponse } from "next/server";
import { DEFAULT_IMAGE_MODEL, sizeFor } from "../../../lib/image";
import { bad, handle, readText } from "../../../lib/api";

export const maxDuration = 60;

// Renders an image prompt with Pollinations.ai and returns the image bytes.
// With a free key (header x-image-key, or POLLINATIONS_API_KEY on the server)
// it uses the keyed API; without one it uses the small no-key allowance,
// which adds a watermark and runs out after a few images.
export const POST = handle(async (req) => {
  const body = await req.json();
  const prompt = readText(body.prompt, "prompt", 2000);
  const seed = Number.isInteger(body.seed) ? Math.abs(body.seed) % 1_000_000 : 42;
  const { width, height } = sizeFor(typeof body.shape === "string" ? body.shape : undefined);
  const key = (req.headers.get("x-image-key") || process.env.POLLINATIONS_API_KEY || "").trim();

  const q = new URLSearchParams({ width: String(width), height: String(height), seed: String(seed) });
  const url = key
    ? `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?${q}&model=${encodeURIComponent(process.env.POLLINATIONS_MODEL || DEFAULT_IMAGE_MODEL)}`
    : `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${q}`;

  // Retry temporary failures (network drops, 5xx "busy" responses) up to twice.
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(25_000) });
      if (res.status < 500) break;
    } catch {
      res = null;
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  if (!res) return bad("Could not reach the image service. Check your connection and try again.", 502);
  if (res.status === 401) return bad("The Pollinations key was rejected. Check it in the Keys guide.", 401, { code: "auth", service: "image" });
  if (res.status === 402 || res.status === 429) {
    return bad(
      key
        ? "Your Pollinations key has run out of Pollen (its budget is used up). Raise the key's budget or claim more free Pollen from Quests at enter.pollinations.ai."
        : "The free no-key image allowance is used up for now. Add a free Pollinations key under Keys (see the guide) to keep generating.",
      402,
      { code: "quota", service: "image" },
    );
  }
  const type = res.headers.get("content-type") || "";
  if (res.status >= 500) return bad("The image service is busy right now. Press New variation to try again in a moment.", 503, { code: "busy", service: "image" });
  if (!res.ok || !type.startsWith("image/")) return bad(`The image service returned an error (${res.status}).`, 502);
  return new NextResponse(await res.arrayBuffer(), {
    headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600", "X-Image-Source": key ? "keyed" : "free", "X-Image-Model": key ? process.env.POLLINATIONS_MODEL || DEFAULT_IMAGE_MODEL : "legacy" },
  });
});
