import { useId, useState, type FormEvent, type Ref } from "react";
import { Sparkles } from "lucide-react";
import { LIMITS, validateNotes, type StudyMode } from "../../../shared/contract";
import { primaryButton } from "../ui/buttons";
import { ModePicker } from "./ModePicker";

const EXAMPLES = [
  { label: "Photosynthesis", text: "Photosynthesis: how plants turn light, water and carbon dioxide into glucose and oxygen." },
  { label: "French Revolution", text: "The French Revolution: causes, key events from 1789, and its consequences for Europe." },
  { label: "TCP vs UDP", text: "TCP vs UDP: differences in reliability, ordering, speed and typical use cases." },
  { label: "Big-O notation", text: "Big-O notation: common time complexities and how to compare algorithms." },
];

interface Props {
  notes: string;
  mode: StudyMode;
  onNotesChange: (notes: string) => void;
  onModeChange: (mode: StudyMode) => void;
  onSubmit: () => void;
  textareaRef?: Ref<HTMLTextAreaElement>;
}

export function InputPanel({ notes, mode, onNotesChange, onModeChange, onSubmit, textareaRef }: Props) {
  const ids = useId();
  const [showError, setShowError] = useState(false);

  const length = notes.trim().length;
  const problem = validateNotes(notes);
  const overBy = length - LIMITS.notesMax;
  const isOver = overBy > 0;
  const errorText = showError || isOver ? problem : null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (problem) {
      setShowError(true);
      return;
    }
    setShowError(false);
    onSubmit();
  }

  const describedBy = [`${ids}-help`, `${ids}-count`, errorText ? `${ids}-error` : null].filter(Boolean).join(" ");

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5" aria-label="Create a study set">
      <div>
        <label htmlFor={`${ids}-notes`} className="mb-1.5 block text-base font-semibold">
          Your notes or topic
        </label>
        <p id={`${ids}-help`} className="mb-2 text-sm text-ink-muted">
          Paste lecture notes, a textbook excerpt, or just describe a topic. No formatting needed.
        </p>
        {/* No maxLength on purpose: silently truncating pasted notes would lose text. */}
        <textarea
          ref={textareaRef}
          id={`${ids}-notes`}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={9}
          spellCheck
          aria-describedby={describedBy}
          aria-invalid={errorText ? true : undefined}
          className={`block w-full resize-y rounded-xl border bg-surface px-4 py-3 text-base leading-relaxed shadow-inner placeholder:text-ink-muted/70 ${
            errorText ? "border-bad" : "border-line-strong"
          }`}
          placeholder="e.g. The mitochondria is the site of cellular respiration. It produces ATP through..."
        />
        <div className="mt-1.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <p id={`${ids}-error`} role={errorText ? "alert" : undefined} className="min-h-5 text-sm font-medium text-bad">
            {errorText}
          </p>
          <p id={`${ids}-count`} className={`ml-auto text-sm tabular-nums ${isOver ? "font-semibold text-bad" : "text-ink-muted"}`}>
            {length.toLocaleString()} / {LIMITS.notesMax.toLocaleString()}
            {isOver ? ` (${overBy.toLocaleString()} over)` : length < LIMITS.notesMin ? ` · min ${LIMITS.notesMin}` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Example topics">
        <span className="text-sm text-ink-muted">Try a topic:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => {
              onNotesChange(ex.text);
              setShowError(false);
            }}
            className="min-h-9 rounded-full border border-line-strong bg-surface px-3.5 text-sm text-ink transition-colors hover:bg-accent-soft motion-reduce:transition-none"
          >
            {ex.label}
          </button>
        ))}
      </div>

      <ModePicker value={mode} onChange={onModeChange} />

      <button type="submit" disabled={isOver} className={`${primaryButton} w-full sm:w-auto`}>
        <Sparkles aria-hidden="true" size={18} />
        Generate study set
      </button>
    </form>
  );
}
