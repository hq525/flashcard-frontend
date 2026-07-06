import type {
  Card,
  CardAnswerSection,
  CardAnswerSectionImage,
  CardQuestionImage,
  Category,
  Deck,
  Tag,
} from '../api/types';

const TS = '2026-07-06T00:00:00Z';

export function makeCategory(overrides: Partial<Category> = {}): Category {
  return { id: 'cat-1', entityType: 'category', name: 'Biology', description: 'Life science', ...overrides };
}

export function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return { id: 'deck-1', entityType: 'deck', categoryID: 'cat-1', name: 'Cell Biology', description: '', ...overrides };
}

export function makeTag(overrides: Partial<Tag> = {}): Tag {
  return { id: 'tag-1', entityType: 'tag', name: 'exam', description: '', ...overrides };
}

export function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    entityType: 'card',
    deckID: 'deck-1',
    tags: [],
    question: 'What is a mitochondrion?',
    createdDateTime: TS,
    updatedDateTime: TS,
    lastAccessedDateTime: '',
    memorized: false,
    ...overrides,
  };
}

export function makeSection(overrides: Partial<CardAnswerSection> = {}): CardAnswerSection {
  return {
    id: 'sec-1',
    entityType: 'card_answer_section',
    cardID: 'card-1',
    sequenceNumber: 1,
    title: 'Definition',
    answer: 'The powerhouse of the cell.',
    createdDateTime: TS,
    updatedDateTime: TS,
    ...overrides,
  };
}

export function makeQuestionImage(overrides: Partial<CardQuestionImage> = {}): CardQuestionImage {
  return {
    id: 'qimg-1',
    entityType: 'card_question_image',
    cardID: 'card-1',
    sequenceNumber: 1,
    createdDateTime: TS,
    imageURL: 'https://bucket.s3.amazonaws.com/question-images/qimg-1.png',
    ...overrides,
  };
}

export function makeSectionImage(overrides: Partial<CardAnswerSectionImage> = {}): CardAnswerSectionImage {
  return {
    id: 'simg-1',
    entityType: 'card_answer_section_image',
    cardAnswerSectionID: 'sec-1',
    sequenceNumber: 1,
    createdDateTime: TS,
    imageURL: 'https://bucket.s3.amazonaws.com/answer-images/simg-1.png',
    ...overrides,
  };
}
