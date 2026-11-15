import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { Library, Plus, Settings, House, X } from "lucide-react";
import { useLibrary } from "../../features/library/LibraryContext";
import { useTheme } from "../../lib/theme";

const NAV = [
  { to: "/", label: "Home", Icon: House, end: true },
  { to: "/create", label: "Create", Icon: Plus, end: false },
  { to: "/library", label: "Library", Icon: Library, end: false },
  { to: "/settings", label: "Settings", Icon: Settings, end: false },
] as const;

export type ShellContext = ReturnType<typeof useTheme>;

/**
 * One <nav> that is a sidebar on wide screens and a bottom tab bar on phones, so there is a single
 * "Primary" landmark. Focus moves to the new page's <h1> after each navigation.
 */
export function AppShell() {
  const theme = useTheme();
  const { recovered, storageProblem, dismissNotices } = useLibrary();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const target = mainRef.current?.querySelector<HTMLElement>("h1") ?? mainRef.current;
    target?.focus({ preventScroll: false });
    window.scrollTo?.({ top: 0 });
  }, [pathname]);

  return (
    <div className="min-h-screen md:flex">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-accent px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:flex-col md:gap-1 md:border-r md:border-t-0 md:p-4 md:pb-4"
      >
        <div className="mb-6 hidden items-center gap-3 px-2 md:flex">
          <img src="/favicon.svg" alt="" width={32} height={32} className="rounded-lg" />
          <span className="font-display text-xl font-semibold">Recall Studio</span>
        </div>
        {NAV.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-2 text-xs font-medium transition-colors motion-reduce:transition-none md:min-h-11 md:flex-none md:flex-row md:justify-start md:gap-3 md:rounded-xl md:px-3 md:text-base ${
                isActive ? "text-accent-ink md:bg-accent-soft" : "text-ink-muted hover:text-ink md:hover:bg-accent-soft/60"
              }`
            }
          >
            <Icon aria-hidden="true" size={22} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3 md:hidden">
          <img src="/favicon.svg" alt="" width={28} height={28} className="rounded-lg" />
          <span className="font-display text-lg font-semibold">Recall Studio</span>
        </header>

        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-4xl px-4 pb-28 pt-6 outline-none md:px-8 md:pb-12 md:pt-10">
          {(recovered || storageProblem) && (
            <div role="alert" className="mb-6 flex items-start gap-3 rounded-card border border-warm/40 bg-warm-soft p-4 text-sm">
              <p className="wrap-anywhere min-w-0 flex-1 text-ink">
                {recovered
                  ? "Your saved library couldn't be read, so we started fresh. A copy of the unreadable data was kept in this browser."
                  : storageProblem === "quota"
                    ? "This browser's storage is full, so recent changes are not being saved. Export a backup from Settings and free some space."
                    : "This browser is blocking storage, so your library won't be saved after you close the tab. Export a backup from Settings."}
              </p>
              <button type="button" onClick={dismissNotices} aria-label="Dismiss notice" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-accent-soft">
                <X aria-hidden="true" size={16} />
              </button>
            </div>
          )}
          <Outlet context={theme satisfies ShellContext} />
        </main>
      </div>
    </div>
  );
}
