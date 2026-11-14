import { PartyPopper, RotateCcw, Target } from "lucide-react";
import type { Score } from "../../features/study/quizSession";
import { primaryButton, secondaryButton } from "../ui/buttons";

interface Props {
  score: Score;
  /** "quiz" is the first attempt; "retest" is a pass over only the missed questions. */
  kind: "quiz" | "retest";
  onRestart: () => void;
  onRetestWrong: () => void;
}

export function QuizResults({ score, kind, onRestart, onRetestWrong }: Props) {
  const perfect = score.incorrect === 0;
  const noun = kind === "retest" ? "Retest" : "Quiz";

  return (
    <section aria-labelledby="results-heading" className="rise-in space-y-5 rounded-card border border-line bg-surface p-6 text-center shadow-card sm:p-8">
      <h3 id="results-heading" className="sr-only">
        {noun} results
      </h3>
      <p className="text-sm font-semibold uppercase tracking-widest text-warm">{noun} complete</p>
      <p className="font-display text-5xl font-semibold tabular-nums" data-testid="score">
        {score.correct} / {score.total}
      </p>
      <p className="text-ink-muted">{score.percent}% correct</p>

      <dl className="mx-auto grid max-w-xs grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-good-soft p-3">
          <dt className="font-medium text-good">Correct</dt>
          <dd className="text-xl font-semibold text-good" data-testid="correct-count">
            {score.correct}
          </dd>
        </div>
        <div className="rounded-xl bg-bad-soft p-3">
          <dt className="font-medium text-bad">Incorrect</dt>
          <dd className="text-xl font-semibold text-bad" data-testid="incorrect-count">
            {score.incorrect}
          </dd>
        </div>
      </dl>

      {perfect ? (
        <p className="flex items-center justify-center gap-2 font-medium text-good">
          <PartyPopper aria-hidden="true" size={20} />
          {kind === "retest" ? "You've now got every one of them right." : "Perfect score — nothing to retest!"}
        </p>
      ) : (
        <p className="text-sm text-ink-muted">Focus on the {score.incorrect} you missed and try them again.</p>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        {!perfect && (
          <button type="button" onClick={onRetestWrong} className={primaryButton}>
            <Target aria-hidden="true" size={18} />
            Retest wrong answers
          </button>
        )}
        <button type="button" onClick={onRestart} className={perfect ? primaryButton : secondaryButton}>
          <RotateCcw aria-hidden="true" size={18} />
          {kind === "retest" ? "Restart retest" : "Restart quiz"}
        </button>
      </div>
    </section>
  );
}
