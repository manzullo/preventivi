import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  AliasHub,
  AlternativePage,
  CityHub,
  ComparisonPage,
  RegionHub,
  ServiceHub,
  StaticPage,
} from "@/components/Hubs";
import { db } from "@/lib/db";
import { CURRENT_YEAR, PUBLISH_THRESHOLD, fmt, paths } from "@/lib/site";
import { cityScopeIds, countAgencies } from "@/modules/directory/listing";
import { resolveOne } from "@/modules/directory/resolve";
import { pageMetaWithOverride } from "@/modules/directory/pages";
import { descriptions, titles } from "@/modules/directory/seo";

export const revalidate = 3600;

type Params = Promise<{ uno: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { uno } = await params;
  const r = await resolveOne(uno);
  if (!r || r.kind === "redirect") return {};
  switch (r.kind) {
    case "service": {
      const n = await countAgencies({ serviceSlug: r.service.slug });
      return pageMetaWithOverride({
        title: titles.service(r.service.plural),
        description: descriptions.service(r.service.plural, n),
        path: paths.service(r.service.slug),
      });
    }
    case "city": {
      const n = await countAgencies({ cityIds: await cityScopeIds(r.city) });
      return pageMetaWithOverride({
        title: titles.city(r.city.name),
        description: descriptions.city(r.city.name, n),
        path: paths.city(r.city.slug),
      });
    }
    case "region": {
      const n = await countAgencies({ regionId: r.region.id });
      return pageMetaWithOverride({
        title: titles.region(r.region.name, n),
        description: descriptions.region(r.region.name, n),
        path: paths.region(r.region.slug),
      });
    }
    case "comparison": {
      const n = await countAgencies({ serviceSlug: r.service.slug });
      return pageMetaWithOverride({
        title: titles.comparison(r.service.plural),
        description: descriptions.comparison(r.service.plural, n),
        path: paths.comparison(r.service.slug),
      });
    }
    case "alternative":
      return pageMetaWithOverride({
        title: titles.alternative(r.competitor.name),
        description: descriptions.alternative(r.competitor.name),
        path: paths.alternative(r.competitor.slug),
      });
    case "page":
      return pageMetaWithOverride({
        title: r.page.title,
        description: r.page.description ?? r.page.title,
        path: `/${r.page.slug}/`,
      });
    case "alias": {
      const n = await countAgencies({ serviceSlug: r.service.slug });
      return pageMetaWithOverride({
        title: `${r.alias.label}: ${fmt(n)} professionisti a confronto (${CURRENT_YEAR})`,
        description: r.alias.intro?.slice(0, 155) ?? descriptions.service(r.service.plural, n),
        path: `/${r.alias.slug}/`,
      });
    }
  }
}

export default async function Page({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { uno } = await params;
  const r = await resolveOne(uno);
  if (!r) notFound();
  if (r.kind === "redirect") {
    if (r.status === 410 || !r.to) notFound();
    permanentRedirect(r.to);
  }
  const sp = await searchParams;

  switch (r.kind) {
    case "service": {
      if ((await countAgencies({ serviceSlug: r.service.slug })) < PUBLISH_THRESHOLD) notFound();
      return <ServiceHub service={r.service} sp={sp} />;
    }
    case "city": {
      const ids = await cityScopeIds(r.city);
      if ((await countAgencies({ cityIds: ids })) < PUBLISH_THRESHOLD) notFound();
      return <CityHub city={r.city} sp={sp} />;
    }
    case "region": {
      const n = await db.landingPage.count({
        where: { kind: "city", published: true, city: { regionId: r.region.id } },
      });
      if (n === 0) notFound();
      return <RegionHub region={r.region} />;
    }
    case "comparison": {
      if ((await countAgencies({ serviceSlug: r.service.slug })) < PUBLISH_THRESHOLD) notFound();
      return <ComparisonPage service={r.service} />;
    }
    case "alternative":
      return <AlternativePage competitor={r.competitor} />;
    case "page":
      return <StaticPage page={r.page} />;
    case "alias": {
      if ((await countAgencies({ serviceSlug: r.service.slug })) < PUBLISH_THRESHOLD) notFound();
      return <AliasHub alias={r.alias} service={r.service} sp={sp} />;
    }
  }
}
