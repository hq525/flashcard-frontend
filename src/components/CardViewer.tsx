import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useAnswerSections, useQuestionImages, useSectionImages } from '../api/hooks';
import type { Card, CardAnswerSection } from '../api/types';
import { ErrorBanner } from './ErrorBanner';
import { MediaImage } from './MediaImage';

// Shared read-only card content. The caller controls the flip; only Study
// offers review actions and changes the card's schedule.
export function CardViewer({ card, flipped, onFlip }: {
  card: Card;
  flipped: boolean;
  onFlip: () => void;
}) {
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  return (
    <div>
      {zoomUrl && <Lightbox url={zoomUrl} onClose={() => setZoomUrl(null)} />}
      <FlipCard
        flipped={flipped}
        onFlip={onFlip}
        front={<>
          <FaceLabel>Question</FaceLabel>
          <p className="text-lg font-medium wrap-break-word whitespace-pre-wrap">{card.question}</p>
          <QuestionImages cardId={card.id} onZoom={setZoomUrl} />
        </>}
        back={<>
          <FaceLabel>Answer</FaceLabel>
          <AnswerSections cardId={card.id} onZoom={setZoomUrl} />
        </>}
      />
      <p className="mt-2 text-center text-xs text-gray-400">Click the card to flip it</p>
    </div>
  );
}

function FaceLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-xs font-medium tracking-wide text-gray-400 uppercase">{children}</p>
  );
}

// A 3D flip card. Both faces stay mounted (the answer pre-loads while the
// user thinks); the container's height is measured from the visible face and
// transitioned, so the card grows/shrinks smoothly instead of jumping.
function FlipCard({
  flipped,
  onFlip,
  front,
  back,
}: {
  flipped: boolean;
  onFlip: () => void;
  front: ReactNode;
  back: ReactNode;
}) {
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const face = flipped ? backRef.current : frontRef.current;
    if (!face) return;
    // Track the visible face's size: it changes when images finish loading.
    const update = () => {
      if (face.offsetHeight > 0) setHeight(face.offsetHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(face);
    return () => observer.disconnect();
  }, [flipped]);

  const faceClasses =
    'absolute inset-x-0 top-0 rounded-lg border border-gray-200 bg-white p-6 [backface-visibility:hidden]';

  return (
    <div className="perspective-distant">
      {/* A div with button semantics rather than a real <button>: the faces
          contain zoomable-image buttons, and buttons can't nest. */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Flip card"
        aria-pressed={flipped}
        onClick={onFlip}
        onKeyDown={(e) => {
          // Ignore keys bubbling from the image buttons inside the faces.
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onFlip();
          }
        }}
        className="relative block w-full rounded-lg text-left transition-[transform,height] duration-300 transform-3d focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none motion-reduce:transition-none"
        style={{ height, transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        <div ref={frontRef} aria-hidden={flipped} inert={flipped} className={faceClasses}>
          {front}
        </div>
        <div
          ref={backRef}
          aria-hidden={!flipped}
          inert={!flipped}
          className={`${faceClasses} transform-[rotateY(180deg)]`}
        >
          {back}
        </div>
      </div>
    </div>
  );
}

function QuestionImages({ cardId, onZoom }: { cardId: string; onZoom: (url: string) => void }) {
  const images = useQuestionImages(cardId);
  if (images.isPending) return <ContentLoading>Loading question images…</ContentLoading>;
  if (images.isError) return <ContentError error={images.error} onRetry={() => images.refetch()} />;
  const sorted = [...(images.data ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  if (sorted.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {sorted.map((img, i) => (
        <ZoomableImage
          key={img.id}
          src={img.imageURL}
          alt={`Question image ${i + 1}`}
          onZoom={onZoom}
        />
      ))}
    </div>
  );
}

function AnswerSections({ cardId, onZoom }: { cardId: string; onZoom: (url: string) => void }) {
  const sections = useAnswerSections(cardId);
  if (sections.isPending) return <ContentLoading>Loading answer…</ContentLoading>;
  if (sections.isError) return <ContentError error={sections.error} onRetry={() => sections.refetch()} />;
  const sorted = [...(sections.data ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  if (sorted.length === 0) {
    return <p className="text-center text-sm text-gray-500">This card has no answer sections.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {sorted.map((section) => (
        <AnswerSectionView key={section.id} section={section} onZoom={onZoom} />
      ))}
    </div>
  );
}

function AnswerSectionView({
  section,
  onZoom,
}: {
  section: CardAnswerSection;
  onZoom: (url: string) => void;
}) {
  const images = useSectionImages(section.id);
  const sorted = [...(images.data ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      {section.title && <h2 className="mb-1 font-semibold">{section.title}</h2>}
      {section.answer && (
        <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-700">{section.answer}</p>
      )}
      {images.isPending && <ContentLoading>Loading answer images…</ContentLoading>}
      {images.isError && <ContentError error={images.error} onRetry={() => images.refetch()} />}
      {sorted.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {sorted.map((img, i) => (
            <ZoomableImage
              key={img.id}
              src={img.imageURL}
              alt={`${section.title || 'Answer'} image ${i + 1}`}
              lazy
              onZoom={onZoom}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// A tap on the image zooms it; stopPropagation keeps the tap from reaching
// the flip card's click handler.
function ZoomableImage({
  src,
  alt,
  lazy,
  onZoom,
}: {
  src: string;
  alt: string;
  lazy?: boolean;
  onZoom: (url: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Enlarge ${alt}`}
      onClick={(e) => {
        e.stopPropagation();
        onZoom(src);
      }}
      className="block w-full cursor-zoom-in rounded-md focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
    >
      <MediaImage
        src={src}
        alt={alt}
        loading={lazy ? 'lazy' : undefined}
        // Natural full-width sizing; the flip card's height animation
        // absorbs load-time growth instead of snapping.
        className="w-full rounded-md border border-gray-200"
      />
    </button>
  );
}

function ContentLoading({ children }: { children: ReactNode }) {
  return <p role="status" className="mt-3 text-center text-sm text-gray-500">{children}</p>;
}

function ContentError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="mt-3" onClick={event => event.stopPropagation()}>
      <ErrorBanner error={error} onRetry={onRetry} />
    </div>
  );
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={onClose}
      className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-4"
    >
      <MediaImage src={url} alt="Enlarged view" className="max-h-full max-w-full rounded-md object-contain" />
    </div>
  );
}
