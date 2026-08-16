import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useCards, useCategory, useDeck, useDeleteCard, useTags } from '../../api/hooks';
import type { Card } from '../../api/types';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import type { Crumb } from '../../components/Breadcrumbs';
import { Button, buttonClassName } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner, errorMessage } from '../../components/ErrorBanner';
import { PageLoading } from '../../components/Spinner';
import { TagChip } from '../../components/TagChip';
import { useToast } from '../../components/Toast';
import { CardCreateDialog } from './CardCreateDialog';

export function CardsPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const deck = useDeck(deckId);
  const category = useCategory(deck.data?.categoryID);
  const cards = useCards(deckId ?? '');
  const tags = useTags();
  const deleteCard = useDeleteCard();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Card | null>(null);
  // Filter lives in the URL so it survives back-navigation and can be shared.
  const [searchParams, setSearchParams] = useSearchParams();
  const filterTagIds = searchParams.get('tags')?.split(',').filter(Boolean) ?? [];
  const setFilterTagIds = (ids: string[]) =>
    setSearchParams(ids.length > 0 ? { tags: ids.join(',') } : {}, { replace: true });

  if (deck.isPending || cards.isPending) return <PageLoading />;
  if (deck.isError) return <ErrorBanner error={deck.error} onRetry={() => deck.refetch()} />;
  if (cards.isError) return <ErrorBanner error={cards.error} onRetry={() => cards.refetch()} />;

  const tagName = (id: string) => tags.data?.find((tag) => tag.id === id)?.name;

  // Only offer tags that appear on at least one card in this deck.
  const usedTagIds = new Set(cards.data.flatMap((card) => card.tags ?? []));
  const filterTags = (tags.data ?? []).filter((tag) => usedTagIds.has(tag.id));

  const toggleFilterTag = (id: string) =>
    setFilterTagIds(
      filterTagIds.includes(id)
        ? filterTagIds.filter((t) => t !== id)
        : [...filterTagIds, id],
    );

  const visibleCards = cards.data.filter((card) =>
    filterTagIds.every((id) => (card.tags ?? []).includes(id)),
  );

  const crumbs: Crumb[] = [{ label: 'Home', to: '/' }];
  if (category.data) {
    crumbs.push({ label: category.data.name, to: `/categories/${category.data.id}` });
  }
  crumbs.push({ label: deck.data.name });

  return (
    <div>
      <Breadcrumbs items={crumbs} />
      <div className="mb-6 flex flex-wrap items-center gap-y-2 justify-between">
        <h1 className="text-xl font-bold">{deck.data.name}</h1>
        <div className="flex gap-2">
          <Link to={`/decks/${deckId}/study`} className={buttonClassName('primary')}>
            Study
          </Link>
          <Button variant="secondary" onClick={() => setCreating(true)}>
            New card
          </Button>
        </div>
      </div>

      {filterTags.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">Filter:</span>
          {filterTags.map((tag) => {
            const active = filterTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                aria-label={`Filter by ${tag.name}`}
                aria-pressed={active}
                onClick={() => toggleFilterTag(tag.id)}
                className={`min-h-8 touch-manipulation rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                }`}
              >
                {tag.name}
              </button>
            );
          })}
          {filterTagIds.length > 0 && (
            <Button variant="ghost" onClick={() => setFilterTagIds([])}>
              Clear
            </Button>
          )}
        </div>
      )}

      {cards.data.length === 0 ? (
        <EmptyState message="No cards yet. Create one to start building this deck." />
      ) : visibleCards.length === 0 ? (
        <EmptyState message="No cards match the selected tags." />
      ) : (
        <ul className="flex flex-col gap-3">
          {visibleCards.map((card) => (
            <li
              key={card.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  to={`/cards/${card.id}`}
                  className="font-medium text-indigo-700 hover:underline"
                >
                  {card.question}
                </Link>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {card.memorized && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Memorized
                    </span>
                  )}
                  {(card.tags ?? []).map((tagId) => {
                    const name = tagName(tagId);
                    return name ? <TagChip key={tagId} name={name} /> : null;
                  })}
                </div>
              </div>
              <Button variant="ghost" onClick={() => setDeleting(card)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}

      <CardCreateDialog
        deckId={deckId!}
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(card) => {
          setCreating(false);
          navigate(`/cards/${card.id}`);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete card"
        message="Delete this card? Its answer sections and images will be deleted too."
        busy={deleteCard.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleteCard.mutate(deleting!.id, {
            onSuccess: () => setDeleting(null),
            onError: (err) => showToast(errorMessage(err)),
          })
        }
      />
    </div>
  );
}
