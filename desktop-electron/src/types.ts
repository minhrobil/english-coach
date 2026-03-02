export type AnswerMode = 'MULTIPLE_CHOICE' | 'FREE_TEXT';

export type AppConfig = {
  backendBaseUrl: string;
  periodicEnabled: boolean;
  periodicIntervalSeconds: number;
  answerMode: AnswerMode;
  practiceTopic: string;
  practiceLevel: 'easy' | 'medium' | 'hard';
};

export type SignInResponse = {
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number;
};

export type PracticePromptResponse = {
  promptId: string;
  direction: string;
  promptText: string;
  referenceAnswer: string;
  hint: {
    grammarPattern: string;
    formula: string;
    keyVocabulary: string[];
    usageNote: string;
  };
  issuedAt: string;
  topic: string;
  level: string;
};

export type VocabularyHint = {
  term: string;
  meaningVi: string;
  note: string;
};

export type PracticeSubmitResponse = {
  answerId: string;
  promptId: string;
  evaluationStatus: string;
  overallScore: number;
  grammarScore: number;
  naturalnessScore: number;
  vocabularyScore: number;
  explanation: string;
  betterPhrasing: string;
  vocabularyHints: VocabularyHint[];
  highlighted: boolean;
};

export type PracticeHistoryItemResponse = {
  answerId: string;
  promptId: string;
  sourceSentence: string;
  referenceAnswer: string;
  userAnswer: string;
  overallScore: number;
  grammarScore: number;
  naturalnessScore: number;
  vocabularyScore: number;
  explanation: string;
  betterPhrasing: string;
  vocabularyHints: VocabularyHint[];
  highlighted: boolean;
  evaluationStatus: string;
  submittedAt: string;
};

export type ReviewItem = {
  answerId: string;
  promptId: string;
  sourceSentence: string;
  referenceAnswer: string;
  userAnswer: string;
  overallScore: number;
  grammarScore: number;
  naturalnessScore: number;
  vocabularyScore: number;
  explanation: string;
  betterPhrasing: string;
  evaluationStatus: string;
  submittedAt: string;
  savedAt: string;
  highlighted: boolean;
};

export type DashboardRangeKey = 'today' | 'week' | 'month';

export type DashboardRangeSummary = {
  range: DashboardRangeKey;
  practicedCount: number;
  averageOverallScore: number;
  highlightedCount: number;
  savedWordsCount: number;
};

export type DashboardSummary = {
  today: DashboardRangeSummary;
  week: DashboardRangeSummary;
  month: DashboardRangeSummary;
  totalReviewed: number;
  dueCount: number;
  overdueCount: number;
  retentionRate30d: number;
  streakDays: number;
};

export type ReviewCard = {
  cardId: string;
  sourceAnswerId: string | null;
  term: string;
  meaningVi: string;
  note: string;
  sourceContext: string;
  easeFactor: number;
  intervalDays: number;
  repetition: number;
  dueAt: string;
  lastReviewedAt: string | null;
  reviewCount: number;
  lapseCount: number;
  state: 'NEW' | 'LEARNING' | 'REVIEW';
};

export type ReviewSummary = {
  dueCount: number;
  overdueCount: number;
  newCount: number;
  todayReviewedCount: number;
  retentionRate30d: number;
  streakDays: number;
};

export type ReviewGradeResponse = {
  quality: number;
  nextDueAt: string;
  card: ReviewCard;
};

export type VocabularySource = 'prompt' | 'reference' | 'answer';

export type ManualVocabularyItem = {
  sourceAnswerId: string;
  term: string;
  meaningVi: string;
  note: string;
  sourceContext: string;
  selectedAt: string;
};

export type VocabularyItem = {
  word: string;
  occurrences: number;
  sources: VocabularySource[];
  lastSeenAt: string;
  saved: boolean;
};

