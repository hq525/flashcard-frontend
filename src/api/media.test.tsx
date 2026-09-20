import { fireEvent, render, screen } from '@testing-library/react';
import { MediaImage } from '../components/MediaImage';

test.each([
  'https://tracker.example/pixel', 'http://bucket.s3.amazonaws.com/image.png',
  'https://bucket.s3.amazonaws.com.evil.example/image.png', 'data:image/png;base64,a',
  'blob:https://bucket.s3.amazonaws.com/forged', 'https://user@bucket.s3.amazonaws.com/image.png',
])('does not emit an image request for an untrusted stored URL: %s', (src) => {
  vi.stubEnv('VITE_MEDIA_ORIGIN', 'https://bucket.s3.amazonaws.com');
  render(<MediaImage src={src} alt="Private image" />);
  expect(screen.queryByRole('img')).toBeNull();
});

test('keeps signed query parameters on the exact configured HTTPS media origin', () => {
  vi.stubEnv('VITE_MEDIA_ORIGIN', 'https://bucket.s3.amazonaws.com');
  const src = 'https://bucket.s3.amazonaws.com/images/a.png?X-Amz-Signature=abc';
  render(<MediaImage src={src} alt="Private image" />);
  expect(screen.getByRole('img')).toHaveAttribute('src', src);
});

test('fails closed when media configuration is missing', () => {
  vi.stubEnv('VITE_MEDIA_ORIGIN', '');
  render(<MediaImage src="https://bucket.s3.amazonaws.com/image.png" alt="Private image" />);
  expect(screen.queryByRole('img')).toBeNull();
});

const firstUrl = 'https://bucket.s3.amazonaws.com/images/7d87fd9a-54ae-40e8-b1e9-0aa659f0fc8a.png?X-Amz-Signature=first';
const renewedUrl = 'https://bucket.s3.amazonaws.com/images/7d87fd9a-54ae-40e8-b1e9-0aa659f0fc8a.png?X-Amz-Signature=renewed';
const latestUrl = 'https://bucket.s3.amazonaws.com/images/7d87fd9a-54ae-40e8-b1e9-0aa659f0fc8a.png?X-Amz-Signature=latest';
const otherImageUrl = 'https://bucket.s3.amazonaws.com/images/3fba640f-0f5c-4125-999e-89c054af3b30.jpg?X-Amz-Signature=other';

test('keeps a successfully loaded image source when only its signature renews', () => {
  const { rerender } = render(<MediaImage src={firstUrl} alt="Private image" />);
  const loadedImage = screen.getByRole('img');
  fireEvent.load(loadedImage);

  rerender(<MediaImage src={renewedUrl} alt="Updated description" />);

  expect(screen.getByRole('img')).toBe(loadedImage);
  expect(loadedImage).toHaveAttribute('src', firstUrl);
  expect(loadedImage).toHaveAttribute('alt', 'Updated description');
});

test('loads a replacement object immediately after a successful image', () => {
  const { rerender } = render(<MediaImage src={firstUrl} alt="Private image" />);
  fireEvent.load(screen.getByRole('img'));

  rerender(<MediaImage src={otherImageUrl} alt="Private image" />);

  expect(screen.getByRole('img')).toHaveAttribute('src', otherImageUrl);
});

test.each([undefined, '', 'https://bucket.s3.amazonaws.com.evil.example/images/image.png'])('removes a previously loaded image immediately when its new source is unavailable: %s', (src) => {
  const { rerender } = render(<MediaImage src={firstUrl} alt="Private image" />);
  fireEvent.load(screen.getByRole('img'));

  rerender(<MediaImage src={src} alt="Private image" />);
  expect(screen.queryByRole('img')).toBeNull();

  rerender(<MediaImage src={renewedUrl} alt="Private image" />);
  expect(screen.getByRole('img')).toHaveAttribute('src', renewedUrl);
});

test('uses the newest signature after a retained image fails without retrying the same failed request', () => {
  const { rerender } = render(<MediaImage src={firstUrl} alt="Private image" />);
  const originalImage = screen.getByRole('img');
  fireEvent.load(originalImage);
  rerender(<MediaImage src={renewedUrl} alt="Private image" />);
  expect(originalImage).toHaveAttribute('src', firstUrl);

  fireEvent.error(originalImage);
  const recoveryImage = screen.getByRole('img');
  expect(recoveryImage).toHaveAttribute('src', renewedUrl);
  fireEvent.error(recoveryImage);
  expect(screen.getByRole('img')).toBe(recoveryImage);
  expect(recoveryImage).toHaveAttribute('src', renewedUrl);

  rerender(<MediaImage src={latestUrl} alt="Private image" />);
  expect(screen.getByRole('img')).toHaveAttribute('src', latestUrl);
});

test('uses a fresh signature when the initial request fails before any successful load', () => {
  const { rerender } = render(<MediaImage src={firstUrl} alt="Private image" />);
  fireEvent.error(screen.getByRole('img'));

  rerender(<MediaImage src={renewedUrl} alt="Private image" />);
  const recoveredImage = screen.getByRole('img');
  expect(recoveredImage).toHaveAttribute('src', renewedUrl);
  fireEvent.load(recoveredImage);

  rerender(<MediaImage src={latestUrl} alt="Private image" />);
  expect(recoveredImage).toHaveAttribute('src', renewedUrl);
});

test('ignores a stale load event while a newer signature is still loading', () => {
  const { rerender } = render(<MediaImage src={firstUrl} alt="Private image" />);
  const oldRequest = screen.getByRole('img');
  rerender(<MediaImage src={renewedUrl} alt="Private image" />);
  fireEvent.load(oldRequest);

  rerender(<MediaImage src={latestUrl} alt="Private image" />);
  expect(screen.getByRole('img')).toHaveAttribute('src', latestUrl);
  fireEvent.load(screen.getByRole('img'));

  rerender(<MediaImage src={renewedUrl} alt="Private image" />);
  expect(screen.getByRole('img')).toHaveAttribute('src', latestUrl);
});

test('ignores stale errors after a recovery request has successfully loaded', () => {
  const { rerender } = render(<MediaImage src={firstUrl} alt="Private image" />);
  const oldRequest = screen.getByRole('img');
  fireEvent.load(oldRequest);
  rerender(<MediaImage src={renewedUrl} alt="Private image" />);
  fireEvent.error(oldRequest);
  fireEvent.load(screen.getByRole('img'));
  rerender(<MediaImage src={latestUrl} alt="Private image" />);

  fireEvent.error(oldRequest);

  expect(screen.getByRole('img')).toHaveAttribute('src', renewedUrl);
});

test('keeps caller load and error handlers while managing the source', () => {
  const events: string[] = [];
  render(<MediaImage src={firstUrl} alt="Private image"
    onLoad={(event) => events.push(`${event.type}:${event.currentTarget.getAttribute('src')}`)}
    onError={(event) => events.push(`${event.type}:${event.currentTarget.getAttribute('src')}`)} />);
  const image = screen.getByRole('img');
  fireEvent.load(image);
  fireEvent.error(image);

  expect(events).toEqual([`load:${firstUrl}`, `error:${firstUrl}`]);
  expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
});
