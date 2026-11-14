import { useId, useState, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Flashcard } from "../../../shared/contract";
import { ProgressBar } from "../ui/ProgressBar";
import { secondaryButton } from "../ui/buttons";

interface Props {
  cards: Flashcard[];
}

/**
 * One card at a time. The card is a real <button>, so Space/Enter flip it natively.
 * Arrow keys only work while the card itself has focus — there is no global key
 * handler, so typing in other fields is never hijacked.
 */
export function FlashcardDeck({ cards }: Props) {
  const hintId = useId();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const card = cards[index];
  const isFirst = index === 0;
  const isLast = index === cards.length - 1;

  function go(delta: number) {
    const next = Math.min(cards.length - 1, Math.max(0, index + delta));
    if (next !== index) {
      setIndex(next);
      setFlipped(false);
    }
  }

  function onCardKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 text-sm">
        <p className="font-semibold" data-testid="card-progress">
          Card {index + 1} of {cards.length}
        </p>
        <p className="text-ink-muted">
          <span className="capitalize">{card.difficulty}</span> · <span className="wrap-anywhere">{card.topic}</span>
        </p>
      </div>
      <ProgressBar value={index + 1} max={cards.length} label="Flashcard progress" />

      <button
        type="button"
        data-testid="flashcard"
        data-flipped={flipped}
        aria-describedby={hintId}
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={onCardKeyDown}
        className="flip-card block w-full rounded-card text-left"
      >
        <span className="flip-inner block min-h-64">
          <span
            className="flip-face flex flex-col justify-between gap-6 rounded-card border border-line bg-surface p-6 shadow-card sm:p-8"
            aria-hidden={flipped}
            inert={flipped}
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-warm">Question</span>
            <span className="wrap-anywhere font-display text-2xl leading-snug sm:text-3xl">{card.question}</span>
            <span className="text-sm text-ink-muted">Tap to reveal the answer</span>
          </span>
          <span
            className="flip-face flip-back flex flex-col justify-between gap-6 rounded-card border border-accent/40 bg-accent-soft p-6 shadow-card sm:p-8"
            aria-hidden={!flipped}
            inert={!flipped}
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-accent-strong">Answer</span>
            <span className="wrap-anywhere text-xl leading-relaxed sm:text-2xl">{card.answer}</span>
            <span className="text-sm text-ink-muted">Tap to see the question again</span>
          </span>
        </span>
      </button>
      <p id={hintId} className="sr-only">
        Press Enter or Space to flip the card. Use the left and right arrow keys, or the buttons below, to change card.
      </p>
      <p className="sr-only" aria-live="polite">
        {flipped ? `Answer: ${card.answer}` : ""}
      </p>

      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => go(-1)} disabled={isFirst} className={secondaryButton}>
          <ArrowLeft aria-hidden="true" size={18} />
          Previous
        </button>
        <button type="button" onClick={() => go(1)} disabled={isLast} className={secondaryButton}>
          Next
          <ArrowRight aria-hidden="true" size={18} />
        </button>
      </div>
    </div>
  );
}
