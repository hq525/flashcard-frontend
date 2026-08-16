import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
import { Button, buttonClassName } from '../../components/Button';
import { ErrorBanner, errorMessage } from '../../components/ErrorBanner';
import { PageLoading } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { buildSession, isDue, nextBox } from './session';
import type { StudyMode } from './session';

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
  const [mode, setMode] = useState<StudyMode>('due');
  const [phase, setPhase] = useState<Phase>({ name: 'setup' });

  if (deck.isPending || cards.isPending) return <PageLoading />;
  if (deck.isError) return <ErrorBanner error={deck.error} onRetry={() => deck.refetch()} />;
  if (cards.isError) return <ErrorBanner error={cards.error} onRetry={() => cards.refetch()} />;

  const dueCount = cards.data.filter((c) => isDue(c, new Date())).length;
  const eligibleCount = {
    due: dueCount,
    unmemorized: cards.data.filter((c) => !c.memorized).length,
    all: cards.data.length,
  }[mode];

  const start = () => {
    const queue = buildSession(cards.data, { mode, shuffle });
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
          leitnerBox: nextBox(card.leitnerBox, got),
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
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-gray-700">Cards to study</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="study-mode"
                checked={mode === 'due'}
                onChange={() => setMode('due')}
              />
              Due for review ({dueCount})
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="study-mode"
                checked={mode === 'all'}
                onChange={() => setMode('all')}
              />
              All cards
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="study-mode"
                checked={mode === 'unmemorized'}
                onChange={() => setMode('unmemorized')}
              />
              Unmemorized only
            </label>
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
            Shuffle
          </label>
          {mode === 'due' && eligibleCount === 0 && (
            <p className="text-sm text-amber-700">
              Nothing is due right now — every card is scheduled for later. Pick "All cards" to
              study anyway.
            </p>
          )}
          {mode === 'unmemorized' && eligibleCount === 0 && (
            <p className="text-sm text-amber-700">
              All cards in this deck are memorized. Pick another mode to study them anyway.
            </p>
          )}
          <div className="mt-2 flex items-center justify-between">
            <Link to={`/decks/${deckId}`} className={buttonClassName('secondary')}>
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
          <Link to={`/decks/${deckId}`} className={buttonClassName('secondary')}>
            Back to deck
          </Link>
        </div>
      </div>
    );
  }

  const card = phase.queue[phase.index];
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="sr-only">Studying {deck.data.name}</h1>
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Card {phase.index + 1} of {phase.queue.length}
        </p>
        {/* Progress saves per answer, so quitting mid-session loses nothing. */}
        <Link to={`/decks/${deckId}`} className={buttonClassName('ghost')}>
          Quit
        </Link>
      </div>
      <div>
        <FlipCard
          key={card.id}
          flipped={phase.revealed}
          onFlip={() => setPhase({ ...phase, revealed: !phase.revealed })}
          front={
            <>
              <FaceLabel>Question</FaceLabel>
              <p className="text-lg font-medium wrap-break-word whitespace-pre-wrap">{card.question}</p>
              <StudyQuestionImages cardId={card.id} />
            </>
          }
          back={
            <>
              <FaceLabel>Answer</FaceLabel>
              <StudyAnswerSections cardId={card.id} />
            </>
          }
        />
        <p className="mt-2 text-center text-xs text-gray-400">Click the card to flip it</p>
      </div>
      {phase.revealed && (
        <div className="flex justify-center gap-3">
          <Button variant="secondary" onClick={() => answer(false)} disabled={updateCard.isPending}>
            Not yet
          </Button>
          <Button onClick={() => answer(true)} disabled={updateCard.isPending}>
            Got it
          </Button>
        </div>
      )}
    </div>
  );
}

function FaceLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-xs font-medium tracking-wide text-gray-400 uppercase">{children}</p>
  );
}

// A 3D flip card. Both faces stay mounted (the answer pre-loads while the
// user thinks); the container's height is measured from the visible face and
// transitioned, so the card grows/shrinks smoothly instead of jumping.
function FlipCard({
  flipped,
  onFlip,
  front,
  back,
}: {
  flipped: boolean;
  onFlip: () => void;
  front: ReactNode;
  back: ReactNode;
}) {
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const face = flipped ? backRef.current : frontRef.current;
    if (!face) return;
    // Track the visible face's size: it changes when images finish loading.
    const update = () => {
      if (face.offsetHeight > 0) setHeight(face.offsetHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(face);
    return () => observer.disconnect();
  }, [flipped]);

  const faceClasses =
    'absolute inset-x-0 top-0 rounded-lg border border-gray-200 bg-white p-6 [backface-visibility:hidden]';

  return (
    <div className="perspective-distant">
      <button
        type="button"
        aria-label="Flip card"
        aria-pressed={flipped}
        onClick={onFlip}
        className="relative block w-full rounded-lg text-left transition-[transform,height] duration-300 transform-3d focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none motion-reduce:transition-none"
        style={{ height, transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        <div ref={frontRef} aria-hidden={flipped} className={faceClasses}>
          {front}
        </div>
        <div
          ref={backRef}
          aria-hidden={!flipped}
          className={`${faceClasses} transform-[rotateY(180deg)]`}
        >
          {back}
        </div>
      </button>
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
          // Natural full-width sizing; the flip card's height animation
          // absorbs load-time growth instead of snapping.
          className="w-full rounded-md border border-gray-200"
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
      {section.title && <h2 className="mb-1 font-semibold">{section.title}</h2>}
      {section.answer && (
        <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-700">{section.answer}</p>
      )}
      {sorted.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {sorted.map((img, i) => (
            <img
              key={img.id}
              src={img.imageURL}
              alt={`${section.title || 'Answer'} image ${i + 1}`}
              loading="lazy"
              className="w-full rounded-md border border-gray-200"
            />
          ))}
        </div>
      )}
    </div>
  );
}
