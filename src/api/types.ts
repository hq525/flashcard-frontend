export interface Category {
  id: string;
  entityType: string;
  name: string;
  description: string;
}

export interface Deck {
  id: string;
  entityType: string;
  categoryID: string;
  name: string;
  description: string;
}

export interface Tag {
  id: string;
  entityType: string;
  name: string;
  description: string;
}

export interface Card {
  id: string;
  entityType: string;
  deckID: string;
  tags: string[] | null;
  question: string;
  createdDateTime: string;
  updatedDateTime: string;
  lastAccessedDateTime: string;
  memorized: boolean;
  // Leitner spaced-repetition box, 1-5; 0 on legacy records means box 1.
  leitnerBox: number;
  schedule?: CardSchedule;
  reviewRevision: number;
}

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';
export type ScheduleState = 'new' | 'learning' | 'review' | 'relearning';

export interface CardSchedule {
  version: number;
  algorithm: string;
  dueAt: string;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: ScheduleState;
  lastReviewAt: string;
  remainingSteps: number;
}

export interface CardReview {
  id: string;
  entityType: string;
  cardId: string;
  requestId: string;
  rating: ReviewRating;
  reviewedAt: string;
  previousSchedule: CardSchedule;
  schedule: CardSchedule;
  revision: number;
}

export interface ReviewOption {
  rating: ReviewRating;
  dueAt: string;
  intervalSeconds: number;
  state: ScheduleState;
}

export interface ReviewOptions {
  cardId: string;
  revision: number;
  generatedAt: string;
  options: ReviewOption[];
}

export interface ReviewCardRequest {
  reviewId: string;
  rating: ReviewRating;
  expectedRevision: number;
}

export interface ReviewCardResponse {
  card: Card;
  review: CardReview;
}

export interface CardAnswerSection {
  id: string;
  entityType: string;
  cardID: string;
  sequenceNumber: number;
  title: string;
  answer: string;
  createdDateTime: string;
  updatedDateTime: string;
}

export interface CardQuestionImage {
  id: string;
  entityType: string;
  cardID: string;
  sequenceNumber: number;
  createdDateTime: string;
  imageURL: string;
}

export interface CardAnswerSectionImage {
  id: string;
  entityType: string;
  cardAnswerSectionID: string;
  sequenceNumber: number;
  createdDateTime: string;
  imageURL: string;
}

export interface CreateCategoryRequest {
  name: string;
  description: string;
}
export type UpdateCategoryRequest = CreateCategoryRequest;

export interface CreateDeckRequest {
  categoryID: string;
  name: string;
  description: string;
}
export interface UpdateDeckRequest {
  name: string;
  description: string;
}

export interface CreateTagRequest {
  name: string;
  description: string;
}
export type UpdateTagRequest = CreateTagRequest;

export interface CreateCardRequest {
  deckID: string;
  question: string;
  tags: string[];
}
export interface UpdateCardRequest {
  question: string;
  tags: string[];
  memorized: boolean;
  lastAccessedDateTime?: string;
  // Omit (or 0) to leave the stored box unchanged.
  leitnerBox?: number;
}

export interface CreateCardAnswerSectionRequest {
  cardID: string;
  sequenceNumber: number;
  title: string;
  answer: string;
}
export interface UpdateCardAnswerSectionRequest {
  sequenceNumber: number;
  title: string;
  answer: string;
}

export interface CreateCardQuestionImageRequest {
  cardID: string;
  sequenceNumber: number;
  imageURL: string;
}
export interface UpdateCardQuestionImageRequest {
  sequenceNumber: number;
  imageURL: string;
}

export interface CreateCardAnswerSectionImageRequest {
  cardAnswerSectionID: string;
  sequenceNumber: number;
  imageURL: string;
}
export interface UpdateCardAnswerSectionImageRequest {
  sequenceNumber: number;
  imageURL: string;
}

export interface PresignResponse {
  presignedUrl: string;
  imageUrl: string;
}
