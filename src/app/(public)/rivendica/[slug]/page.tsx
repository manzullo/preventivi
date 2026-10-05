import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Button, Kicker } from "@/design/ui";
import { db } from "@/lib/db";
import { paths } from "@/lib/site";
import { pageMeta } from "@/modules/directory/seo";
import { confirmClaim, requestClaim } from "./actions";

export const dynamic = "force-dynamic";
type Params = Promise<{ slug: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const a = await db.agency.findUnique({ where: { slug }, select: { name: true } });
  return pageMeta({ title: a ? `Rivendica ${a.name}` : "Rivendica la scheda", description: "Conferma di gestire il professionista e ottieni la scheda verificata.", path: `/rivendica/${slug}/`, noindex: true });
}

export default async function ClaimPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const sp = await searchParams;
  const a = await db.agency.findUnique({ where: { slug }, select: { name: true, slug: true, domain: true, claimed: true, verified: true, published: true } });
  if (!a || !a.published) notFound();
  const token = typeof sp.token === "string" ? sp.token : "";
  const result = token ? await confirmClaim(slug, token) : null;
  const msg = typeof sp.msg === "string" ? sp.msg : "";
  const IN = "w-full rounded-slot border-[1.5px] border-line bg-canvas px-4 py-3 text-[15px] outline-none focus:border-action";
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: a.name, href: paths.agency(a.slug) }, { name: "Rivendica", href: `/rivendica/${a.slug}/` }]} />
      <Kicker className="mb-2">Per il titolare</Kicker>
      <h1 className="t-h1">Rivendica {a.name}</h1>
      {result ? (
        <div className="mt-6 rounded-card border border-line bg-surface p-6"><p className={`t-title ${result.ok ? "text-ok" : "text-brand"}`}>{result.message}</p><Link href={paths.agency(a.slug)} className="t-meta mt-3 inline-block font-bold text-action">Torna alla scheda →</Link></div>
      ) : a.verified ? (
        <p className="t-lead mt-4">Questa scheda è già verificata dal titolare. Per modifiche scrivici indicando la scheda.</p>
      ) : (
        <>
          <p className="t-lead mt-4">La rivendicazione è gratuita e non cambia la posizione in classifica. Serve un&apos;email sul dominio del sito in scheda{a.domain ? ` (${a.domain})` : ""}: ti mandiamo un link di conferma. Dopo la conferma controlliamo a mano che tu gestisca davvero l&apos;professionista, di solito con una telefonata al numero pubblico: solo allora la scheda passa a te.</p>
          {msg && <p className="mt-4 text-sm font-semibold text-action">{msg}</p>}
          <form action={requestClaim} className="mt-6 grid max-w-xl gap-3 sm:grid-cols-2">
            <input type="hidden" name="slug" value={a.slug} />
            <input name="email" type="email" required placeholder={a.domain ? `nome@${a.domain}` : "email"} className={`${IN} sm:col-span-2`} />
            <input name="role" placeholder="Il tuo ruolo (titolare, socio, collaboratore)" className={IN} />
            <input name="phone" placeholder="Telefono per la verifica" className={IN} />
            <Button type="submit" arrow>Invia il link</Button>
          </form>
        </>
      )}
    </div>
  );
}
