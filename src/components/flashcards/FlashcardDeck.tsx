import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw, Shuffle, Star } from "lucide-react";
import type { CardStatus, LibraryCard } from "../../features/library/model";
import { ProgressBar } from "../ui/ProgressBar";
import { secondaryButton } from "../ui/buttons";

type Filter = "all" | "starred" | "unknown";

interface Props {
  cards: LibraryCard[];
  onToggleStar: (cardId: string) => void;
  onSetStatus: (cardId: string, status: CardStatus) => void;
  /** Called the first time the learner interacts, so the set counts toward today's streak. */
  onStudied?: () => void;
}

function shuffleIds(ids: string[]): string[] {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildDeck(cards: LibraryCard[], filter: Filter, shuffled: boolean): string[] {
  const picked = cards.filter((c) => (filter === "all" ? true : filter === "starred" ? c.starred : c.status !== "known")).map((c) => c.id);
  return shuffled ? shuffleIds(picked) : picked;
}

/**
 * One card at a time. The card is a real <button>, so Space/Enter flip it natively.
 * Arrow keys only work while the card itself has focus — there is no global key
 * handler, so typing in other fields is never hijacked.
 *
 * Which cards are in the deck is decided when the filter/shuffle changes (not on every progress
 * update), so marking a card "known" while viewing "Not known yet" doesn't make it vanish mid-review.
 */
export function FlashcardDeck({ cards, onToggleStar, onSetStatus, onStudied }: Props) {
  const hintId = useId();
  const filterId = useId();
  const [filter, setFilter] = useState<Filter>("all");
  const [shuffled, setShuffled] = useState(false);
  const [deckIds, setDeckIds] = useState<string[]>(() => cards.map((c) => c.id));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const studied = useRef(false);

  const byId = new Map(cards.map((c) => [c.id, c]));
  const deck = deckIds.map((id) => byId.get(id)).filter((c): c is LibraryCard => Boolean(c));
  const card = deck[Math.min(index, Math.max(0, deck.length - 1))];

  const counts = {
    all: cards.length,
    starred: cards.filter((c) => c.starred).length,
    unknown: cards.filter((c) => c.status !== "known").length,
  };
  const known = cards.length - counts.unknown;

  function markStudied() {
    if (!studied.current) {
      studied.current = true;
      onStudied?.();
    }
  }

  function applyView(nextFilter: Filter, nextShuffled: boolean) {
    setFilter(nextFilter);
    setShuffled(nextShuffled);
    setDeckIds(buildDeck(cards, nextFilter, nextShuffled));
    setIndex(0);
    setFlipped(false);
  }

  function go(delta: number) {
    const next = Math.min(deck.length - 1, Math.max(0, index + delta));
    if (next !== index) {
      setIndex(next);
      setFlipped(false);
    }
  }

  function mark(status: CardStatus) {
    markStudied();
    onSetStatus(card.id, status);
    go(1);
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

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={filterId} className="sr-only">
        Cards to study
      </label>
      <select
        id={filterId}
        value={filter}
        onChange={(e) => applyView(e.target.value as Filter, shuffled)}
        className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink"
      >
        <option value="all">All cards ({counts.all})</option>
        <option value="starred">Starred ({counts.starred})</option>
        <option value="unknown">Not known yet ({counts.unknown})</option>
      </select>
      <button type="button" aria-pressed={shuffled} onClick={() => applyView(filter, !shuffled)} className={`${secondaryButton} ${shuffled ? "border-accent bg-accent-soft" : ""}`}>
        <Shuffle aria-hidden="true" size={18} />
        Shuffle
      </button>
      <p className="ml-auto text-sm text-ink-muted" data-testid="known-summary">
        {known} of {cards.length} known
      </p>
    </div>
  );

  if (!card) {
    return (
      <div className="space-y-4">
        {controls}
        <div className="rounded-card border border-dashed border-line-strong p-8 text-center">
          <p className="font-display text-xl font-semibold">{filter === "starred" ? "No starred cards yet" : "Nothing left here"}</p>
          <p className="mt-1 text-ink-muted">
            {filter === "starred" ? "Tap the star on a card to collect the ones you want to revisit." : "Every card is marked as known. Great work!"}
          </p>
          <button type="button" onClick={() => applyView("all", false)} className={`${secondaryButton} mt-4`}>
            Show all cards
          </button>
        </div>
      </div>
    );
  }

  const position = Math.min(index, deck.length - 1);
  const isFirst = position === 0;
  const isLast = position === deck.length - 1;

  return (
    <div className="space-y-4">
      {controls}

      <div className="flex items-center justify-between gap-4 text-sm">
        <p className="font-semibold" data-testid="card-progress">
          Card {position + 1} of {deck.length}
        </p>
        <div className="flex min-w-0 items-center gap-3">
          <p className="min-w-0 text-ink-muted">
            <span className="capitalize">{card.difficulty}</span> · <span className="wrap-anywhere">{card.topic}</span>
            {card.status !== "new" && <span> · {card.status === "known" ? "Known" : "Learning"}</span>}
          </p>
          <button
            type="button"
            aria-pressed={card.starred}
            aria-label={card.starred ? "Unstar this card" : "Star this card"}
            onClick={() => onToggleStar(card.id)}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-accent-soft"
          >
            <Star aria-hidden="true" size={22} className={card.starred ? "fill-warm text-warm" : "text-ink-muted"} />
          </button>
        </div>
      </div>
      <ProgressBar value={position + 1} max={deck.length} label="Flashcard progress" />

      <button
        type="button"
        data-testid="flashcard"
        data-flipped={flipped}
        aria-describedby={hintId}
        onClick={() => {
          markStudied();
          setFlipped((f) => !f);
        }}
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
            <span className="text-xs font-semibold uppercase tracking-widest text-accent-ink">Answer</span>
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

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => mark("learning")} className={secondaryButton}>
          <RotateCcw aria-hidden="true" size={18} />
          Still learning
        </button>
        <button type="button" onClick={() => mark("known")} className={secondaryButton}>
          <Check aria-hidden="true" size={18} />I know it
        </button>
      </div>

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
