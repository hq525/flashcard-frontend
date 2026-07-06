import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import {
  useCard,
  useCategory,
  useCreateQuestionImage,
  useDeck,
  useDeleteQuestionImage,
  useQuestionImages,
  useTags,
  useUpdateCard,
  useUpdateQuestionImage,
} from '../../api/hooks';
import { uploadImageFile } from '../../api/resources';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import type { Crumb } from '../../components/Breadcrumbs';
import { Button } from '../../components/Button';
import { ErrorBanner, errorMessage } from '../../components/ErrorBanner';
import { PageLoading } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { ImageStrip, nextSequenceNumber } from './ImageStrip';
import type { StripImage } from './ImageStrip';

export function CardEditorPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const card = useCard(cardId);
  const deck = useDeck(card.data?.deckID);
  const category = useCategory(deck.data?.categoryID);
  const tags = useTags();
  const updateCard = useUpdateCard();
  const { showToast } = useToast();
  const questionImages = useQuestionImages(cardId ?? '');
  const createQuestionImage = useCreateQuestionImage();
  const updateQuestionImage = useUpdateQuestionImage();
  const deleteQuestionImage = useDeleteQuestionImage();

  const [question, setQuestion] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  useEffect(() => {
    if (card.data) {
      setQuestion(card.data.question);
      setSelectedTagIds(card.data.tags ?? []);
    }
  }, [card.data]);

  if (card.isPending) return <PageLoading />;
  if (card.isError) return <ErrorBanner error={card.error} onRetry={() => card.refetch()} />;

  const toggleTag = (id: string) =>
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );

  const save = () =>
    updateCard.mutate(
      {
        id: card.data.id,
        body: {
          question: question.trim(),
          tags: selectedTagIds,
          memorized: card.data.memorized,
          ...(card.data.lastAccessedDateTime
            ? { lastAccessedDateTime: card.data.lastAccessedDateTime }
            : {}),
        },
      },
      {
        onSuccess: () => showToast('Card saved', 'success'),
        onError: (err) => showToast(errorMessage(err)),
      },
    );

  const uploadQuestionImage = async (file: File) => {
    try {
      const imageUrl = await uploadImageFile(file, 'question');
      await createQuestionImage.mutateAsync({
        cardID: card.data.id,
        sequenceNumber: nextSequenceNumber(questionImages.data ?? []),
        imageURL: imageUrl,
      });
    } catch (err) {
      showToast(errorMessage(err));
    }
  };

  const swapQuestionImages = async (a: StripImage, b: StripImage) => {
    try {
      await Promise.all([
        updateQuestionImage.mutateAsync({
          id: a.id,
          body: { sequenceNumber: b.sequenceNumber, imageURL: a.imageURL },
        }),
        updateQuestionImage.mutateAsync({
          id: b.id,
          body: { sequenceNumber: a.sequenceNumber, imageURL: b.imageURL },
        }),
      ]);
    } catch (err) {
      showToast(errorMessage(err));
    }
  };

  const removeQuestionImage = (image: StripImage) =>
    deleteQuestionImage.mutate(image.id, { onError: (err) => showToast(errorMessage(err)) });

  const crumbs: Crumb[] = [{ label: 'Home', to: '/' }];
  if (category.data) {
    crumbs.push({ label: category.data.name, to: `/categories/${category.data.id}` });
  }
  if (deck.data) {
    crumbs.push({ label: deck.data.name, to: `/decks/${deck.data.id}` });
  }
  crumbs.push({ label: 'Edit card' });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Breadcrumbs items={crumbs} />
        <h1 className="text-xl font-bold">Edit card</h1>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Question</h2>
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
          <fieldset className="mt-4">
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
        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={!question.trim() || updateCard.isPending}>
            Save
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <ImageStrip
          title="Question images"
          images={questionImages.data ?? []}
          onUpload={uploadQuestionImage}
          onDelete={removeQuestionImage}
          onSwap={swapQuestionImages}
        />
      </section>
      {/* Answer sections: Task 14 */}
    </div>
  );
}
