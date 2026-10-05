"use client";

// Conversione sparata QUI, dopo il redirect, con il lead_id: chiude la race
// condition del plugin. Una sola volta per lead (guardia in sessionStorage).

import { useEffect } from "react";

export type FirePayload = {
  leadId: string;
  formSlug: string;
  clientId: string;
  eventType: string;
  value?: number | null;
  currency: string;
  serviceSlug?: string | null;
  citySlug?: string | null;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  gclid?: string | null;
  campaign?: string | null;
  keyword?: string | null;
  answers?: Record<string, unknown>;
  conversions: { gadsId: string; gadsLabel: string; value: number | null; currency: string }[];
  gtmId?: string | null;
  gtmMode: "load" | "present";
  ga4Id?: string | null;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function loadScript(id: string, src: string) {
  if (document.getElementById(id)) return;
  const s = document.createElement("script");
  s.id = id;
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

export function ConversionFire({ p }: { p: FirePayload }) {
  useEffect(() => {
    const key = `ma_fired_${p.leadId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* storage non disponibile: si spara comunque una volta */
    }

    window.dataLayer = window.dataLayer || [];

    if (p.gtmMode === "load" && p.gtmId) {
      window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
      loadScript(`ma-gtm-${p.gtmId}`, `https://www.googletagmanager.com/gtm.js?id=${p.gtmId}`);
    }

    const ids = [p.ga4Id, ...p.conversions.map((c) => c.gadsId)].filter((x): x is string => Boolean(x));
    if (ids.length && !window.gtag) {
      loadScript(`ma-gtag-${ids[0]}`, `https://www.googletagmanager.com/gtag/js?id=${ids[0]}`);
      window.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        window.dataLayer!.push(arguments);
      };
      window.gtag("js", new Date());
      for (const id of ids) window.gtag("config", id);
    }

    // Stessa forma del plugin + i campi che mancavano (value, currency,
    // event_type, client_id, lead_id).
    window.dataLayer.push({
      event: "psf_form_submit",
      psf_form_id: p.formSlug,
      psf_lead_id: p.leadId,
      psf_client_id: p.clientId,
      psf_event_type: p.eventType,
      psf_value: p.value ?? 0,
      psf_currency: p.currency,
      psf_service: p.serviceSlug ?? "",
      psf_city: p.citySlug ?? "",
      psf_user_email: p.email ?? "",
      psf_user_phone: p.phone ?? "",
      psf_user_name: p.name ?? "",
      psf_gclid: p.gclid ?? "",
      psf_campaign: p.campaign ?? "",
      psf_keyword: p.keyword ?? "",
      // Come il plugin: ogni risposta come psf_answers_<chiave>.
      ...Object.fromEntries(Object.entries(p.answers ?? {}).map(([k, v]) => [`psf_answers_${k}`, Array.isArray(v) ? v.join(",") : String(v ?? "")])),
    });

    if (window.gtag) {
      window.gtag("event", "generate_lead", { currency: p.currency, value: p.value ?? 0, lead_id: p.leadId, event_type: p.eventType, client_id: p.clientId });
      for (const c of p.conversions) {
        window.gtag("event", "conversion", { send_to: `${c.gadsId}/${c.gadsLabel}`, value: c.value ?? p.value ?? 0, currency: c.currency, transaction_id: p.leadId });
      }
    }
  }, [p]);

  return null;
}
