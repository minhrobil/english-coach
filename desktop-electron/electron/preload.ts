import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppConfig,
  ReviewCard,
  ReviewGradeResponse,
  ReviewSummary,
  ManualVocabularyItem,
  PracticeHistoryItemResponse,
  PracticePromptResponse,
  PracticeSubmitResponse,
  ReviewItem,
  SignInResponse
} from '../src/types.js';

const api = {
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
    update: (config: AppConfig): Promise<AppConfig> => ipcRenderer.invoke('config:update', config)
  },
  auth: {
    signIn: (email: string, password: string): Promise<SignInResponse> => ipcRenderer.invoke('auth:signin', email, password),
    signOut: (): Promise<void> => ipcRenderer.invoke('auth:signout')
  },
  practice: {
    instant: (): Promise<PracticePromptResponse> => ipcRenderer.invoke('practice:instant'),
    submit: (payload: {
      promptId: string;
      sourceSentence: string;
      referenceAnswer: string;
      answerText: string;
    }): Promise<PracticeSubmitResponse> => ipcRenderer.invoke('practice:submit', payload),
    history: (limit: number): Promise<PracticeHistoryItemResponse[]> => ipcRenderer.invoke('practice:history', limit),
    deleteHistory: (answerIds: string[]): Promise<{ deletedCount: number }> => ipcRenderer.invoke('practice:deleteHistory', answerIds)
  },
  review: {
    getAll: (): Promise<ReviewItem[]> => ipcRenderer.invoke('review:getAll'),
    getHighlighted: (): Promise<ReviewItem[]> => ipcRenderer.invoke('review:getHighlighted'),
    upsertFromHistory: (item: PracticeHistoryItemResponse): Promise<ReviewItem> => ipcRenderer.invoke('review:upsertFromHistory', item),
    toggleHighlight: (answerId: string): Promise<ReviewItem | null> => ipcRenderer.invoke('review:toggleHighlight', answerId),
    summary: (): Promise<ReviewSummary> => ipcRenderer.invoke('review:summary'),
    session: (limit: number): Promise<ReviewCard[]> => ipcRenderer.invoke('review:session', limit),
    grade: (payload: { cardId: string; quality: number }): Promise<ReviewGradeResponse> =>
      ipcRenderer.invoke('review:grade', payload)
  },
  dashboard: {
    getSummary: (): Promise<import('../src/types.js').DashboardSummary> => ipcRenderer.invoke('dashboard:getSummary')
  },
  manualVocabulary: {
    getAll: (): Promise<ManualVocabularyItem[]> => ipcRenderer.invoke('manualVocabulary:getAll'),
    add: (payload: {
      sourceAnswerId: string;
      term: string;
      meaningVi: string;
      note: string;
      sourceContext: string;
    }): Promise<ManualVocabularyItem> => ipcRenderer.invoke('manualVocabulary:add', payload),
    remove: (payload: {
      sourceAnswerId: string;
      term: string;
    }): Promise<boolean> => ipcRenderer.invoke('manualVocabulary:remove', payload),
    deleteMany: (items: Array<{ sourceAnswerId: string; term: string }>): Promise<{ deletedCount: number }> =>
      ipcRenderer.invoke('manualVocabulary:deleteMany', items)
  },
  scheduler: {
    onPromptIncoming: (handler: (prompt: PracticePromptResponse) => void): (() => void) => {
      const wrapped = (_event: unknown, payload: PracticePromptResponse) => handler(payload);
      ipcRenderer.on('prompt:incoming', wrapped);
      return () => ipcRenderer.removeListener('prompt:incoming', wrapped);
    },
    onCountdown: (handler: (seconds: number) => void): (() => void) => {
      const wrapped = (_event: unknown, payload: number) => handler(payload);
      ipcRenderer.on('scheduler:countdown', wrapped);
      return () => ipcRenderer.removeListener('scheduler:countdown', wrapped);
    },
    onError: (handler: (message: string) => void): (() => void) => {
      const wrapped = (_event: unknown, payload: string) => handler(payload);
      ipcRenderer.on('scheduler:error', wrapped);
      return () => ipcRenderer.removeListener('scheduler:error', wrapped);
    }
  },
  navigation: {
    onOpenLearning: (handler: (prompt: PracticePromptResponse | null) => void): (() => void) => {
      const wrapped = (_event: unknown, payload: PracticePromptResponse | null) => handler(payload);
      ipcRenderer.on('navigation:learning', wrapped);
      return () => ipcRenderer.removeListener('navigation:learning', wrapped);
    }
  }
};

contextBridge.exposeInMainWorld('desktopApi', api);

