/** Shared class strings so every button has the same states (hover, focus, disabled). */
const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-base font-semibold transition-colors disabled:opacity-50 motion-reduce:transition-none";

export const primaryButton = `${base} bg-accent text-white hover:bg-accent-strong disabled:hover:bg-accent`;
export const secondaryButton = `${base} border border-line-strong bg-surface text-ink hover:bg-accent-soft disabled:hover:bg-surface`;
export const ghostButton = `${base} px-3 text-ink-muted hover:bg-accent-soft hover:text-ink`;
