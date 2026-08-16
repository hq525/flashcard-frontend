import { useState } from 'react';
import { Link } from 'react-router';
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '../../api/hooks';
import type { Category } from '../../api/types';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { EntityFormDialog } from '../../components/EntityFormDialog';
import { ErrorBanner, errorMessage } from '../../components/ErrorBanner';
import { PageLoading } from '../../components/Spinner';
import { useToast } from '../../components/Toast';

export function CategoriesPage() {
  const categories = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const { showToast } = useToast();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  if (categories.isPending) return <PageLoading />;
  if (categories.isError) {
    return <ErrorBanner error={categories.error} onRetry={() => categories.refetch()} />;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-y-2 justify-between">
        <h1 className="text-xl font-bold">Categories</h1>
        <Button onClick={() => setCreating(true)}>New category</Button>
      </div>

      {categories.data.length === 0 ? (
        <EmptyState message="No categories yet. Create one to get started." />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.data.map((category) => (
            <li
              key={category.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <Link
                to={`/categories/${category.id}`}
                className="font-semibold text-indigo-700 hover:underline"
              >
                {category.name}
              </Link>
              {category.description && (
                <p className="mt-1 text-sm text-gray-500">{category.description}</p>
              )}
              <div className="mt-3 flex gap-2">
                <Button variant="ghost" onClick={() => setEditing(category)}>
                  Edit
                </Button>
                <Button variant="ghost" onClick={() => setDeleting(category)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <EntityFormDialog
        open={creating}
        title="New category"
        busy={createCategory.isPending}
        onClose={() => setCreating(false)}
        onSubmit={(values) =>
          createCategory.mutate(values, {
            onSuccess: () => setCreating(false),
            onError: (err) => showToast(errorMessage(err)),
          })
        }
      />
      <EntityFormDialog
        open={editing !== null}
        title="Edit category"
        initial={editing ? { name: editing.name, description: editing.description } : undefined}
        busy={updateCategory.isPending}
        onClose={() => setEditing(null)}
        onSubmit={(values) =>
          updateCategory.mutate(
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
        title="Delete category"
        message={
          deleting
            ? `Delete "${deleting.name}"? All decks and cards inside it will be deleted too.`
            : ''
        }
        busy={deleteCategory.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleteCategory.mutate(deleting!.id, {
            onSuccess: () => setDeleting(null),
            onError: (err) => showToast(errorMessage(err)),
          })
        }
      />
    </div>
  );
}
