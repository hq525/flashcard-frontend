import { useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, XIcon } from '../../components/icons';
import { useToast } from '../../components/Toast';

export interface StripImage {
  id: string;
  sequenceNumber: number;
  imageURL: string;
}

export function nextSequenceNumber(items: { sequenceNumber: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.sequenceNumber), 0) + 1;
}

// Same ceiling as the card-creation dialog.
const maxImageBytes = 10 * 1024 * 1024;

interface ImageStripProps {
  title: string;
  images: StripImage[];
  onUpload: (files: File[]) => void;
  onDelete: (image: StripImage) => void;
  onSwap: (a: StripImage, b: StripImage) => void;
}

export function ImageStrip({ title, images, onUpload, onDelete, onSwap }: ImageStripProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const [deleting, setDeleting] = useState<StripImage | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const sorted = [...images].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  // accept="image/*" only guards the file picker; drops can contain anything.
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list);
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length < files.length) showToast('Only image files can be added');
    const sizedFiles = imageFiles.filter((file) => file.size <= maxImageBytes);
    if (sizedFiles.length < imageFiles.length) showToast('Images must be 10MB or smaller');
    if (sizedFiles.length > 0) onUpload(sizedFiles);
  };

  return (
    <div>
      <h2 className="mb-3 font-semibold">{title}</h2>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {sorted.map((image, i) => (
          <li key={image.id} className="flex shrink-0 flex-col gap-1">
            <img
              src={image.imageURL}
              alt={`${title} ${i + 1}`}
              className="h-32 w-32 rounded-md border border-gray-200 object-cover"
            />
            <div className="flex justify-center gap-1">
              <Button
                variant="ghost"
                aria-label={`Move ${title} ${i + 1} left`}
                disabled={i === 0}
                onClick={() => onSwap(sorted[i - 1], image)}
                className="flex min-w-11 items-center justify-center"
              >
                <ArrowLeftIcon />
              </Button>
              <Button
                variant="ghost"
                aria-label={`Delete ${title} ${i + 1}`}
                onClick={() => setDeleting(image)}
                className="flex min-w-11 items-center justify-center"
              >
                <XIcon />
              </Button>
              <Button
                variant="ghost"
                aria-label={`Move ${title} ${i + 1} right`}
                disabled={i === sorted.length - 1}
                onClick={() => onSwap(image, sorted[i + 1])}
                className="flex min-w-11 items-center justify-center"
              >
                <ArrowRightIcon />
              </Button>
            </div>
          </li>
        ))}
        <li className="shrink-0">
          <button
            type="button"
            aria-label={`${title}: drop images or click to browse`}
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
            // Paste lands on whichever strip's dropzone is focused — with
            // several strips per page, an explicit target beats guessing.
            onPaste={(e) => {
              if (e.clipboardData.files.length === 0) return;
              e.preventDefault();
              addFiles(e.clipboardData.files);
            }}
            className={`flex h-32 w-32 flex-col items-center justify-center gap-0.5 rounded-md border-2 border-dashed text-xs text-gray-500 transition-colors ${
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
        aria-label={`${title} file`}
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete image"
        message="Delete this image? It will also be removed from storage."
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) onDelete(deleting);
          setDeleting(null);
        }}
      />
    </div>
  );
}
