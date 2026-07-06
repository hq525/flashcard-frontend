import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  useAnswerSections,
  useCards,
  useDeck,
  useQuestionImages,
  useSectionImages,
  useUpdateCard,
} from '../../api/hooks';
import type { Card, CardAnswerSection } from '../../api/types';
import { Button } from '../../components/Button';
import { ErrorBanner, errorMessage } from '../../components/ErrorBanner';
import { PageLoading } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { buildSession } from './session';

type Phase =
  | { name: 'setup' }
  | { name: 'active'; queue: Card[]; index: number; revealed: boolean; gotIt: number; notYet: number }
  | { name: 'summary'; gotIt: number; notYet: number; total: number };

export function StudyPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const deck = useDeck(deckId);
  const cards = useCards(deckId ?? '');
  const updateCard = useUpdateCard();
  const { showToast } = useToast();

  const [shuffle, setShuffle] = useState(false);
  const [unmemorizedOnly, setUnmemorizedOnly] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: 'setup' });

  if (deck.isPending || cards.isPending) return <PageLoading />;
  if (deck.isError) return <ErrorBanner error={deck.error} onRetry={() => deck.refetch()} />;
  if (cards.isError) return <ErrorBanner error={cards.error} onRetry={() => cards.refetch()} />;

  const eligibleCount = unmemorizedOnly
    ? cards.data.filter((c) => !c.memorized).length
    : cards.data.length;

  const start = () => {
    const queue = buildSession(cards.data, { shuffle, unmemorizedOnly });
    if (queue.length === 0) return;
    setPhase({ name: 'active', queue, index: 0, revealed: false, gotIt: 0, notYet: 0 });
  };

  const answer = async (got: boolean) => {
    if (phase.name !== 'active') return;
    const card = phase.queue[phase.index];
    try {
      await updateCard.mutateAsync({
        id: card.id,
        body: {
          question: card.question,
          tags: card.tags ?? [],
          memorized: got,
          lastAccessedDateTime: new Date().toISOString(),
        },
      });
    } catch (err) {
      showToast(errorMessage(err));
      return;
    }
    const gotIt = phase.gotIt + (got ? 1 : 0);
    const notYet = phase.notYet + (got ? 0 : 1);
    if (phase.index + 1 >= phase.queue.length) {
      setPhase({ name: 'summary', gotIt, notYet, total: phase.queue.length });
    } else {
      setPhase({ ...phase, index: phase.index + 1, revealed: false, gotIt, notYet });
    }
  };

  if (phase.name === 'setup') {
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="mb-1 text-xl font-bold">Study: {deck.data.name}</h1>
        <p className="mb-6 text-sm text-gray-500">{cards.data.length} cards in this deck.</p>
        <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
            Shuffle
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={unmemorizedOnly}
              onChange={(e) => setUnmemorizedOnly(e.target.checked)}
            />
            Unmemorized only
          </label>
          {unmemorizedOnly && eligibleCount === 0 && (
            <p className="text-sm text-amber-700">
              All cards in this deck are memorized. Uncheck the filter to study them anyway.
            </p>
          )}
          <div className="mt-2 flex items-center justify-between">
            <Link to={`/decks/${deckId}`} className="text-sm text-gray-500 hover:underline">
              Back to deck
            </Link>
            <Button onClick={start} disabled={eligibleCount === 0}>
              Start studying
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase.name === 'summary') {
    return (
      <div className="mx-auto max-w-xl text-center">
        <h1 className="mb-4 text-xl font-bold">Session complete</h1>
        <p className="mb-1 text-sm text-gray-700">Got it: {phase.gotIt}</p>
        <p className="mb-6 text-sm text-gray-700">Not yet: {phase.notYet}</p>
        <div className="flex justify-center gap-3">
          <Button onClick={() => setPhase({ name: 'setup' })}>Study again</Button>
          <Link
            to={`/decks/${deckId}`}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to deck
          </Link>
        </div>
      </div>
    );
  }

  const card = phase.queue[phase.index];
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <p className="text-sm text-gray-500">
        Card {phase.index + 1} of {phase.queue.length}
      </p>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="whitespace-pre-wrap text-lg font-medium">{card.question}</p>
        <StudyQuestionImages cardId={card.id} />
      </div>
      {phase.revealed ? (
        <>
          <StudyAnswerSections cardId={card.id} />
          <div className="flex justify-center gap-3">
            <Button variant="secondary" onClick={() => answer(false)} disabled={updateCard.isPending}>
              Not yet
            </Button>
            <Button onClick={() => answer(true)} disabled={updateCard.isPending}>
              Got it
            </Button>
          </div>
        </>
      ) : (
        <div className="flex justify-center">
          <Button onClick={() => setPhase({ ...phase, revealed: true })}>Reveal answer</Button>
        </div>
      )}
    </div>
  );
}

function StudyQuestionImages({ cardId }: { cardId: string }) {
  const images = useQuestionImages(cardId);
  const sorted = [...(images.data ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  if (sorted.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {sorted.map((img, i) => (
        <img
          key={img.id}
          src={img.imageURL}
          alt={`Question image ${i + 1}`}
          className="max-h-64 rounded-md border border-gray-200"
        />
      ))}
    </div>
  );
}

function StudyAnswerSections({ cardId }: { cardId: string }) {
  const sections = useAnswerSections(cardId);
  const sorted = [...(sections.data ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  if (sorted.length === 0) {
    return <p className="text-center text-sm text-gray-500">This card has no answer sections.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {sorted.map((section) => (
        <StudySectionView key={section.id} section={section} />
      ))}
    </div>
  );
}

function StudySectionView({ section }: { section: CardAnswerSection }) {
  const images = useSectionImages(section.id);
  const sorted = [...(images.data ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      {section.title && <h3 className="mb-1 font-semibold">{section.title}</h3>}
      {section.answer && (
        <p className="whitespace-pre-wrap text-sm text-gray-700">{section.answer}</p>
      )}
      {sorted.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {sorted.map((img, i) => (
            <img
              key={img.id}
              src={img.imageURL}
              alt={`${section.title || 'Answer'} image ${i + 1}`}
              className="max-h-64 rounded-md border border-gray-200"
            />
          ))}
        </div>
      )}
    </div>
  );
}
