import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink/90 disabled:hover:bg-ink",
  secondary: "border border-line bg-paper hover:bg-paper-2",
  ghost: "hover:bg-paper-2 text-ink-2 hover:text-ink",
  danger: "border border-forged/40 text-forged hover:bg-forged-soft",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type="button" className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-line bg-paper-2/40 p-5 sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export const INPUT =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/25";

export function Notice({
  tone,
  children,
}: {
  tone: "info" | "warn" | "bad" | "ok";
  children: ReactNode;
}) {
  const tones = {
    info: "border-accent/30 bg-accent-soft text-ink",
    warn: "border-warn/40 bg-warn-soft text-ink",
    bad: "border-forged/40 bg-forged-soft text-ink",
    ok: "border-verified/40 bg-verified-soft text-ink",
  };
  return <div className={`rounded-lg border px-3 py-2 text-sm ${tones[tone]}`}>{children}</div>;
}

export function PageTitle({ title, lede }: { title: string; lede?: string }) {
  return (
    <div className="mb-6 space-y-2">
      <h1 className="font-display text-3xl tracking-tight sm:text-4xl">{title}</h1>
      {lede && <p className="max-w-2xl text-ink-2">{lede}</p>}
    </div>
  );
}
