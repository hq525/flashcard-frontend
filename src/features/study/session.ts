import type { Card } from '../../api/types';

export type StudyMode = 'due' | 'all' | 'unmemorized';

export interface StudyOptions {
  mode: StudyMode;
  shuffle: boolean;
}

const dayMs = 24 * 60 * 60 * 1000;

// Legacy records carry 0 (attribute absent in DynamoDB) and a pre-Leitner
// backend omits the field entirely (undefined): both mean box 1.
const clampBox = (box: number | undefined) => Math.min(Math.max(box || 1, 1), 5);

// Leitner schedule: box 1..5 reviewed every 1, 2, 4, 8, 16 days.
const intervalMs = (box: number) => 2 ** (clampBox(box) - 1) * dayMs;

function dueTime(card: Card, now: Date): number {
  if (card.schedule) {
    const due = Date.parse(card.schedule.dueAt);
    return Number.isFinite(due) ? due : -Infinity;
  }
  const lastReview = Date.parse(card.lastAccessedDateTime);
  if (!Number.isFinite(lastReview) || lastReview > now.getTime()) return -Infinity;
  return lastReview + intervalMs(card.leitnerBox);
}

export function isDue(card: Card, now: Date): boolean {
  return dueTime(card, now) <= now.getTime();
}

// Only short server-assigned learning steps stay inside the current session.
export function needsSessionRepeat(card: Card, reviewedAt: string): boolean {
  const schedule = card.schedule;
  return !!schedule && (schedule.state === 'learning' || schedule.state === 'relearning')
    && Date.parse(schedule.dueAt) - Date.parse(reviewedAt) <= dayMs;
}

export function formatInterval(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.ceil(seconds))} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hr`;
  const days = Math.round(seconds / 86400);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
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
      // Persisted due times are authoritative; legacy cards use their original
      // due dates until reviewed. Never-reviewed cards come first.
      session = cards
        .filter((c) => isDue(c, now))
        .sort((a, b) => dueTime(a, now) - dueTime(b, now));
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
