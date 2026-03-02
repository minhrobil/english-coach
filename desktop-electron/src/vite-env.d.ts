/// <reference types="vite/client" />

import type {
  AppConfig,
  DashboardSummary,
  ManualVocabularyItem,
  PracticeHistoryItemResponse,
  PracticePromptResponse,
  PracticeSubmitResponse,
  ReviewCard,
  ReviewGradeResponse,
  ReviewSummary,
  ReviewItem,
  VocabularyItem,
  SignInResponse
} from './types';

declare global {
  interface Window {
    desktopApi: {
      config: {
        get: () => Promise<AppConfig>;
        update: (config: AppConfig) => Promise<AppConfig>;
      };
      auth: {
        signIn: (email: string, password: string) => Promise<SignInResponse>;
        signOut: () => Promise<void>;
      };
      practice: {
        instant: () => Promise<PracticePromptResponse>;
        submit: (payload: {
          promptId: string;
          sourceSentence: string;
          referenceAnswer: string;
          answerText: string;
        }) => Promise<PracticeSubmitResponse>;
        history: (limit: number) => Promise<PracticeHistoryItemResponse[]>;
        deleteHistory: (answerIds: string[]) => Promise<{ deletedCount: number }>;
      };
      review: {
        getAll: () => Promise<ReviewItem[]>;
        getHighlighted: () => Promise<ReviewItem[]>;
        upsertFromHistory: (item: PracticeHistoryItemResponse) => Promise<ReviewItem>;
        toggleHighlight: (answerId: string) => Promise<ReviewItem | null>;
        summary: () => Promise<ReviewSummary>;
        session: (limit: number) => Promise<ReviewCard[]>;
        grade: (payload: { cardId: string; quality: number }) => Promise<ReviewGradeResponse>;
      };
      dashboard: {
        getSummary: () => Promise<DashboardSummary>;
      };
      manualVocabulary: {
        getAll: () => Promise<ManualVocabularyItem[]>;
        add: (payload: {
          sourceAnswerId: string;
          term: string;
          meaningVi: string;
          note: string;
          sourceContext: string;
        }) => Promise<ManualVocabularyItem>;
        remove: (payload: {
          sourceAnswerId: string;
          term: string;
        }) => Promise<boolean>;
        deleteMany: (items: Array<{ sourceAnswerId: string; term: string }>) => Promise<{ deletedCount: number }>;
      };
      scheduler: {
        onPromptIncoming: (handler: (prompt: PracticePromptResponse) => void) => () => void;
        onCountdown: (handler: (seconds: number) => void) => () => void;
        onError: (handler: (message: string) => void) => () => void;
      };
      navigation: {
        onOpenLearning: (handler: (prompt: PracticePromptResponse | null) => void) => () => void;
      };
    };
  }
}

export {};

