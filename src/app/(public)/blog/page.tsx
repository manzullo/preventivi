import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { EmptyState, Kicker } from "@/design/ui";
import { db } from "@/lib/db";
import { excerpt } from "@/lib/markdown";
import { paths } from "@/lib/site";
import { pageMeta } from "@/modules/directory/seo";

export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: "Blog: come scegliere il professionista giusta",
  description: "Guide pratiche per scegliere professionisti SEO, Google Ads, social e web in Italia: cosa chiedere, quanto costa, come leggere le recensioni.",
  path: "/blog/",
});

export default async function BlogIndex() {
  const posts = await db.page.findMany({
    where: { kind: "blog", published: true },
    orderBy: { publishedAt: "desc" },
    select: { slug: true, title: true, description: true, body: true, publishedAt: true },
  });
  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Blog", href: "/blog/" }]} />
      <header className="mb-8">
        <Kicker className="mb-2">Blog</Kicker>
        <h1 className="t-h1">Guide per scegliere bene</h1>
        <p className="t-lead mt-3 max-w-3xl">Cosa chiedere a un professionista, quanto costa davvero, come leggere le recensioni.</p>
      </header>
      {posts.length === 0 ? (
        <EmptyState title="Nessun articolo ancora." text="Intanto puoi descrivere il lavoro: ti proponiamo una selezione di professionisti." primary={{ href: paths.quote(), label: "Chiedi un preventivo" }} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <article key={p.slug} className="flex flex-col rounded-card border border-line bg-canvas p-5">
              <p className="t-kicker">{p.publishedAt?.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}</p>
              <h2 className="t-title mt-2">
                <Link href={`/blog/${p.slug}/`} className="hover:text-action">
                  {p.title}
                </Link>
              </h2>
              <p className="t-body mt-2 line-clamp-3 text-ink-2">{p.description ?? excerpt(p.body)}</p>
              <Link href={`/blog/${p.slug}/`} className="t-meta mt-auto pt-4 font-bold text-action">
                Leggi →
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
