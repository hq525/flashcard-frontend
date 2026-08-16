import { useEffect, useState } from 'react';
import {
  useCreateSectionImage,
  useDeleteAnswerSection,
  useDeleteSectionImage,
  useSectionImages,
  useUpdateAnswerSection,
  useUpdateSectionImage,
} from '../../api/hooks';
import { uploadImageFile } from '../../api/resources';
import type { CardAnswerSection } from '../../api/types';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { errorMessage } from '../../components/ErrorBanner';
import { ArrowDownIcon, ArrowUpIcon } from '../../components/icons';
import { useToast } from '../../components/Toast';
import { ImageStrip, nextSequenceNumber } from './ImageStrip';
import type { StripImage } from './ImageStrip';

interface AnswerSectionEditorProps {
  section: CardAnswerSection;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function AnswerSectionEditor({
  section,
  index,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: AnswerSectionEditorProps) {
  const updateSection = useUpdateAnswerSection();
  const deleteSection = useDeleteAnswerSection();
  const images = useSectionImages(section.id);
  const createImage = useCreateSectionImage();
  const updateImage = useUpdateSectionImage();
  const deleteImage = useDeleteSectionImage();
  const { showToast } = useToast();

  const [title, setTitle] = useState(section.title);
  const [answer, setAnswer] = useState(section.answer);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Depend on primitives: list refetches recreate `section` objects, and an
  // identity dep would wipe in-progress edits on every cache invalidation.
  useEffect(() => {
    setTitle(section.title);
    setAnswer(section.answer);
  }, [section.id, section.title, section.answer]);

  const save = () =>
    updateSection.mutate(
      {
        id: section.id,
        body: { sequenceNumber: section.sequenceNumber, title: title.trim(), answer },
      },
      {
        onSuccess: () => showToast('Section saved', 'success'),
        onError: (err) => showToast(errorMessage(err)),
      },
    );

  // Sequence numbers are assigned locally so a multi-file batch doesn't race
  // the query cache between uploads.
  const uploadSectionImages = async (files: File[]) => {
    try {
      let sequenceNumber = nextSequenceNumber(images.data ?? []);
      for (const file of files) {
        const imageUrl = await uploadImageFile(file, 'answer');
        await createImage.mutateAsync({
          cardAnswerSectionID: section.id,
          sequenceNumber: sequenceNumber++,
          imageURL: imageUrl,
        });
      }
    } catch (err) {
      showToast(errorMessage(err));
    }
  };

  const swapImages = async (a: StripImage, b: StripImage) => {
    try {
      await Promise.all([
        updateImage.mutateAsync({
          id: a.id,
          body: { sequenceNumber: b.sequenceNumber, imageURL: a.imageURL },
        }),
        updateImage.mutateAsync({
          id: b.id,
          body: { sequenceNumber: a.sequenceNumber, imageURL: b.imageURL },
        }),
      ]);
    } catch (err) {
      showToast(errorMessage(err));
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center gap-y-2 justify-between">
        <h3 className="font-semibold">Section {index + 1}</h3>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            aria-label={`Move section ${index + 1} up`}
            disabled={isFirst}
            onClick={onMoveUp}
            className="flex min-w-11 items-center justify-center"
          >
            <ArrowUpIcon />
          </Button>
          <Button
            variant="ghost"
            aria-label={`Move section ${index + 1} down`}
            disabled={isLast}
            onClick={onMoveDown}
            className="flex min-w-11 items-center justify-center"
          >
            <ArrowDownIcon />
          </Button>
          <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
            Delete section
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-base focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none sm:text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Answer
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
            className="rounded-md border border-gray-300 px-3 py-2 text-base focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none sm:text-sm"
          />
        </label>
        <div className="flex justify-end">
          <Button onClick={save} disabled={updateSection.isPending}>
            Save section
          </Button>
        </div>
      </div>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <ImageStrip
          title={`Section ${index + 1} images`}
          images={images.data ?? []}
          onUpload={uploadSectionImages}
          onDelete={(image) =>
            deleteImage.mutate(image.id, { onError: (err) => showToast(errorMessage(err)) })
          }
          onSwap={swapImages}
        />
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete section"
        message="Delete this answer section? Its images will be deleted too."
        busy={deleteSection.isPending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() =>
          deleteSection.mutate(section.id, {
            onSuccess: () => setConfirmingDelete(false),
            onError: (err) => showToast(errorMessage(err)),
          })
        }
      />
    </div>
  );
}
