import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useCards, useCategory, useDeck, useDeleteCard, useTags } from '../../api/hooks';
import type { Card } from '../../api/types';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import type { Crumb } from '../../components/Breadcrumbs';
import { Button } from '../../components/Button';
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

  if (deck.isPending || cards.isPending) return <PageLoading />;
  if (deck.isError) return <ErrorBanner error={deck.error} onRetry={() => deck.refetch()} />;
  if (cards.isError) return <ErrorBanner error={cards.error} onRetry={() => cards.refetch()} />;

  const tagName = (id: string) => tags.data?.find((tag) => tag.id === id)?.name;

  const crumbs: Crumb[] = [{ label: 'Home', to: '/' }];
  if (category.data) {
    crumbs.push({ label: category.data.name, to: `/categories/${category.data.id}` });
  }
  crumbs.push({ label: deck.data.name });

  return (
    <div>
      <Breadcrumbs items={crumbs} />
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">{deck.data.name}</h1>
        <div className="flex gap-2">
          <Link
            to={`/decks/${deckId}/study`}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Study
          </Link>
          <Button variant="secondary" onClick={() => setCreating(true)}>
            New card
          </Button>
        </div>
      </div>

      {cards.data.length === 0 ? (
        <EmptyState message="No cards yet. Create one to start building this deck." />
      ) : (
        <ul className="flex flex-col gap-3">
          {cards.data.map((card) => (
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
