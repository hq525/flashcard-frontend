import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cardsApi,
  categoriesApi,
  decksApi,
  questionImagesApi,
  sectionImagesApi,
  sectionsApi,
  tagsApi,
} from './resources';
import type {
  UpdateCardAnswerSectionImageRequest,
  UpdateCardAnswerSectionRequest,
  UpdateCardQuestionImageRequest,
  UpdateCardRequest,
  UpdateCategoryRequest,
  UpdateDeckRequest,
  UpdateTagRequest,
} from './types';

export const queryKeys = {
  categories: ['categories'] as const,
  category: (id: string) => ['category', id] as const,
  decks: (categoryId: string) => ['decks', categoryId] as const,
  deck: (id: string) => ['deck', id] as const,
  tags: ['tags'] as const,
  cards: (deckId: string) => ['cards', deckId] as const,
  card: (id: string) => ['card', id] as const,
  answerSections: (cardId: string) => ['answer-sections', cardId] as const,
  questionImages: (cardId: string) => ['question-images', cardId] as const,
  sectionImages: (sectionId: string) => ['section-images', sectionId] as const,
};

// --- Categories ---

export function useCategories() {
  return useQuery({ queryKey: queryKeys.categories, queryFn: categoriesApi.list });
}

export function useCategory(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.category(id ?? ''),
    queryFn: () => categoriesApi.get(id!),
    enabled: !!id,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: categoriesApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.categories }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCategoryRequest }) =>
      categoriesApi.update(id, body),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.category(updated.id), updated);
      return qc.invalidateQueries({ queryKey: queryKeys.categories });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: categoriesApi.remove,
    onSuccess: (deleted) => {
      qc.removeQueries({ queryKey: queryKeys.category(deleted.id) });
      return qc.invalidateQueries({ queryKey: queryKeys.categories });
    },
  });
}

// --- Decks ---

export function useDecks(categoryId: string) {
  return useQuery({
    queryKey: queryKeys.decks(categoryId),
    queryFn: () => decksApi.list(categoryId),
  });
}

export function useDeck(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.deck(id ?? ''),
    queryFn: () => decksApi.get(id!),
    enabled: !!id,
  });
}

export function useCreateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: decksApi.create,
    onSuccess: (created) =>
      qc.invalidateQueries({ queryKey: queryKeys.decks(created.categoryID) }),
  });
}

export function useUpdateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateDeckRequest }) =>
      decksApi.update(id, body),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.deck(updated.id), updated);
      return qc.invalidateQueries({ queryKey: queryKeys.decks(updated.categoryID) });
    },
  });
}

export function useDeleteDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: decksApi.remove,
    onSuccess: (deleted) => {
      qc.removeQueries({ queryKey: queryKeys.deck(deleted.id) });
      return qc.invalidateQueries({ queryKey: queryKeys.decks(deleted.categoryID) });
    },
  });
}

// --- Tags ---

export function useTags() {
  return useQuery({ queryKey: queryKeys.tags, queryFn: tagsApi.list });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tagsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tags }),
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTagRequest }) => tagsApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tags }),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tagsApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tags }),
  });
}

// --- Cards ---

export function useCards(deckId: string) {
  return useQuery({ queryKey: queryKeys.cards(deckId), queryFn: () => cardsApi.list(deckId) });
}

export function useCard(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.card(id ?? ''),
    queryFn: () => cardsApi.get(id!),
    enabled: !!id,
  });
}

export function useCreateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cardsApi.create,
    onSuccess: (created) => qc.invalidateQueries({ queryKey: queryKeys.cards(created.deckID) }),
  });
}

export function useUpdateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCardRequest }) =>
      cardsApi.update(id, body),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.card(updated.id), updated);
      return qc.invalidateQueries({ queryKey: queryKeys.cards(updated.deckID) });
    },
  });
}

export function useDeleteCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cardsApi.remove,
    onSuccess: (deleted) => {
      qc.removeQueries({ queryKey: queryKeys.card(deleted.id) });
      return qc.invalidateQueries({ queryKey: queryKeys.cards(deleted.deckID) });
    },
  });
}

// --- Answer sections ---

export function useAnswerSections(cardId: string) {
  return useQuery({
    queryKey: queryKeys.answerSections(cardId),
    queryFn: () => sectionsApi.list(cardId),
  });
}

export function useCreateAnswerSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sectionsApi.create,
    onSuccess: (created) =>
      qc.invalidateQueries({ queryKey: queryKeys.answerSections(created.cardID) }),
  });
}

export function useUpdateAnswerSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCardAnswerSectionRequest }) =>
      sectionsApi.update(id, body),
    onSuccess: (updated) =>
      qc.invalidateQueries({ queryKey: queryKeys.answerSections(updated.cardID) }),
  });
}

export function useDeleteAnswerSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sectionsApi.remove,
    onSuccess: (deleted) => {
      qc.removeQueries({ queryKey: queryKeys.sectionImages(deleted.id) });
      return qc.invalidateQueries({ queryKey: queryKeys.answerSections(deleted.cardID) });
    },
  });
}

// --- Question images ---

export function useQuestionImages(cardId: string) {
  return useQuery({
    queryKey: queryKeys.questionImages(cardId),
    queryFn: () => questionImagesApi.list(cardId),
  });
}

export function useCreateQuestionImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: questionImagesApi.create,
    onSuccess: (created) =>
      qc.invalidateQueries({ queryKey: queryKeys.questionImages(created.cardID) }),
  });
}

export function useUpdateQuestionImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCardQuestionImageRequest }) =>
      questionImagesApi.update(id, body),
    onSuccess: (updated) =>
      qc.invalidateQueries({ queryKey: queryKeys.questionImages(updated.cardID) }),
  });
}

export function useDeleteQuestionImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: questionImagesApi.remove,
    onSuccess: (deleted) =>
      qc.invalidateQueries({ queryKey: queryKeys.questionImages(deleted.cardID) }),
  });
}

// --- Section images ---

export function useSectionImages(sectionId: string) {
  return useQuery({
    queryKey: queryKeys.sectionImages(sectionId),
    queryFn: () => sectionImagesApi.list(sectionId),
  });
}

export function useCreateSectionImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sectionImagesApi.create,
    onSuccess: (created) =>
      qc.invalidateQueries({ queryKey: queryKeys.sectionImages(created.cardAnswerSectionID) }),
  });
}

export function useUpdateSectionImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCardAnswerSectionImageRequest }) =>
      sectionImagesApi.update(id, body),
    onSuccess: (updated) =>
      qc.invalidateQueries({ queryKey: queryKeys.sectionImages(updated.cardAnswerSectionID) }),
  });
}

export function useDeleteSectionImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sectionImagesApi.remove,
    onSuccess: (deleted) =>
      qc.invalidateQueries({ queryKey: queryKeys.sectionImages(deleted.cardAnswerSectionID) }),
  });
}
