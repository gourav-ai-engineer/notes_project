import { LIMITS } from "../../../shared/contract";
import type { LibraryCard } from "./model";

/**
 * Turns cards into notes text for "make a quiz from these cards". Stops before the notes limit
 * (never cuts a card in half) and reports how many cards made it in.
 */
export function cardsToNotes(cards: Pick<LibraryCard, "question" | "answer">[]): { text: string; used: number } {
  const parts: string[] = [];
  let length = 0;
  for (const c of cards) {
    const block = `Q: ${c.question}\nA: ${c.answer}`;
    const next = length + (parts.length ? 2 : 0) + block.length;
    if (next > LIMITS.notesMax) break;
    parts.push(block);
    length = next;
  }
  return { text: parts.join("\n\n"), used: parts.length };
}
