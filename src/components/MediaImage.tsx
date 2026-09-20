import { useImperativeHandle, useRef, useState, type ComponentProps } from 'react';
import { trustedImageUrl } from '../api/media';

// Local object-URL previews are rendered separately from server-provided media.
export function MediaImage({ src, alt, ...props }: ComponentProps<'img'>) {
  const safe = typeof src === 'string' ? trustedImageUrl(src) : undefined;
  if (!safe) return <span className="text-sm text-gray-500">Image unavailable</span>;

  // Managed object keys are immutable. A new signature alone must not download
  // an already loaded image again. Changing/removing the object resets state.
  const url = new URL(safe);
  return <LoadedMediaImage key={url.origin + url.pathname} {...props} src={safe} alt={alt} />;
}

function LoadedMediaImage({ src, onLoad, onError, ref, ...props }: ComponentProps<'img'> & { src: string }) {
  const [loadedSrc, setLoadedSrc] = useState<string>();
  const imageRef = useRef<HTMLImageElement>(null);
  const displayedSrc = loadedSrc ?? src;
  useImperativeHandle(ref, () => imageRef.current!, [displayedSrc]);

  return <img {...props} key={displayedSrc} ref={imageRef} src={displayedSrc} referrerPolicy="no-referrer"
    onLoad={(event) => {
      if (event.currentTarget !== imageRef.current) return;
      setLoadedSrc(displayedSrc);
      onLoad?.(event);
    }}
    onError={(event) => {
      if (event.currentTarget !== imageRef.current) return;
      // Try the latest trusted signature, but never restart the same failed URL.
      setLoadedSrc(undefined);
      onError?.(event);
    }} />;
}
