import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional line under the title. */
  subtitle?: ReactNode;
  /** Buttons/links aligned to the right on wide screens. */
  actions?: ReactNode;
}

/** The page <h1>. Focusable (tabIndex -1) so the shell can move focus here after navigation. */
export function PageTitle({ children, subtitle, actions }: Props) {
  return (
    <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 tabIndex={-1} className="wrap-anywhere font-display text-3xl font-semibold leading-tight outline-none sm:text-4xl">
          {children}
        </h1>
        {subtitle && <p className="wrap-anywhere mt-2 max-w-prose text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
