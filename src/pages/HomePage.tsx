import type { ReactNode } from "react";
import { Link } from "react-router";
import { BookOpen, Flame, Folder as FolderIcon, GraduationCap, Plus } from "lucide-react";
import { FOLDER_ICON } from "../components/library/folderStyles";
import { SetCard } from "../components/library/SetCard";
import { PageTitle } from "../components/layout/PageTitle";
import { EmptyState } from "../components/states/EmptyState";
import { primaryButton } from "../components/ui/buttons";
import { CREATE_OPTIONS } from "../features/create/options";
import { findFolder, setsInFolder, useLibrary } from "../features/library/LibraryContext";
import { computeStreak, localDayKey } from "../features/library/model";
import { plural } from "../lib/format";

function Stat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-card border border-line bg-surface p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
      <span aria-hidden="true" className="text-accent-ink">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-display text-2xl font-semibold leading-none">{value}</p>
        <p className="mt-1 text-xs text-ink-muted sm:text-sm">{label}</p>
      </div>
    </div>
  );
}

export function HomePage() {
  const lib = useLibrary();
  const { sets, folders, activity } = lib.library;
  const streak = computeStreak(activity, localDayKey());
  const knownCards = sets.reduce((n, s) => n + s.flashcards.filter((c) => c.status === "known").length, 0);

  // Most recently studied first; sets never studied fall back to when they were last changed.
  const recent = [...sets].sort((a, b) => (b.lastStudiedAt ?? b.updatedAt).localeCompare(a.lastStudiedAt ?? a.updatedAt)).slice(0, 3);

  return (
    <div className="space-y-8">
      <PageTitle subtitle="Turn your notes into flashcards and quizzes, then keep what you learn.">Home</PageTitle>

      <section aria-label="Your progress" className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat icon={<Flame size={28} />} value={plural(streak, "day")} label={streak > 0 ? "Study streak" : "Streak starts today"} />
        <Stat icon={<BookOpen size={28} />} value={sets.length.toLocaleString()} label={sets.length === 1 ? "Study set" : "Study sets"} />
        <Stat icon={<GraduationCap size={28} />} value={knownCards.toLocaleString()} label={knownCards === 1 ? "Card known" : "Cards known"} />
      </section>

      <section aria-labelledby="create-heading">
        <h2 id="create-heading" className="mb-3 font-display text-2xl font-semibold">
          Create
        </h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {CREATE_OPTIONS.map(({ to, label, Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex min-h-14 items-center gap-3 rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm font-semibold transition-colors hover:bg-accent-soft motion-reduce:transition-none"
              >
                <span className="shrink-0 text-accent-ink">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <span className="wrap-anywhere">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {sets.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={36} />}
          title="Take the first step towards better marks"
          action={
            <Link to="/create" className={primaryButton}>
              <Plus aria-hidden="true" size={18} />
              Create your first set
            </Link>
          }
        >
          Pick an option above. Your sets are saved on this device, so you can come back and keep practising.
        </EmptyState>
      ) : (
        <section aria-labelledby="continue-heading">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="continue-heading" className="font-display text-2xl font-semibold">
              Continue studying
            </h2>
            <Link to="/library" className="text-sm font-semibold text-accent-ink underline-offset-2 hover:underline">
              View library
            </Link>
          </div>
          <ul className="space-y-3">
            {recent.map((s) => (
              <li key={s.id}>
                <SetCard set={s} folder={findFolder(lib.library, s.folderId ?? undefined)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {folders.length > 0 && (
        <section aria-labelledby="folders-heading">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="folders-heading" className="font-display text-2xl font-semibold">
              Your folders
            </h2>
            <Link to="/library?tab=folders" className="text-sm font-semibold text-accent-ink underline-offset-2 hover:underline">
              See all
            </Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {folders.slice(0, 4).map((f) => (
              <li key={f.id}>
                <Link to={`/folders/${f.id}`} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 transition-colors hover:bg-accent-soft/40 motion-reduce:transition-none">
                  <FolderIcon aria-hidden="true" size={24} className={`shrink-0 ${FOLDER_ICON[f.color]}`} />
                  <span className="min-w-0">
                    <span className="wrap-anywhere block font-semibold">{f.name}</span>
                    <span className="block text-sm text-ink-muted">{plural(setsInFolder(lib.library, f.id).length, "set")}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
