import { GITHUB_URL } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Everything runs in your browser. Signatures never leave this device.
        </p>
        <p className="flex gap-4">
          <a href={GITHUB_URL} className="hover:text-ink" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href={`${GITHUB_URL}/blob/main/LICENSE`} className="hover:text-ink" target="_blank" rel="noreferrer">
            MIT license
          </a>
        </p>
      </div>
    </footer>
  );
}
