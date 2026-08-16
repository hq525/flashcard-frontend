import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  useCategory,
  useCreateDeck,
  useDecks,
  useDeleteDeck,
  useUpdateDeck,
} from '../../api/hooks';
import type { Deck } from '../../api/types';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { Button, buttonClassName } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { EntityFormDialog } from '../../components/EntityFormDialog';
import { ErrorBanner, errorMessage } from '../../components/ErrorBanner';
import { PageLoading } from '../../components/Spinner';
import { useToast } from '../../components/Toast';

export function DecksPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const category = useCategory(categoryId);
  const decks = useDecks(categoryId ?? '');
  const createDeck = useCreateDeck();
  const updateDeck = useUpdateDeck();
  const deleteDeck = useDeleteDeck();
  const { showToast } = useToast();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Deck | null>(null);
  const [deleting, setDeleting] = useState<Deck | null>(null);

  if (category.isPending || decks.isPending) return <PageLoading />;
  if (category.isError) {
    return <ErrorBanner error={category.error} onRetry={() => category.refetch()} />;
  }
  if (decks.isError) return <ErrorBanner error={decks.error} onRetry={() => decks.refetch()} />;

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: category.data.name }]} />
      <div className="mb-6 flex flex-wrap items-center gap-y-2 justify-between">
        <h1 className="text-xl font-bold">{category.data.name}</h1>
        <Button onClick={() => setCreating(true)}>New deck</Button>
      </div>

      {decks.data.length === 0 ? (
        <EmptyState message="No decks yet. Create one to start adding cards." />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decks.data.map((deck) => (
            <li key={deck.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <Link to={`/decks/${deck.id}`} className="font-semibold text-indigo-700 hover:underline">
                {deck.name}
              </Link>
              {deck.description && <p className="mt-1 text-sm text-gray-500">{deck.description}</p>}
              <div className="mt-3 flex items-center gap-2">
                <Link to={`/decks/${deck.id}/study`} className={buttonClassName('primary')}>
                  Study
                </Link>
                <Button variant="ghost" onClick={() => setEditing(deck)}>
                  Edit
                </Button>
                <Button variant="ghost" onClick={() => setDeleting(deck)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <EntityFormDialog
        open={creating}
        title="New deck"
        busy={createDeck.isPending}
        onClose={() => setCreating(false)}
        onSubmit={(values) =>
          createDeck.mutate(
            { categoryID: categoryId!, ...values },
            {
              onSuccess: () => setCreating(false),
              onError: (err) => showToast(errorMessage(err)),
            },
          )
        }
      />
      <EntityFormDialog
        open={editing !== null}
        title="Edit deck"
        initial={editing ? { name: editing.name, description: editing.description } : undefined}
        busy={updateDeck.isPending}
        onClose={() => setEditing(null)}
        onSubmit={(values) =>
          updateDeck.mutate(
            { id: editing!.id, body: values },
            {
              onSuccess: () => setEditing(null),
              onError: (err) => showToast(errorMessage(err)),
            },
          )
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete deck"
        message={
          deleting ? `Delete "${deleting.name}"? All cards in it will be deleted too.` : ''
        }
        busy={deleteDeck.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleteDeck.mutate(deleting!.id, {
            onSuccess: () => setDeleting(null),
            onError: (err) => showToast(errorMessage(err)),
          })
        }
      />
    </div>
  );
}
