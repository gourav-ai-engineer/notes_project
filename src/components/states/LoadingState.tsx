import { LoaderCircle } from "lucide-react";
import { secondaryButton } from "../ui/buttons";

interface Props {
  onCancel: () => void;
}

/** Honest loading state: no fake percentages, just what is happening and a way out. */
export function LoadingState({ onCancel }: Props) {
  return (
    <div role="status" aria-live="polite" className="rise-in flex flex-col items-center gap-4 rounded-card border border-line bg-surface px-6 py-12 text-center shadow-card">
      <LoaderCircle aria-hidden="true" size={36} className="spin text-accent" />
      <div>
        <p className="font-display text-xl font-semibold">Writing your study set…</p>
        <p className="mt-1 text-sm text-ink-muted">Reading your notes and drafting questions. This usually takes 5–20 seconds.</p>
      </div>
      <button type="button" onClick={onCancel} className={secondaryButton}>
        Cancel
      </button>
    </div>
  );
}
