import type { Card } from '../../api/types';

export type StudyMode = 'due' | 'all' | 'unmemorized';

export interface StudyOptions {
  mode: StudyMode;
  shuffle: boolean;
}

const dayMs = 24 * 60 * 60 * 1000;

// Legacy records carry 0 (attribute absent in DynamoDB): treat as box 1.
const clampBox = (box: number) => Math.min(Math.max(box, 1), 5);

// Leitner schedule: box 1..5 reviewed every 1, 2, 4, 8, 16 days.
const intervalMs = (box: number) => 2 ** (clampBox(box) - 1) * dayMs;

export function isDue(card: Card, now: Date): boolean {
  if (!card.lastAccessedDateTime) return true;
  const lastReview = new Date(card.lastAccessedDateTime).getTime();
  return now.getTime() - lastReview >= intervalMs(card.leitnerBox);
}

export function nextBox(box: number, gotIt: boolean): number {
  return gotIt ? Math.min(clampBox(box) + 1, 5) : 1;
}

export function buildSession(
  cards: Card[],
  opts: StudyOptions,
  now: Date = new Date(),
  random: () => number = Math.random,
): Card[] {
  let session: Card[];
  switch (opts.mode) {
    case 'due':
      // Weakest memories first, least recently reviewed within the same box
      // (never-reviewed cards sort oldest).
      session = cards
        .filter((c) => isDue(c, now))
        .sort((a, b) => {
          const boxDiff = clampBox(a.leitnerBox) - clampBox(b.leitnerBox);
          if (boxDiff !== 0) return boxDiff;
          const aTime = a.lastAccessedDateTime ? new Date(a.lastAccessedDateTime).getTime() : 0;
          const bTime = b.lastAccessedDateTime ? new Date(b.lastAccessedDateTime).getTime() : 0;
          return aTime - bTime;
        });
      break;
    case 'unmemorized':
      session = cards.filter((c) => !c.memorized);
      break;
    case 'all':
      session = [...cards];
      break;
  }
  if (opts.shuffle) {
    for (let i = session.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [session[i], session[j]] = [session[j], session[i]];
    }
  }
  return session;
}
