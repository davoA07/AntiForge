export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <rect width="64" height="64" rx="14" fill="currentColor" />
      <path
        d="M12 42 C 18 22, 24 22, 26 34 C 27 40, 24 44, 22 40 C 20 34, 30 20, 38 24 C 46 28, 40 44, 34 40 C 30 37, 38 30, 48 32 C 52 33, 52 38, 50 40"
        fill="none"
        stroke="var(--paper)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
