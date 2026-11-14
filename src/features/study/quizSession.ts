import type { QuizQuestion } from "../../../shared/contract";

export interface Answer {
  questionId: string;
  selectedIndex: number;
  correct: boolean;
}

export interface QuizSessionState {
  questions: QuizQuestion[];
  index: number;
  selected: number | null;
  checked: boolean;
  finished: boolean;
  answers: Answer[];
}

export type QuizAction =
  | { type: "select"; optionIndex: number }
  | { type: "check" }
  | { type: "next" }
  | { type: "restart" };

export function initQuizSession(questions: QuizQuestion[]): QuizSessionState {
  return { questions, index: 0, selected: null, checked: false, finished: false, answers: [] };
}

export function quizReducer(state: QuizSessionState, action: QuizAction): QuizSessionState {
  switch (action.type) {
    case "select":
      // Locked once checked: the answer can't be changed after seeing the result.
      if (state.checked || state.finished) return state;
      return { ...state, selected: action.optionIndex };

    case "check": {
      if (state.checked || state.finished || state.selected === null) return state;
      const question = state.questions[state.index];
      const answer: Answer = {
        questionId: question.id,
        selectedIndex: state.selected,
        correct: state.selected === question.correctIndex,
      };
      return { ...state, checked: true, answers: [...state.answers, answer] };
    }

    case "next": {
      if (!state.checked || state.finished) return state;
      const isLast = state.index >= state.questions.length - 1;
      return isLast
        ? { ...state, finished: true }
        : { ...state, index: state.index + 1, selected: null, checked: false };
    }

    case "restart":
      return initQuizSession(state.questions);
  }
}

export interface Score {
  total: number;
  correct: number;
  incorrect: number;
  percent: number;
}

export function computeScore(answers: Answer[], total: number): Score {
  const correct = answers.filter((a) => a.correct).length;
  return {
    total,
    correct,
    incorrect: answers.length - correct,
    percent: total === 0 ? 0 : Math.round((correct / total) * 100),
  };
}

/** The original questions (with original correct answer + explanation) that were answered wrongly. */
export function getWrongQuestions(state: QuizSessionState): QuizQuestion[] {
  const wrong = new Set(state.answers.filter((a) => !a.correct).map((a) => a.questionId));
  return state.questions.filter((q) => wrong.has(q.id));
}
