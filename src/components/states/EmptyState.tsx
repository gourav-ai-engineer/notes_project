import type { ReactNode } from "react";

interface Props {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, children, action }: Props) {
  return (
    <div className="rise-in flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      <div aria-hidden="true" className="text-accent">
        {icon}
      </div>
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      <p className="max-w-md text-sm text-ink-muted">{children}</p>
      {action}
    </div>
  );
}
