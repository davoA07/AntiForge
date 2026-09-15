"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GITHUB_URL } from "@/lib/site";
import { Logo } from "./logo";

const NAV = [
  { href: "/enroll", label: "Enroll" },
  { href: "/verify", label: "Verify" },
  { href: "/identities", label: "Identities" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75 sticky top-0 z-30">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-display text-lg tracking-tight">
          <Logo className="h-7 w-7" />
          <span>AntiForge</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-1.5 transition-colors hover:bg-paper-2 ${
                  active ? "bg-paper-2 text-ink" : "text-ink-2"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="ml-1 hidden items-center gap-1.5 rounded-md px-3 py-1.5 text-ink-2 transition-colors hover:bg-paper-2 sm:flex"
          >
            <GitHubMark className="h-4 w-4" />
            <span>Source</span>
          </a>
        </nav>
      </div>
    </header>
  );
}

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
