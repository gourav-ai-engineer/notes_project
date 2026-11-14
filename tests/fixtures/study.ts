/** Deterministic fixtures shared by unit, component and e2e tests. */
import type { GeneratedStudyContent, StudyMode, StudySet } from "../../shared/contract.ts";

export const SAMPLE_NOTES =
  "Photosynthesis converts light energy into chemical energy. It happens in chloroplasts, uses chlorophyll, and produces glucose and oxygen from carbon dioxide and water.";

export function makeContent(overrides: Partial<GeneratedStudyContent> = {}): GeneratedStudyContent {
  return {
    title: "Photosynthesis",
    summary: "How plants turn light, water and CO2 into glucose and oxygen.",
    flashcards: [
      { question: "Where does photosynthesis occur?", answer: "In the chloroplasts.", topic: "Location", difficulty: "easy" },
      { question: "Which pigment absorbs light?", answer: "Chlorophyll.", topic: "Pigments", difficulty: "easy" },
      { question: "What are the products?", answer: "Glucose and oxygen.", topic: "Products", difficulty: "medium" },
    ],
    quiz: [
      {
        question: "Which organelle hosts photosynthesis?",
        options: ["Mitochondrion", "Chloroplast", "Nucleus", "Ribosome"],
        correctIndex: 1,
        explanation: "Chloroplasts contain chlorophyll and run photosynthesis.",
        topic: "Location",
        difficulty: "easy",
      },
      {
        question: "Which gas is released?",
        options: ["Nitrogen", "Carbon dioxide", "Oxygen", "Hydrogen"],
        correctIndex: 2,
        explanation: "Oxygen is a by-product of splitting water.",
        topic: "Products",
        difficulty: "easy",
      },
      {
        question: "What does chlorophyll do?",
        options: ["Stores glucose", "Absorbs light", "Splits DNA", "Makes protein"],
        correctIndex: 1,
        explanation: "Chlorophyll absorbs light energy.",
        topic: "Pigments",
        difficulty: "medium",
      },
    ],
    ...overrides,
  };
}

/** Content as the model would return it for a given mode (unrequested arrays empty). */
export function makeContentFor(mode: StudyMode): GeneratedStudyContent {
  const c = makeContent();
  return {
    ...c,
    flashcards: mode === "quiz" ? [] : c.flashcards,
    quiz: mode === "flashcards" ? [] : c.quiz,
  };
}

export function makeStudySet(overrides: Partial<StudySet> = {}): StudySet {
  const c = makeContent();
  return {
    id: "set-1",
    title: c.title,
    summary: c.summary,
    mode: "both",
    flashcards: c.flashcards.map((f, i) => ({ id: `f${i + 1}`, ...f })),
    quiz: c.quiz.map((q, i) => ({
      id: `q${i + 1}`,
      ...q,
      options: q.options as [string, string, string, string],
      correctIndex: q.correctIndex as 0 | 1 | 2 | 3,
    })),
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
