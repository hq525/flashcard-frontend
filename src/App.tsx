import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router';
import { ToastProvider } from './components/Toast';
import { CategoriesPage } from './features/categories/CategoriesPage';
import { CardsPage } from './features/cards/CardsPage';
import { CardEditorPage } from './features/card-editor/CardEditorPage';
import { DecksPage } from './features/decks/DecksPage';
import { NotFoundPage } from './features/NotFoundPage';
import { TagsPage } from './features/tags/TagsPage';
import { Layout } from './layout/Layout';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CategoriesPage />} />
        <Route path="/tags" element={<TagsPage />} />
        <Route path="/categories/:categoryId" element={<DecksPage />} />
        <Route path="/decks/:deckId" element={<CardsPage />} />
        <Route path="/cards/:cardId" element={<CardEditorPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

// No focus refetch: forms that initialize from query data (card editor,
// section editors) must not be reset by a background refetch on tab focus.
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
