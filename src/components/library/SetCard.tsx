import { Link } from "react-router";
import { cardProgress, type Folder, type LibrarySet } from "../../features/library/model";
import { formatRelativeDay, plural } from "../../lib/format";
import { ProgressBar } from "../ui/ProgressBar";
import { FOLDER_DOT } from "./folderStyles";

interface Props {
  set: LibrarySet;
  folder?: Folder;
}

/** A row in any list of sets: whole card is one link, with progress at a glance. */
export function SetCard({ set, folder }: Props) {
  const progress = cardProgress(set.flashcards);
  const counts = [
    set.flashcards.length > 0 ? plural(set.flashcards.length, "card") : null,
    set.quiz.length > 0 ? plural(set.quiz.length, "question") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      to={`/sets/${set.id}`}
      className="block rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong hover:bg-accent-soft/40 motion-reduce:transition-none"
    >
      <p className="wrap-anywhere font-display text-lg font-semibold leading-snug">{set.title}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
        {folder && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2.5 rounded-full ${FOLDER_DOT[folder.color]}`} />
            <span className="wrap-anywhere">{folder.name}</span>
            <span aria-hidden="true">·</span>
          </span>
        )}
        <span>{counts || "Empty"}</span>
        <span aria-hidden="true">·</span>
        <span>{set.lastStudiedAt ? `Studied ${formatRelativeDay(set.lastStudiedAt).toLowerCase()}` : "Not studied yet"}</span>
      </p>
      {progress.total > 0 && (
        <div className="mt-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <ProgressBar value={progress.known} max={progress.total} label={`${set.title}: ${progress.percent}% known`} />
          </div>
          <span className="text-sm tabular-nums text-ink-muted">{progress.percent}%</span>
        </div>
      )}
    </Link>
  );
}
