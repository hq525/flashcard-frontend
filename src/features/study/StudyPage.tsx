import { MediaImage } from '../../components/MediaImage';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import {
  useAnswerSections,
  useCards,
  useDeck,
  useQuestionImages,
  useSectionImages,
  useReviewCard,
  useReviewOptions,
  useRefreshReviewCard,
} from '../../api/hooks';
import type { Card, CardAnswerSection, ReviewCardRequest, ReviewRating } from '../../api/types';
import { Button, buttonClassName } from '../../components/Button';
import { ErrorBanner, errorMessage } from '../../components/ErrorBanner';
import { PageLoading } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { buildSession, isDue, needsSessionRepeat, formatInterval } from './session';
import type { StudyMode } from './session';
import { ApiError } from '../../api/client';

interface Counts {
  studied: string[];
  recalled: number;
  again: number;
  reviews: number;
}

type Phase =
  | { name: 'setup' }
  | ({ name: 'active'; queue: Card[]; pending: Card[]; total: number; revealed: boolean } & Counts)
  | ({ name: 'summary'; scheduled: number } & Counts);

const ratings: { rating: ReviewRating; label: string; description: string }[] = [
  { rating: 'again', label: 'Again', description: 'Forgot' },
  { rating: 'hard', label: 'Hard', description: 'Recalled with effort' },
  { rating: 'good', label: 'Good', description: 'Recalled' },
  { rating: 'easy', label: 'Easy', description: 'Recalled easily' },
];

export function StudyPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const deck = useDeck(deckId);
  const cards = useCards(deckId ?? '');
  const reviewCard = useReviewCard();
  const refreshCard = useRefreshReviewCard();
  const { showToast } = useToast();

  const [shuffle, setShuffle] = useState(false);
  const [mode, setMode] = useState<StudyMode>('due');
  const [phase, setPhase] = useState<Phase>({ name: 'setup' });
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const [failedRequest, setFailedRequest] = useState<ReviewCardRequest | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const requestRef = useRef<ReviewCardRequest | null>(null);
  const saving = useRef(false);
  const currentCard = phase.name === 'active' ? phase.queue[0] : undefined;
  const options = useReviewOptions(currentCard, phase.name === 'active' && phase.revealed && !needsRefresh);
  const hasPending = phase.name === 'active' && phase.pending.length > 0;
  const hasUpcoming = phase.name === 'setup' && (cards.data ?? []).some(
    (card) => card.schedule && Date.parse(card.schedule.dueAt) > Date.now(),
  );
  const watchClock = hasPending || hasUpcoming;

  useEffect(() => {
    if (!watchClock) return;
    setNow(Date.now());
    const timer = window.setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      setPhase((current) => {
        if (current.name !== 'active') return current;
        const ready = current.pending.filter((card) => isDue(card, new Date(tick)));
        if (ready.length === 0) return current;
        return { ...current, queue: [...current.queue, ...ready],
          pending: current.pending.filter((card) => !ready.includes(card)) };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [watchClock]);

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
    requestRef.current = null;
    setFailedRequest(null);
    setNeedsRefresh(false);
    setPhase({ name: 'active', queue, pending: [], total: queue.length, revealed: false,
      studied: [], recalled: 0, again: 0, reviews: 0 });
  };

  const refreshCurrent = async () => {
    if (!currentCard) return;
    setNeedsRefresh(true);
    try {
      const refreshed = await refreshCard.mutateAsync(currentCard.id);
      setPhase((current) => current.name === 'active'
        ? { ...current, queue: current.queue.map((card) => card.id === refreshed.id ? refreshed : card) }
        : current);
      setNeedsRefresh(false);
    } catch (err) {
      showToast(errorMessage(err));
    }
  };

  const answer = async (rating: ReviewRating) => {
    if (phase.name !== 'active' || !currentCard || saving.current || needsRefresh || !options.data) return;
    // Keep this exact request after an ambiguous network failure: the server may
    // have saved it even when the browser never received the response.
    const request = requestRef.current ?? {
      reviewId: crypto.randomUUID(), rating, expectedRevision: options.data.revision,
    };
    requestRef.current = request;
    saving.current = true;
    try {
      const response = await reviewCard.mutateAsync({ id: currentCard.id, body: request });
      requestRef.current = null;
      setFailedRequest(null);
      setZoomUrl(null);
      setNow(Date.now());
      setPhase((current) => {
        if (current.name !== 'active') return current;
        const queue = current.queue.slice(1);
        const pending = [...current.pending];
        if (needsSessionRepeat(response.card, response.review.reviewedAt)) pending.push(response.card);
        const counts = {
          studied: current.studied.includes(currentCard.id) ? current.studied : [...current.studied, currentCard.id],
          recalled: current.recalled + (request.rating === 'again' ? 0 : 1),
          again: current.again + (request.rating === 'again' ? 1 : 0),
          reviews: current.reviews + 1,
        };
        if (queue.length === 0 && pending.length === 0) return { name: 'summary', scheduled: 0, ...counts };
        return { ...current, queue, pending, revealed: false, ...counts };
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        requestRef.current = null;
        setFailedRequest(null);
        showToast('This card changed. Refreshing its review options.');
        await refreshCurrent();
      } else {
        setFailedRequest(request);
        showToast(errorMessage(err));
      }
    } finally {
      saving.current = false;
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
        <p className="text-sm text-gray-700">Cards studied: {phase.studied.length}</p>
        <p className="text-sm text-gray-700">Reviews saved: {phase.reviews}</p>
        <p className="text-sm text-gray-700">Recalled: {phase.recalled}</p>
        <p className="mb-6 text-sm text-gray-700">Forgot: {phase.again}</p>
        {phase.scheduled > 0 && <p className="mb-4 text-sm text-gray-500">
          {phase.scheduled} {phase.scheduled === 1 ? 'card' : 'cards'} scheduled for later. Your progress is saved.
        </p>}
        <div className="flex justify-center gap-3">
          <Button onClick={() => setPhase({ name: 'setup' })}>Study again</Button>
          <Link to={`/decks/${deckId}`} className={buttonClassName('secondary')}>Back to deck</Link>
        </div>
      </div>
    );
  }

  if (!currentCard) {
    const nextDue = Math.min(...phase.pending.map((card) => Date.parse(card.schedule!.dueAt)));
    const seconds = Math.max(0, Math.ceil((nextDue - now) / 1000));
    const countdown = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-bold">A short break before your next review</h1>
        <p className="text-lg tabular-nums">Next review in {countdown}</p>
        <p className="text-sm text-gray-500">{phase.pending.length} pending · Reviews saved: {phase.reviews}</p>
        <p className="text-sm text-gray-500">Your progress is saved. You can return when these cards are due.</p>
        <Button onClick={() => setPhase({ name: 'summary', scheduled: phase.pending.length,
          studied: phase.studied, recalled: phase.recalled, again: phase.again, reviews: phase.reviews })}>Finish now</Button>
      </div>
    );
  }

  const busy = reviewCard.isPending || refreshCard.isPending || needsRefresh;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="sr-only">Studying {deck.data.name}</h1>
      {zoomUrl && <Lightbox url={zoomUrl} onClose={() => setZoomUrl(null)} />}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          <p>{phase.studied.includes(currentCard.id) ? 'Relearning' : `Card ${Math.min(phase.studied.length + 1, phase.total)} of ${phase.total}`}</p>
          <p>Reviews saved: {phase.reviews}{phase.pending.length > 0 ? ` · ${phase.pending.length} pending` : ''}</p>
        </div>
        <Link to={`/decks/${deckId}`} className={buttonClassName('ghost')}>Quit</Link>
      </div>
      <div>
        <FlipCard
          key={currentCard.id}
          flipped={phase.revealed}
          onFlip={() => setPhase((current) => current.name === 'active' ? { ...current, revealed: !current.revealed } : current)}
          front={<>
            <FaceLabel>Question</FaceLabel>
            <p className="text-lg font-medium wrap-break-word whitespace-pre-wrap">{currentCard.question}</p>
            <StudyQuestionImages cardId={currentCard.id} onZoom={setZoomUrl} />
          </>}
          back={<>
            <FaceLabel>Answer</FaceLabel>
            <StudyAnswerSections cardId={currentCard.id} onZoom={setZoomUrl} />
          </>}
        />
        <p className="mt-2 text-center text-xs text-gray-400">Click the card to flip it</p>
      </div>
      {phase.revealed && <div className="flex flex-col gap-3">
        {options.isPending && !needsRefresh && <p role="status" className="text-center text-sm text-gray-500">Loading review intervals…</p>}
        {options.isError && <ErrorBanner error={options.error} onRetry={() => options.refetch()} />}
        {needsRefresh && <Button onClick={refreshCurrent} disabled={refreshCard.isPending}>Refresh card</Button>}
        {options.data && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ratings.map(({ rating, label, description }) => {
            const option = options.data.options.find((option) => option.rating === rating);
            return <Button key={rating} variant={rating === 'good' ? 'primary' : 'secondary'}
              className="flex-col gap-1 py-3 text-center" onClick={() => answer(rating)}
              aria-label={`${label} ${description} ${option ? formatInterval(option.intervalSeconds) : 'Unavailable'}`}
              disabled={busy || !!failedRequest || !option}>
              <span className="font-semibold">{label}</span>
              <span className="text-xs">{description}</span>
              <span className="text-xs">{option ? formatInterval(option.intervalSeconds) : 'Unavailable'}</span>
            </Button>;
          })}
        </div>}
        {failedRequest && <div className="text-center">
          <p className="mb-2 text-sm text-gray-600">Your answer has not been confirmed. Retry to save it safely.</p>
          <Button onClick={() => answer(failedRequest.rating)} disabled={busy}>Retry saving {failedRequest.rating}</Button>
        </div>}
      </div>}
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
      {/* A div with button semantics rather than a real <button>: the faces
          contain zoomable-image buttons, and buttons can't nest. */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Flip card"
        aria-pressed={flipped}
        onClick={onFlip}
        onKeyDown={(e) => {
          // Ignore keys bubbling from the image buttons inside the faces.
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onFlip();
          }
        }}
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
      </div>
    </div>
  );
}

function StudyQuestionImages({ cardId, onZoom }: { cardId: string; onZoom: (url: string) => void }) {
  const images = useQuestionImages(cardId);
  const sorted = [...(images.data ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  if (sorted.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {sorted.map((img, i) => (
        <ZoomableImage
          key={img.id}
          src={img.imageURL}
          alt={`Question image ${i + 1}`}
          onZoom={onZoom}
        />
      ))}
    </div>
  );
}

function StudyAnswerSections({ cardId, onZoom }: { cardId: string; onZoom: (url: string) => void }) {
  const sections = useAnswerSections(cardId);
  const sorted = [...(sections.data ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  if (sorted.length === 0) {
    return <p className="text-center text-sm text-gray-500">This card has no answer sections.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {sorted.map((section) => (
        <StudySectionView key={section.id} section={section} onZoom={onZoom} />
      ))}
    </div>
  );
}

function StudySectionView({
  section,
  onZoom,
}: {
  section: CardAnswerSection;
  onZoom: (url: string) => void;
}) {
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
            <ZoomableImage
              key={img.id}
              src={img.imageURL}
              alt={`${section.title || 'Answer'} image ${i + 1}`}
              lazy
              onZoom={onZoom}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// A tap on the image zooms it; stopPropagation keeps the tap from reaching
// the flip card's click handler.
function ZoomableImage({
  src,
  alt,
  lazy,
  onZoom,
}: {
  src: string;
  alt: string;
  lazy?: boolean;
  onZoom: (url: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Enlarge ${alt}`}
      onClick={(e) => {
        e.stopPropagation();
        onZoom(src);
      }}
      className="block w-full cursor-zoom-in rounded-md focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
    >
      <MediaImage
        src={src}
        alt={alt}
        loading={lazy ? 'lazy' : undefined}
        // Natural full-width sizing; the flip card's height animation
        // absorbs load-time growth instead of snapping.
        className="w-full rounded-md border border-gray-200"
      />
    </button>
  );
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={onClose}
      className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-4"
    >
      <MediaImage src={url} alt="Enlarged view" className="max-h-full max-w-full rounded-md object-contain" />
    </div>
  );
}
