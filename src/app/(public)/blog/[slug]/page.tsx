import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { Button, Kicker } from "@/design/ui";
import { db } from "@/lib/db";
import { excerpt } from "@/lib/markdown";
import { SITE_NAME, absoluteUrl, paths } from "@/lib/site";
import { ArticleBody } from "@/modules/content/blocks";
import { pageMeta } from "@/modules/directory/seo";

export const revalidate = 3600;

type Params = Promise<{ slug: string }>;

async function getPost(slug: string) {
  return db.page.findFirst({ where: { slug, kind: "blog", published: true } });
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPost(slug);
  if (!p) return {};
  return pageMeta({ title: p.title, description: p.description ?? excerpt(p.body), path: `/blog/${p.slug}/` });
}

export default async function BlogPost({ params }: { params: Params }) {
  const { slug } = await params;
  const p = await getPost(slug);
  if (!p) notFound();
  const date = p.publishedAt ?? p.createdAt;
  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Blog", href: "/blog/" }, { name: p.title, href: `/blog/${p.slug}/` }]} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: p.title,
          description: p.description ?? excerpt(p.body),
          datePublished: date.toISOString(),
          dateModified: p.updatedAt.toISOString(),
          mainEntityOfPage: absoluteUrl(`/blog/${p.slug}/`),
          publisher: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl("/") },
        }}
      />
      <article className="max-w-3xl">
        <Kicker className="mb-2">{date.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}</Kicker>
        <h1 className="t-h1">{p.title}</h1>
        {p.description && <p className="t-lead mt-3">{p.description}</p>}
        <ArticleBody body={p.body} />
      </article>
      <aside className="mt-14 max-w-3xl rounded-panel bg-surface p-8">
        <p className="t-title">Vuoi una selezione di professionisti per il tuo progetto?</p>
        <p className="t-body mt-1 text-ink-2">Due minuti, nessun account, nessuna commissione.</p>
        <Button href={paths.quote()} arrow className="mt-5">
          Chiedi un preventivo
        </Button>
      </aside>
    </div>
  );
}
