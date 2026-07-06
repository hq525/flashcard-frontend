import { useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';

export interface StripImage {
  id: string;
  sequenceNumber: number;
  imageURL: string;
}

export function nextSequenceNumber(items: { sequenceNumber: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.sequenceNumber), 0) + 1;
}

interface ImageStripProps {
  title: string;
  images: StripImage[];
  onUpload: (file: File) => void;
  onDelete: (image: StripImage) => void;
  onSwap: (a: StripImage, b: StripImage) => void;
}

export function ImageStrip({ title, images, onUpload, onDelete, onSwap }: ImageStripProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState<StripImage | null>(null);
  const sorted = [...images].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Button variant="secondary" onClick={() => fileInput.current?.click()}>
          Add image
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          aria-label={`${title} file`}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = '';
          }}
        />
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500">No images.</p>
      ) : (
        <ul className="flex flex-wrap gap-4">
          {sorted.map((image, i) => (
            <li key={image.id} className="flex flex-col gap-1">
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
                >
                  ←
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Delete ${title} ${i + 1}`}
                  onClick={() => setDeleting(image)}
                >
                  ✕
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Move ${title} ${i + 1} right`}
                  disabled={i === sorted.length - 1}
                  onClick={() => onSwap(image, sorted[i + 1])}
                >
                  →
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
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
