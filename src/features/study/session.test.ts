import { makeCard, makeSchedule } from '../../test/fixtures';
import { buildSession, isDue } from './session';

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

test('due mode selects oldest due cards first using preserved legacy due dates', () => {
  const cards = [
    makeCard({ id: 'strong-due', leitnerBox: 4, lastAccessedDateTime: daysAgo(9) }),
    makeCard({ id: 'not-due', leitnerBox: 3, lastAccessedDateTime: daysAgo(1) }),
    makeCard({ id: 'weak-recent', leitnerBox: 1, lastAccessedDateTime: daysAgo(2) }),
    makeCard({ id: 'weak-old', leitnerBox: 1, lastAccessedDateTime: daysAgo(6) }),
    makeCard({ id: 'never-seen', leitnerBox: 1, lastAccessedDateTime: '' }),
  ];
  const session = buildSession(cards, { mode: 'due', shuffle: false }, now);
  expect(session.map((c) => c.id)).toEqual(['never-seen', 'weak-old', 'strong-due', 'weak-recent']);
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

test('persisted FSRS due time overrides legacy boxes and last access', () => {
  const card = makeCard({ lastAccessedDateTime: '', schedule: makeSchedule({ dueAt: '2026-08-16T12:10:00Z' }) });
  expect(isDue(card, now)).toBe(false);
  expect(isDue(card, new Date('2026-08-16T12:10:00Z'))).toBe(true);
});

test('invalid legacy or persisted dates are due immediately', () => {
  expect(isDue(makeCard({ lastAccessedDateTime: 'invalid' }), now)).toBe(true);
  expect(isDue(makeCard({ schedule: makeSchedule({ dueAt: 'invalid' }) }), now)).toBe(true);
});

test('due mode resumes persisted learning cards only once their due time arrives', () => {
  const card = makeCard({ schedule: makeSchedule({ state: 'learning', dueAt: '2026-08-16T12:10:00Z' }) });
  expect(buildSession([card], { mode: 'due', shuffle: false }, now)).toEqual([]);
  expect(buildSession([card], { mode: 'due', shuffle: false }, new Date('2026-08-16T12:10:00Z'))).toEqual([card]);
});


test('future or zero legacy dates are due immediately', () => {
  expect(isDue(makeCard({ lastAccessedDateTime: '2027-01-01T00:00:00Z', leitnerBox: 5 }), now)).toBe(true);
  expect(isDue(makeCard({ lastAccessedDateTime: '0001-01-01T00:00:00Z' }), now)).toBe(true);
});


test('FSRS due ordering ignores stale Leitner boxes', () => {
  const cards = [
    makeCard({ id: 'later', leitnerBox: 1, schedule: makeSchedule({ dueAt: '2026-08-16T11:00:00Z' }) }),
    makeCard({ id: 'earlier', leitnerBox: 5, schedule: makeSchedule({ dueAt: '2026-08-15T12:00:00Z' }) }),
  ];
  expect(buildSession(cards, { mode: 'due', shuffle: false }, now).map(card => card.id)).toEqual(['earlier', 'later']);
});
