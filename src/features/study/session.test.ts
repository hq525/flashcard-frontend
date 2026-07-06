import { makeCard } from '../../test/fixtures';
import { buildSession } from './session';

const cards = [
  makeCard({ id: 'a', memorized: true }),
  makeCard({ id: 'b' }),
  makeCard({ id: 'c' }),
];

test('keeps order and all cards by default', () => {
  const session = buildSession(cards, { shuffle: false, unmemorizedOnly: false });
  expect(session.map((c) => c.id)).toEqual(['a', 'b', 'c']);
});

test('unmemorizedOnly filters out memorized cards', () => {
  const session = buildSession(cards, { shuffle: false, unmemorizedOnly: true });
  expect(session.map((c) => c.id)).toEqual(['b', 'c']);
});

test('shuffle permutes deterministically with an injected random and does not mutate input', () => {
  const before = cards.map((c) => c.id);
  const session = buildSession(cards, { shuffle: true, unmemorizedOnly: false }, () => 0);
  // random()=0: Fisher-Yates swaps (i=2,j=0) then (i=1,j=0): [a,b,c] -> [c,b,a] -> [b,c,a]
  expect(session.map((c) => c.id)).toEqual(['b', 'c', 'a']);
  expect(cards.map((c) => c.id)).toEqual(before);
});
