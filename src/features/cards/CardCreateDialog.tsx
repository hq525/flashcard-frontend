import { useEffect, useRef, useState } from 'react';
import { useCreateCard, useCreateQuestionImage, useTags } from '../../api/hooks';
import { uploadImageFile } from '../../api/resources';
import type { Card } from '../../api/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { errorMessage } from '../../components/ErrorBanner';
import { ChevronDownIcon, PlusIcon, XIcon } from '../../components/icons';
import { TagChip } from '../../components/TagChip';
import { useToast } from '../../components/Toast';

interface CardCreateDialogProps {
  deckId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (card: Card) => void;
}

interface PendingImage {
  file: File;
  previewUrl: string;
}

// No hard backend limit (uploads go straight to S3), but flashcard images
// have no business being bigger than this.
const maxImageBytes = 10 * 1024 * 1024;

const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

export function CardCreateDialog({ deckId, open, onClose, onCreated }: CardCreateDialogProps) {
  const tags = useTags();
  const createCard = useCreateCard();
  const createQuestionImage = useCreateQuestionImage();
  const { showToast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [question, setQuestion] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setQuestion('');
      setSelectedTagIds([]);
      setTagsOpen(false);
      setImages((prev) => {
        prev.forEach((img) => URL.revokeObjectURL(img.previewUrl));
        return [];
      });
    }
  }, [open]);

  const toggleTag = (id: string) =>
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );

  // accept="image/*" only guards the file picker; drops can contain anything.
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list);
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length < files.length) showToast('Only image files can be added');
    const sizedFiles = imageFiles.filter((file) => file.size <= maxImageBytes);
    if (sizedFiles.length < imageFiles.length) showToast('Images must be 10MB or smaller');

    const seen = new Set(images.map((img) => fileKey(img.file)));
    const freshFiles: File[] = [];
    for (const file of sizedFiles) {
      const key = fileKey(file);
      if (seen.has(key)) continue;
      seen.add(key);
      freshFiles.push(file);
    }
    if (freshFiles.length < sizedFiles.length) showToast('Image already added');
    if (freshFiles.length === 0) return;
    setImages((prev) => [
      ...prev,
      ...freshFiles.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    ]);
  };

  const removeImage = (index: number) =>
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });

  // The card exists once created; if an image upload fails after that, we
  // surface the error but still land on the editor, where uploads can be
  // retried.
  const uploadImages = async (card: Card) => {
    setUploading(true);
    try {
      for (const [i, img] of images.entries()) {
        setUploadingIndex(i);
        const imageURL = await uploadImageFile(img.file, 'question');
        await createQuestionImage.mutateAsync({
          cardID: card.id,
          sequenceNumber: i + 1,
          imageURL,
        });
      }
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setUploading(false);
    }
    onCreated(card);
  };

  const busy = createCard.isPending || uploading;

  // Backdrop click / Escape / Cancel all route through here: don't silently
  // discard a draft the user has started.
  const dirty = question.trim() !== '' || selectedTagIds.length > 0 || images.length > 0;
  const requestClose = () => {
    if (busy) return;
    if (dirty && !window.confirm('Discard this card?')) return;
    onClose();
  };

  return (
    <Dialog open={open} onClose={requestClose} title="New card">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createCard.mutate(
            { deckID: deckId, question: question.trim(), tags: selectedTagIds },
            {
              onSuccess: uploadImages,
              onError: (err) => showToast(errorMessage(err)),
            },
          );
        }}
        className="flex flex-col gap-4"
        // A file dropped outside the dropzone would otherwise navigate the
        // browser to it, losing the form state.
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
        // Pasting a copied image (screenshot, right-click-copy) anywhere in
        // the dialog adds it; text pastes fall through untouched.
        onPaste={(e) => {
          if (e.clipboardData.files.length === 0) return;
          e.preventDefault();
          addFiles(e.clipboardData.files);
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          <span className="after:ml-0.5 after:text-red-500 after:content-['*']">Question</span>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            required
            aria-required="true"
            className="rounded-md border border-gray-300 px-3 py-2 text-base focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none sm:text-sm"
          />
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-700">Tags</legend>
          <div className="relative">
            <button
              type="button"
              aria-label="Select tags"
              aria-expanded={tagsOpen}
              disabled={busy}
              onClick={() => setTagsOpen((o) => !o)}
              className="flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none disabled:cursor-not-allowed"
            >
              {selectedTagIds.length > 0 ? (
                (tags.data ?? [])
                  .filter((tag) => selectedTagIds.includes(tag.id))
                  .map((tag) => <TagChip key={tag.id} name={tag.name} />)
              ) : (
                <span className="text-gray-500">Select tags</span>
              )}
              <ChevronDownIcon className="ml-auto h-4 w-4 text-gray-400" />
            </button>
            {tagsOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setTagsOpen(false)} />
                <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-gray-200 bg-white p-2 shadow-lg">
                  {tags.data && tags.data.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {tags.data.map((tag) => (
                        <label
                          key={tag.id}
                          className="flex items-center gap-1.5 rounded px-1.5 py-2 text-sm hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTagIds.includes(tag.id)}
                            onChange={() => toggleTag(tag.id)}
                          />
                          {tag.name}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="px-1.5 py-1 text-sm text-gray-500">No tags available</p>
                  )}
                </div>
              </>
            )}
          </div>
        </fieldset>
        <div>
          <span className="mb-2 block text-sm font-medium text-gray-700">Images</span>
          <ul className="flex gap-3 overflow-x-auto pb-1">
            {images.map((img, i) => (
              <li key={img.previewUrl} className="flex shrink-0 flex-col items-center gap-1">
                <img
                  src={img.previewUrl}
                  alt={`Selected image ${i + 1}`}
                  className={`h-20 w-20 rounded-md border border-gray-200 object-cover ${
                    uploading && i === uploadingIndex ? 'animate-pulse motion-reduce:animate-none' : ''
                  } ${uploading && i > uploadingIndex ? 'opacity-40' : ''}`}
                />
                <Button
                  variant="ghost"
                  aria-label={`Remove image ${i + 1}`}
                  disabled={busy}
                  onClick={() => removeImage(i)}
                  className="flex min-w-11 items-center justify-center"
                >
                  <XIcon />
                </Button>
              </li>
            ))}
            <li className="shrink-0">
              <button
                type="button"
                aria-label="Drop images here or click to browse"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  addFiles(e.dataTransfer.files);
                }}
                className={`flex min-h-20 min-w-20 flex-col items-center justify-center gap-0.5 rounded-md border-2 border-dashed px-6 py-5 text-xs text-gray-500 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  dragOver ? 'border-indigo-500 bg-indigo-50 text-indigo-600' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                {/* pointer-events-none keeps children from firing dragleave
                    on the box while a file is dragged across them */}
                <PlusIcon className="pointer-events-none h-5 w-5" />
                <span className="pointer-events-none">Add image</span>
              </button>
            </li>
          </ul>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            aria-label="Card images file"
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={requestClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={!question.trim() || busy}>
            {uploading ? `Uploading ${uploadingIndex + 1}/${images.length}…` : 'Create'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
