import type { KeyboardEvent, ReactNode } from "react";

export interface TabDef<T extends string> {
  id: T;
  label: string;
  badge?: ReactNode;
}

interface Props<T extends string> {
  tabs: TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  label: string;
  /** Parent supplies this so it can build matching tabpanel ids with tabPanelProps. */
  idPrefix: string;
}

/** WAI-ARIA tabs: roving tabindex, Left/Right/Home/End. Panels are rendered by the parent. */
export function Tabs<T extends string>({ tabs, active, onChange, label, idPrefix: base }: Props<T>) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.id === active);
    const targets: Record<string, number> = {
      ArrowRight: (i + 1) % tabs.length,
      ArrowLeft: (i - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    const next = targets[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onChange(tabs[next].id);
    document.getElementById(`${base}-tab-${tabs[next].id}`)?.focus();
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto rounded-xl bg-line/60 p-1">
      {tabs.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            id={`${base}-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors motion-reduce:transition-none sm:text-base ${
              selected ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
            {t.badge}
          </button>
        );
      })}
    </div>
  );
}
