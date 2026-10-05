import { NextResponse } from "next/server";
import { getPublicForm } from "@/modules/leadforms/forms";

export const dynamic = "force-dynamic";

// Definizione pubblica del form (per embed su altri siti).
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const form = await getPublicForm(slug);
  if (!form) return NextResponse.json({ ok: false, error: "Form non trovato" }, { status: 404 });
  return NextResponse.json({ ok: true, form }, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" } });
}
