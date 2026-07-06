import { useEffect, useState } from 'react';
import { useCreateCard, useTags } from '../../api/hooks';
import type { Card } from '../../api/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { errorMessage } from '../../components/ErrorBanner';
import { useToast } from '../../components/Toast';

interface CardCreateDialogProps {
  deckId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (card: Card) => void;
}

export function CardCreateDialog({ deckId, open, onClose, onCreated }: CardCreateDialogProps) {
  const tags = useTags();
  const createCard = useCreateCard();
  const { showToast } = useToast();
  const [question, setQuestion] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setQuestion('');
      setSelectedTagIds([]);
    }
  }, [open]);

  const toggleTag = (id: string) =>
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );

  return (
    <Dialog open={open} onClose={onClose} title="New card">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createCard.mutate(
            { deckID: deckId, question: question.trim(), tags: selectedTagIds },
            {
              onSuccess: onCreated,
              onError: (err) => showToast(errorMessage(err)),
            },
          );
        }}
        className="flex flex-col gap-4"
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Question
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </label>
        {tags.data && tags.data.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-gray-700">Tags</legend>
            <div className="flex flex-wrap gap-3">
              {tags.data.map((tag) => (
                <label key={tag.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedTagIds.includes(tag.id)}
                    onChange={() => toggleTag(tag.id)}
                  />
                  {tag.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={createCard.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={!question.trim() || createCard.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
