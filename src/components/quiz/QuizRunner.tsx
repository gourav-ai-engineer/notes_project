import { useEffect, useReducer, useRef } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import type { QuizQuestion } from "../../../shared/contract";
import {
  computeScore,
  getWrongQuestions,
  initQuizSession,
  quizReducer,
} from "../../features/study/quizSession";
import { ProgressBar } from "../ui/ProgressBar";
import { primaryButton } from "../ui/buttons";
import { QuizResults } from "./QuizResults";

const LETTERS = ["A", "B", "C", "D"];

interface Props {
  questions: QuizQuestion[];
  kind: "quiz" | "retest";
  /** Called once when the last question is checked and the user moves on. */
  onFinish?: (wrong: QuizQuestion[]) => void;
  onRestart?: () => void;
  onRetestWrong: (wrong: QuizQuestion[]) => void;
}

/**
 * One question at a time. Selecting never advances; the user must Check, which
 * locks the answer and reveals correctness plus the explanation.
 */
export function QuizRunner({ questions, kind, onFinish, onRestart, onRetestWrong }: Props) {
  const [state, dispatch] = useReducer(quizReducer, questions, initQuizSession);
  const legendRef = useRef<HTMLLegendElement>(null);
  const firstRender = useRef(true);

  // Move focus to the new question after "Next" so keyboard users aren't left on a removed button.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    legendRef.current?.focus();
  }, [state.index]);

  const score = computeScore(state.answers, state.questions.length);
  const wrong = getWrongQuestions(state);

  if (state.finished) {
    return (
      <QuizResults
        score={score}
        kind={kind}
        onRestart={() => {
          dispatch({ type: "restart" });
          onRestart?.();
        }}
        onRetestWrong={() => onRetestWrong(wrong)}
      />
    );
  }

  const q = state.questions[state.index];
  const isLast = state.index === state.questions.length - 1;
  const lastAnswer = state.checked ? state.answers[state.answers.length - 1] : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 text-sm">
        <p className="font-semibold" data-testid="question-progress">
          Question {state.index + 1} of {state.questions.length}
        </p>
        <p className="text-ink-muted">
          <span className="capitalize">{q.difficulty}</span> · <span className="wrap-anywhere">{q.topic}</span>
        </p>
      </div>
      <ProgressBar value={state.index + (state.checked ? 1 : 0)} max={state.questions.length} label={`${kind === "retest" ? "Retest" : "Quiz"} progress`} />

      <fieldset className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-7">
        <legend ref={legendRef} tabIndex={-1} className="wrap-anywhere float-left w-full font-display text-xl leading-snug outline-none sm:text-2xl">
          {q.question}
        </legend>

        {/* clear-both: the legend is floated so it sits inside the fieldset padding, not on its border. */}
        <div className="clear-both space-y-2.5 pt-4">
          {q.options.map((option, i) => {
            const isSelected = state.selected === i;
            const isCorrect = i === q.correctIndex;
            const showCorrect = state.checked && isCorrect;
            const showWrong = state.checked && isSelected && !isCorrect;

            const tone = showCorrect
              ? "border-good bg-good-soft"
              : showWrong
                ? "border-bad bg-bad-soft"
                : isSelected
                  ? "border-accent bg-accent-soft"
                  : "border-line-strong bg-surface hover:bg-accent-soft/60";

            return (
              <label key={i} className="relative block">
                <input
                  type="radio"
                  name={`q-${q.id}`}
                  checked={isSelected}
                  disabled={state.checked}
                  onChange={() => dispatch({ type: "select", optionIndex: i })}
                  className="peer sr-only"
                />
                <span
                  className={`flex min-h-12 items-start gap-3 rounded-xl border px-4 py-3 transition-colors peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent motion-reduce:transition-none ${tone} ${state.checked ? "cursor-default" : "cursor-pointer"}`}
                >
                  <span aria-hidden="true" className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-semibold">
                    {LETTERS[i]}
                  </span>
                  {/* Badge sits under the text, not beside it, so long options keep their full width at 320px. */}
                  <span className="min-w-0 flex-1">
                    <span className="wrap-anywhere block">{option}</span>
                    {showCorrect && (
                      <span className="mt-1 flex items-center gap-1 text-sm font-semibold text-good">
                        <Check aria-hidden="true" size={18} /> Correct answer
                      </span>
                    )}
                    {showWrong && (
                      <span className="mt-1 flex items-center gap-1 text-sm font-semibold text-bad">
                        <X aria-hidden="true" size={18} /> Your answer
                      </span>
                    )}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Announced by screen readers when the answer is checked. */}
      <div role="status" aria-live="polite">
        {lastAnswer && (
          <div className={`rise-in rounded-card border p-4 sm:p-5 ${lastAnswer.correct ? "border-good/40 bg-good-soft" : "border-bad/40 bg-bad-soft"}`} data-testid="feedback">
            <p className={`flex items-center gap-2 font-display text-lg font-semibold ${lastAnswer.correct ? "text-good" : "text-bad"}`}>
              {lastAnswer.correct ? <Check aria-hidden="true" size={20} /> : <X aria-hidden="true" size={20} />}
              {lastAnswer.correct ? "Correct" : "Incorrect"}
            </p>
            {!lastAnswer.correct && (
              <p className="wrap-anywhere mt-1 text-sm">
                The correct answer is <strong>{LETTERS[q.correctIndex]}. {q.options[q.correctIndex]}</strong>
              </p>
            )}
            <p className="wrap-anywhere mt-2 text-sm text-ink">{q.explanation}</p>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        {state.checked ? (
          <button
            type="button"
            className={primaryButton}
            onClick={() => {
              if (isLast) onFinish?.(wrong);
              dispatch({ type: "next" });
            }}
          >
            {isLast ? "See results" : "Next question"}
            <ArrowRight aria-hidden="true" size={18} />
          </button>
        ) : (
          <button type="button" className={primaryButton} disabled={state.selected === null} onClick={() => dispatch({ type: "check" })}>
            Check answer
          </button>
        )}
      </div>
    </div>
  );
}
