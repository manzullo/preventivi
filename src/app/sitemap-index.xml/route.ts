import { sitemapChunkCount } from "@/app/sitemap";
import { absoluteUrl } from "@/lib/site";

export const revalidate = 3600;

export async function GET() {
  const n = await sitemapChunkCount();
  const items = Array.from({ length: n }, (_, i) => `  <sitemap><loc>${absoluteUrl(`/sitemap/${i}.xml`)}</loc></sitemap>`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</sitemapindex>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
