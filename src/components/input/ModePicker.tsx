import { useId } from "react";
import type { StudyMode } from "../../../shared/contract";

const OPTIONS: { value: StudyMode; label: string; hint: string }[] = [
  { value: "flashcards", label: "Flashcards", hint: "Flip & recall" },
  { value: "quiz", label: "Quiz", hint: "Multiple choice" },
  { value: "both", label: "Both", hint: "Cards + quiz" },
];

interface Props {
  value: StudyMode;
  onChange: (mode: StudyMode) => void;
}

/** Native radio group: arrow keys, focus and screen-reader semantics come for free. */
export function ModePicker({ value, onChange }: Props) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-semibold text-ink">What should we make?</legend>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => (
          <label key={o.value} className="relative block">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span className="flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-xl border border-line-strong bg-surface px-2 py-2 text-center transition-colors peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:ring-1 peer-checked:ring-accent peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent motion-reduce:transition-none">
              <span className="text-sm font-semibold text-ink sm:text-base">{o.label}</span>
              <span className="hidden text-xs text-ink-muted sm:block">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
