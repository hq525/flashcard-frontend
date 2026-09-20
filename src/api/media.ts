export const acceptedImageTypes = 'image/jpeg,image/png,image/gif,image/webp';
export const imageHelp = 'JPEG, PNG, GIF or WebP, up to 4 MiB. Animated images become static.';
export function validateImageFile(file: File) {
  if (!acceptedImageTypes.split(',').includes(file.type)) throw new Error('Choose JPEG, PNG, GIF or WebP images.');
  if (file.size === 0 || file.size > 4 * 1024 * 1024) throw new Error('Images must contain data and be 4 MiB or smaller.');
}

export function getMediaOrigin(): string {
  try {
    const value = import.meta.env.VITE_MEDIA_ORIGIN;
    const url = new URL(value ?? '');
    if (url.protocol !== 'https:' || url.origin !== value) throw new Error();
    return url.origin;
  } catch { throw new Error('Media configuration is missing or invalid.'); }
}

export function trustedImageUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.origin === getMediaOrigin() && !url.username && !url.password) return value;
  } catch { /* Unmigrated and untrusted image URLs must never issue requests. */ }
  return undefined;
}
