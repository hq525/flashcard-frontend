import type { Card } from '../../api/types';

export interface StudyOptions {
  shuffle: boolean;
  unmemorizedOnly: boolean;
}

export function buildSession(
  cards: Card[],
  opts: StudyOptions,
  random: () => number = Math.random,
): Card[] {
  const session = opts.unmemorizedOnly ? cards.filter((c) => !c.memorized) : [...cards];
  if (opts.shuffle) {
    for (let i = session.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [session[i], session[j]] = [session[j], session[i]];
    }
  }
  return session;
}
