import { makeCard } from '../../test/fixtures';
import { buildSession, isDue, nextBox } from './session';

const now = new Date('2026-08-16T12:00:00Z');
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

test('a never-reviewed card is due', () => {
  expect(isDue(makeCard({ lastAccessedDateTime: '' }), now)).toBe(true);
});

test('due follows doubling intervals per box (1, 2, 4, 8, 16 days)', () => {
  // Box 1: due after 1 day.
  expect(isDue(makeCard({ leitnerBox: 1, lastAccessedDateTime: daysAgo(1) }), now)).toBe(true);
  expect(isDue(makeCard({ leitnerBox: 1, lastAccessedDateTime: daysAgo(0.5) }), now)).toBe(false);
  // Box 3: due after 4 days.
  expect(isDue(makeCard({ leitnerBox: 3, lastAccessedDateTime: daysAgo(4) }), now)).toBe(true);
  expect(isDue(makeCard({ leitnerBox: 3, lastAccessedDateTime: daysAgo(3) }), now)).toBe(false);
  // Box 5: due after 16 days.
  expect(isDue(makeCard({ leitnerBox: 5, lastAccessedDateTime: daysAgo(16) }), now)).toBe(true);
  expect(isDue(makeCard({ leitnerBox: 5, lastAccessedDateTime: daysAgo(15) }), now)).toBe(false);
});

test('legacy cards without a box behave as box 1', () => {
  expect(isDue(makeCard({ leitnerBox: 0, lastAccessedDateTime: daysAgo(1) }), now)).toBe(true);
  expect(isDue(makeCard({ leitnerBox: 0, lastAccessedDateTime: daysAgo(0.5) }), now)).toBe(false);
  // A pre-Leitner backend omits the field entirely; still due like box 1.
  const noField = makeCard({ leitnerBox: undefined as unknown as number, lastAccessedDateTime: daysAgo(1) });
  expect(isDue(noField, now)).toBe(true);
});

test('nextBox promotes on success (capped at 5) and demotes to 1 on failure', () => {
  expect(nextBox(1, true)).toBe(2);
  expect(nextBox(4, true)).toBe(5);
  expect(nextBox(5, true)).toBe(5);
  expect(nextBox(4, false)).toBe(1);
  expect(nextBox(0, true)).toBe(2); // legacy 0 = box 1
});

test('due mode selects due cards, weakest box first then least recently seen', () => {
  const cards = [
    makeCard({ id: 'strong-due', leitnerBox: 4, lastAccessedDateTime: daysAgo(9) }),
    makeCard({ id: 'not-due', leitnerBox: 3, lastAccessedDateTime: daysAgo(1) }),
    makeCard({ id: 'weak-recent', leitnerBox: 1, lastAccessedDateTime: daysAgo(2) }),
    makeCard({ id: 'weak-old', leitnerBox: 1, lastAccessedDateTime: daysAgo(6) }),
    makeCard({ id: 'never-seen', leitnerBox: 1, lastAccessedDateTime: '' }),
  ];
  const session = buildSession(cards, { mode: 'due', shuffle: false }, now);
  expect(session.map((c) => c.id)).toEqual(['never-seen', 'weak-old', 'weak-recent', 'strong-due']);
});

test('all mode keeps every card in order; unmemorized mode filters', () => {
  const cards = [
    makeCard({ id: 'a', memorized: true }),
    makeCard({ id: 'b' }),
    makeCard({ id: 'c' }),
  ];
  expect(buildSession(cards, { mode: 'all', shuffle: false }, now).map((c) => c.id)).toEqual([
    'a',
    'b',
    'c',
  ]);
  expect(
    buildSession(cards, { mode: 'unmemorized', shuffle: false }, now).map((c) => c.id),
  ).toEqual(['b', 'c']);
});

test('shuffle permutes deterministically with an injected random and does not mutate input', () => {
  const cards = [makeCard({ id: 'a' }), makeCard({ id: 'b' }), makeCard({ id: 'c' })];
  const before = cards.map((c) => c.id);
  const session = buildSession(cards, { mode: 'all', shuffle: true }, now, () => 0);
  // random()=0: Fisher-Yates swaps (i=2,j=0) then (i=1,j=0): [a,b,c] -> [c,b,a] -> [b,c,a]
  expect(session.map((c) => c.id)).toEqual(['b', 'c', 'a']);
  expect(cards.map((c) => c.id)).toEqual(before);
});
