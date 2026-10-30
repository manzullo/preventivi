import Link from "next/link";
import { JsonLd } from "./JsonLd";
import { breadcrumbJsonLd, type Crumb } from "@/modules/directory/seo";

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Percorso" className="t-meta mb-4">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={c.href} className="flex items-center gap-1.5">
              {last ? (
                <span aria-current="page" className="text-ink">
                  {c.name}
                </span>
              ) : (
                <Link href={c.href} className="hover:text-action">
                  {c.name}
                </Link>
              )}
              {!last && <span aria-hidden className="text-ink-3">/</span>}
            </li>
          );
        })}
      </ol>
      <JsonLd data={breadcrumbJsonLd(items)} />
    </nav>
  );
}
