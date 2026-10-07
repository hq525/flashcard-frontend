import { CardViewer } from '../../components/CardViewer';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  useCards,
  useDeck,
  useReviewCard,
  useReviewOptions,
  useRefreshReviewCard,
} from '../../api/hooks';
import type { Card, ReviewCardRequest, ReviewRating } from '../../api/types';
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
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          <p>{phase.studied.includes(currentCard.id) ? 'Relearning' : `Card ${Math.min(phase.studied.length + 1, phase.total)} of ${phase.total}`}</p>
          <p>Reviews saved: {phase.reviews}{phase.pending.length > 0 ? ` · ${phase.pending.length} pending` : ''}</p>
        </div>
        <Link to={`/decks/${deckId}`} className={buttonClassName('ghost')}>Quit</Link>
      </div>
      <CardViewer
        key={currentCard.id}
        card={currentCard}
        flipped={phase.revealed}
        onFlip={() => setPhase((current) => current.name === 'active' ? { ...current, revealed: !current.revealed } : current)}
      />
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
