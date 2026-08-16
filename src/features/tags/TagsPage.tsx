import { useState } from 'react';
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from '../../api/hooks';
import type { Tag } from '../../api/types';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { EntityFormDialog } from '../../components/EntityFormDialog';
import { ErrorBanner, errorMessage } from '../../components/ErrorBanner';
import { PageLoading } from '../../components/Spinner';
import { TagChip } from '../../components/TagChip';
import { useToast } from '../../components/Toast';

export function TagsPage() {
  const tags = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const { showToast } = useToast();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [deleting, setDeleting] = useState<Tag | null>(null);

  if (tags.isPending) return <PageLoading />;
  if (tags.isError) return <ErrorBanner error={tags.error} onRetry={() => tags.refetch()} />;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-y-2 justify-between">
        <h1 className="text-xl font-bold">Tags</h1>
        <Button onClick={() => setCreating(true)}>New tag</Button>
      </div>

      {tags.data.length === 0 ? (
        <EmptyState message="No tags yet. Tags help you group cards across decks." />
      ) : (
        <ul className="flex flex-col gap-2">
          {tags.data.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <TagChip name={tag.name} />
                {tag.description && <span className="text-sm text-gray-500">{tag.description}</span>}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setEditing(tag)}>
                  Edit
                </Button>
                <Button variant="ghost" onClick={() => setDeleting(tag)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <EntityFormDialog
        open={creating}
        title="New tag"
        busy={createTag.isPending}
        onClose={() => setCreating(false)}
        onSubmit={(values) =>
          createTag.mutate(values, {
            onSuccess: () => setCreating(false),
            onError: (err) => showToast(errorMessage(err)),
          })
        }
      />
      <EntityFormDialog
        open={editing !== null}
        title="Edit tag"
        initial={editing ? { name: editing.name, description: editing.description } : undefined}
        busy={updateTag.isPending}
        onClose={() => setEditing(null)}
        onSubmit={(values) =>
          updateTag.mutate(
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
        title="Delete tag"
        message={deleting ? `Delete tag "${deleting.name}"? Cards keep working; they just lose this tag label.` : ''}
        busy={deleteTag.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleteTag.mutate(deleting!.id, {
            onSuccess: () => setDeleting(null),
            onError: (err) => showToast(errorMessage(err)),
          })
        }
      />
    </div>
  );
}
