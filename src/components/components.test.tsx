import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ApiError } from '../api/client';
import { Breadcrumbs } from './Breadcrumbs';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { ErrorBanner } from './ErrorBanner';
import { TagChip } from './TagChip';

test('Button defaults to type=button and honors disabled', () => {
  render(<Button disabled>Save</Button>);
  const button = screen.getByRole('button', { name: 'Save' });
  expect(button).toHaveAttribute('type', 'button');
  expect(button).toBeDisabled();
});

test('ErrorBanner shows the ApiError message and calls onRetry', async () => {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  render(<ErrorBanner error={new ApiError(500, 'Internal Server Error')} onRetry={onRetry} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Internal Server Error');
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(onRetry).toHaveBeenCalledOnce();
});

test('ErrorBanner falls back for unknown errors and hides Retry without onRetry', () => {
  render(<ErrorBanner error="weird" />);
  expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
});

test('Breadcrumbs links items with `to` and renders the last as text', () => {
  render(
    <MemoryRouter>
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'Biology', to: '/categories/cat-1' },
          { label: 'Cell Biology' },
        ]}
      />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'Biology' })).toHaveAttribute('href', '/categories/cat-1');
  expect(screen.queryByRole('link', { name: 'Cell Biology' })).not.toBeInTheDocument();
  expect(screen.getByText('Cell Biology')).toBeInTheDocument();
});

test('EmptyState and TagChip render their text', () => {
  render(
    <>
      <EmptyState message="No decks yet" />
      <TagChip name="exam" />
    </>,
  );
  expect(screen.getByText('No decks yet')).toBeInTheDocument();
  expect(screen.getByText('exam')).toBeInTheDocument();
});
