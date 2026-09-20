import { acceptedImageTypes, imageHelp, validateImageFile } from '../../api/media';
import { ApiError } from '../../api/client';
import { useEffect, useRef, useState } from 'react';
import { useCreateCard, useCreateQuestionImage, useTags } from '../../api/hooks';
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

const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

export function CardCreateDialog({ deckId, open, onClose, onCreated }: CardCreateDialogProps) {
  const tags = useTags();
  const createCard = useCreateCard();
  const createQuestionImage = useCreateQuestionImage();
  const { showToast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const previewUrls = useRef(new Set<string>());
  const [question, setQuestion] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState(0);
  const [createdCard, setCreatedCard] = useState<Card | null>(null);
  const [canContinue, setCanContinue] = useState(false);
  const nextUploadIndex = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

  // Locking keeps this component mounted. Discarding it (including logout)
  // must also release the browser's references to selected private files.
  useEffect(() => {
    const urls = previewUrls.current;
    return () => { urls.forEach((url) => URL.revokeObjectURL(url)); urls.clear(); };
  }, []);

  useEffect(() => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current.clear();
    setImages([]);
    setCreatedCard(null);
    setCanContinue(false);
    nextUploadIndex.current = 0;
    if (open) {
      setQuestion('');
      setSelectedTagIds([]);
      setTagsOpen(false);
    }
  }, [open]);

  const toggleTag = (id: string) =>
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );

  // accept={acceptedImageTypes} only guards the file picker; drops can contain anything.
  const addFiles = (list: FileList | null) => {
    if (!list || createdCard || createCard.isPending) return;
    const files = Array.from(list);
    const sizedFiles = files.filter((file) => {
      try { validateImageFile(file); return true; }
      catch (error) { showToast((error as Error).message); return false; }
    });

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
    const added = freshFiles.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      return { file, previewUrl };
    });
    setImages((prev) => [...prev, ...added]);
  };

  const removeImage = (index: number) => {
    const { previewUrl } = images[index];
    URL.revokeObjectURL(previewUrl);
    previewUrls.current.delete(previewUrl);
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Keep the saved card and confirmed progress in memory across session locks.
  // Resume only after an explicit click and a known authorization rejection;
  // an interrupted response can represent an upload that already committed.
  const uploadImages = async (card: Card) => {
    setCreatedCard(card);
    setCanContinue(false);
    setUploading(true);
    try {
      for (let i = nextUploadIndex.current; i < images.length; i++) {
        setUploadingIndex(i);
        await createQuestionImage.mutateAsync({
          cardID: card.id,
          sequenceNumber: i + 1,
          file: images[i].file,
        });
        nextUploadIndex.current = i + 1;
      }
    } catch (err) {
      setCanContinue(err instanceof ApiError && err.status === 401 && !err.outcomeUnknown);
      showToast(errorMessage(err));
      return;
    } finally {
      setUploading(false);
    }
    onCreated(card);
  };

  const busy = createCard.isPending || uploading;
  const fixedDraft = busy || createdCard !== null;

  // Backdrop click / Escape / Cancel all route through here: don't silently
  // discard a draft the user has started.
  const dirty = question.trim() !== '' || selectedTagIds.length > 0 || images.length > 0;
  const requestClose = () => {
    if (busy) return;
    if (createdCard) {
      if (window.confirm('Open the saved card and discard the remaining selected files? Check which images were saved before adding more.')) onCreated(createdCard);
      return;
    }
    if (dirty && !window.confirm('Discard this card?')) return;
    onClose();
  };

  return (
    <Dialog open={open} onClose={requestClose} title="New card">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          if (createdCard) {
            if (canContinue) void uploadImages(createdCard);
            return;
          }
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
            readOnly={fixedDraft}
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
              disabled={fixedDraft}
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
                            disabled={fixedDraft}
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
                  disabled={fixedDraft}
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
                disabled={fixedDraft}
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
          <p className="mt-2 text-xs text-gray-500">{imageHelp}</p>
          <input
            ref={fileInput}
            type="file"
            accept={acceptedImageTypes}
            multiple
            disabled={fixedDraft}
            aria-label="Card images file"
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        {createdCard && !uploading && <p role="status" className="text-sm text-gray-700">
          {canContinue
            ? 'Your card is saved. Continue uploading the remaining images after signing in, or open the saved card.'
            : 'Your card is saved. The interrupted upload may have completed. Open the saved card to check its images before adding more.'}
        </p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={requestClose} disabled={busy}>
            {createdCard ? 'Open saved card' : 'Cancel'}
          </Button>
          {(!createdCard || canContinue || uploading) && <Button type="submit" disabled={!question.trim() || busy}>
            {uploading ? `Uploading ${uploadingIndex + 1}/${images.length}…` : createdCard ? 'Continue uploads' : 'Create'}
          </Button>}
        </div>
      </form>
    </Dialog>
  );
}
