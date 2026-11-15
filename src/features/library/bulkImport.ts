import type { DraftCard } from "./model";

export interface BulkResult {
  cards: DraftCard[];
  /** Non-empty lines with no recognisable separator. */
  skipped: number;
}

/**
 * Turns pasted lines into cards. Accepts, in order of preference per line:
 *   term<TAB>definition   (copied from a spreadsheet)
 *   term :: definition
 *   term - definition     (spaced hyphen, en dash or em dash)
 *   term: definition
 */
export function parseBulkCards(text: string): BulkResult {
  const cards: DraftCard[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const split = splitLine(line);
    if (split && split[0] && split[1]) cards.push({ question: split[0], answer: split[1] });
    else skipped += 1;
  }
  return { cards, skipped };
}

function splitLine(line: string): [string, string] | null {
  const tab = line.indexOf("\t");
  if (tab > 0) return [line.slice(0, tab).trim(), line.slice(tab + 1).trim()];
  for (const sep of [" :: ", " - ", " – ", " — ", ": "]) {
    const i = line.indexOf(sep);
    if (i > 0) return [line.slice(0, i).trim(), line.slice(i + sep.length).trim()];
  }
  return null;
}
