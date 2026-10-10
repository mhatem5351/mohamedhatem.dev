/**
 * /mohamed-hatem.vcf ("Add to contacts"): a vCard 3.0 generated from content/profile.ts at build time (src/lib/vcard.ts),
 * with the portrait embedded. public/_headers serves it as text/vcard.
 */
import type { APIRoute } from "astro";
import { srcDir } from "astro:config/server";
import { readFile } from "node:fs/promises";
import { profile } from "~/lib/site";
import { VCARD_PHOTO, vcard, vcardPhoto } from "~/lib/vcard";

export const GET: APIRoute = async () => {
  const photo = await vcardPhoto(await readFile(new URL(VCARD_PHOTO.source, srcDir)));
  return new Response(vcard(profile, { photo }), { headers: { "Content-Type": "text/vcard; charset=utf-8" } });
};
