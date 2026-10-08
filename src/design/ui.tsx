import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ---------- Bottoni ----------

type Variant = "primary" | "outline" | "tonal" | "text";

const BASE =
  "group inline-flex min-h-11 items-center justify-center gap-2 rounded-pill text-[15px] font-bold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-action/40 disabled:pointer-events-none disabled:opacity-50";

const VARIANT: Record<Variant, string> = {
  primary: "bg-action text-white shadow-soft hover:bg-action-hover px-7 py-3.5",
  outline:
    "border-[1.5px] border-ink/15 bg-canvas text-ink hover:border-ink/35 px-[26px] py-[13px]",
  tonal: "bg-tonal text-action hover:brightness-95 px-7 py-3.5",
  text: "min-h-0 px-0 py-0 text-action hover:text-action-hover",
};

export function Arrow() {
  return (
    <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
      →
    </span>
  );
}

type ButtonProps = {
  href?: string;
  variant?: Variant;
  arrow?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

export function Button({
  href,
  variant = "primary",
  arrow,
  className,
  children,
  ...rest
}: ButtonProps) {
  const cls = cn(BASE, VARIANT[variant], className);
  const inner = (
    <>
      {children}
      {arrow && <Arrow />}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button className={cls} {...rest}>
      {inner}
    </button>
  );
}

// ---------- Testo ----------

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("t-kicker", className)}>{children}</p>;
}

export function SectionHead({
  title,
  kicker,
  action,
  as: Tag = "h2",
}: {
  title: ReactNode;
  kicker?: ReactNode;
  action?: ReactNode;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && <Kicker className="mb-2">{kicker}</Kicker>}
        <Tag className={Tag === "h1" ? "t-h1" : "t-h2"}>{title}</Tag>
      </div>
      {action}
    </div>
  );
}

// ---------- Chip ----------

export function Chip({
  href,
  active,
  children,
  count,
}: {
  href: string;
  active?: boolean;
  children: ReactNode;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-action/40",
        active ? "bg-ink text-white" : "bg-surface text-ink hover:bg-tonal hover:text-action",
      )}
    >
      {children}
      {typeof count === "number" && (
        <span className={cn("text-xs font-semibold", active ? "text-white/70" : "text-ink-3")}>
          {count}
        </span>
      )}
    </Link>
  );
}

// ---------- Rating ----------

export function Rating({
  value,
  count,
  size = "md",
}: {
  value: number | null;
  count: number;
  size?: "md" | "lg";
}) {
  if (value === null) {
    return <span className="t-meta text-ink-3">Nessuna recensione</span>;
  }
  // count 0 con un voto: le stelle vengono da una fonte che non dice quante
  // recensioni ha (Google Maps senza login).
  return (
    <span className={cn("inline-flex items-center gap-1.5", size === "lg" ? "text-base" : "text-sm")}>
      <span aria-hidden className="text-star">
        ★
      </span>
      <span className="font-extrabold text-ink">{value.toLocaleString("it-IT", { maximumFractionDigits: 1 })}</span>
      {count > 0 && <span className="text-ink-3">({count})</span>}
    </span>
  );
}

// ---------- Superfici ----------

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-card border border-line bg-canvas p-5 shadow-card", className)}>
      {children}
    </div>
  );
}

export function Badge({ tone = "ok", children }: { tone?: "ok" | "warn" | "neutral"; children: ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-ok-soft text-ok"
      : tone === "warn"
        ? "bg-warn text-warn-fg"
        : "bg-surface text-ink-2";
  return (
    <span className={cn("inline-flex items-center rounded-pill px-[11px] py-[5px] text-xs font-bold", cls)}>
      {children}
    </span>
  );
}

/** Stato vuoto: bordo tratteggiato, due uscite (togli filtri / form). */
export function EmptyState({
  title,
  text,
  primary,
  secondary,
}: {
  title: string;
  text: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <div className="rounded-card border border-dashed border-ink/20 bg-surface px-6 py-16 text-center">
      <p className="t-title">{title}</p>
      <p className="t-body mt-2 text-ink-2">{text}</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        {secondary && (
          <Button variant="outline" href={secondary.href}>
            {secondary.label}
          </Button>
        )}
        <Button href={primary.href} arrow>
          {primary.label}
        </Button>
      </div>
    </div>
  );
}
