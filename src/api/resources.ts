import { request } from './client';
import type {
  Card,
  CardAnswerSection,
  CardAnswerSectionImage,
  CardQuestionImage,
  Category,
  CreateCardAnswerSectionImageRequest,
  CreateCardAnswerSectionRequest,
  CreateCardQuestionImageRequest,
  CreateCardRequest,
  CreateCategoryRequest,
  CreateDeckRequest,
  CreateTagRequest,
  Deck,
  PresignResponse,
  Tag,
  UpdateCardAnswerSectionImageRequest,
  UpdateCardAnswerSectionRequest,
  UpdateCardQuestionImageRequest,
  UpdateCardRequest,
  UpdateCategoryRequest,
  UpdateDeckRequest,
  UpdateTagRequest,
} from './types';

export const categoriesApi = {
  list: () => request<Category[]>('GET', '/categories'),
  get: (id: string) => request<Category>('GET', '/category', { params: { id } }),
  create: (body: CreateCategoryRequest) => request<Category>('POST', '/category', { body }),
  update: (id: string, body: UpdateCategoryRequest) =>
    request<Category>('PUT', '/category', { params: { id }, body }),
  remove: (id: string) => request<Category>('DELETE', '/category', { params: { id } }),
};

export const decksApi = {
  list: (categoryId: string) => request<Deck[]>('GET', '/decks', { params: { categoryId } }),
  get: (id: string) => request<Deck>('GET', '/deck', { params: { id } }),
  create: (body: CreateDeckRequest) => request<Deck>('POST', '/deck', { body }),
  update: (id: string, body: UpdateDeckRequest) =>
    request<Deck>('PUT', '/deck', { params: { id }, body }),
  remove: (id: string) => request<Deck>('DELETE', '/deck', { params: { id } }),
};

export const tagsApi = {
  list: () => request<Tag[]>('GET', '/tags'),
  create: (body: CreateTagRequest) => request<Tag>('POST', '/tag', { body }),
  update: (id: string, body: UpdateTagRequest) =>
    request<Tag>('PUT', '/tag', { params: { id }, body }),
  remove: (id: string) => request<Tag>('DELETE', '/tag', { params: { id } }),
};

export const cardsApi = {
  list: (deckId: string) => request<Card[]>('GET', '/cards', { params: { deckId } }),
  get: (id: string) => request<Card>('GET', '/card', { params: { id } }),
  create: (body: CreateCardRequest) => request<Card>('POST', '/card', { body }),
  update: (id: string, body: UpdateCardRequest) =>
    request<Card>('PUT', '/card', { params: { id }, body }),
  remove: (id: string) => request<Card>('DELETE', '/card', { params: { id } }),
};

export const sectionsApi = {
  list: (cardId: string) =>
    request<CardAnswerSection[]>('GET', '/card-answer-sections', { params: { cardId } }),
  create: (body: CreateCardAnswerSectionRequest) =>
    request<CardAnswerSection>('POST', '/card-answer-section', { body }),
  update: (id: string, body: UpdateCardAnswerSectionRequest) =>
    request<CardAnswerSection>('PUT', '/card-answer-section', { params: { id }, body }),
  remove: (id: string) =>
    request<CardAnswerSection>('DELETE', '/card-answer-section', { params: { id } }),
};

export const questionImagesApi = {
  list: (cardId: string) =>
    request<CardQuestionImage[]>('GET', '/card-question-images', { params: { cardId } }),
  create: (body: CreateCardQuestionImageRequest) =>
    request<CardQuestionImage>('POST', '/card-question-image', { body }),
  update: (id: string, body: UpdateCardQuestionImageRequest) =>
    request<CardQuestionImage>('PUT', '/card-question-image', { params: { id }, body }),
  remove: (id: string) =>
    request<CardQuestionImage>('DELETE', '/card-question-image', { params: { id } }),
};

export const sectionImagesApi = {
  list: (cardAnswerSectionId: string) =>
    request<CardAnswerSectionImage[]>('GET', '/card-answer-section-images', {
      params: { cardAnswerSectionId },
    }),
  create: (body: CreateCardAnswerSectionImageRequest) =>
    request<CardAnswerSectionImage>('POST', '/card-answer-section-image', { body }),
  update: (id: string, body: UpdateCardAnswerSectionImageRequest) =>
    request<CardAnswerSectionImage>('PUT', '/card-answer-section-image', { params: { id }, body }),
  remove: (id: string) =>
    request<CardAnswerSectionImage>('DELETE', '/card-answer-section-image', { params: { id } }),
};

// Presign → PUT the bytes to S3 (no API key — it's S3, not the API) → return
// the public URL to store on the image record.
export async function uploadImageFile(
  file: File,
  imageType: 'question' | 'answer',
): Promise<string> {
  const params: Record<string, string> = { fileName: file.name, contentType: file.type };
  if (imageType === 'answer') params.imageType = 'answer';
  const { presignedUrl, imageUrl } = await request<PresignResponse>('GET', '/presigned-url', {
    params,
  });

  const buffer = await file.arrayBuffer();
  const res = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: buffer,
  });
  if (!res.ok) throw new Error('Image upload failed');
  return imageUrl;
}
