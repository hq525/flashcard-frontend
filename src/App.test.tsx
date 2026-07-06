import { screen } from '@testing-library/react';
import { renderApp } from './test/utils';

test('renders the header brand and Tags nav link', () => {
  renderApp('/some-unknown-path');
  expect(screen.getByRole('link', { name: 'Flashcards' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'Tags' })).toHaveAttribute('href', '/tags');
});

test('unknown routes render the not-found page', () => {
  renderApp('/some-unknown-path');
  expect(screen.getByText('Page not found')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to categories' })).toHaveAttribute('href', '/');
});
