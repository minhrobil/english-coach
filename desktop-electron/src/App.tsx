import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import type {
  AppConfig,
  DashboardSummary,
  ManualVocabularyItem,
  PracticeHistoryItemResponse,
  PracticePromptResponse,
  PracticeSubmitResponse,
  ReviewCard,
  ReviewSummary,
  ReviewItem,
  SignInResponse,
  VocabularyHint
} from './types';

type Tab = 'learning' | 'review' | 'history' | 'dashboard' | 'vocabulary' | 'config';

type PendingResult = {
  submitted: PracticeSubmitResponse;
  prompt: PracticePromptResponse;
  answerText: string;
  vocabularyHints: VocabularyHint[];
};

type HistoryViewMode = 'full' | 'short';

function manualKey(answerId: string, term: string): string {
  return `${answerId}::${term.trim().toLowerCase()}`;
}

const defaultConfig: AppConfig = {
  backendBaseUrl: 'http://localhost:8088',
  periodicEnabled: true,
  periodicIntervalSeconds: 45,
  answerMode: 'MULTIPLE_CHOICE',
  practiceTopic: 'work',
  practiceLevel: 'medium'
};

const practiceTopics = [
  'work',
  'daily-life',
  'travel',
  'meeting',
  'email-writing',
  'customer-service',
  'finance',
  'banking',
  'technology',
  'healthcare',
  'education',
  'shopping',
  'food-dining',
  'transportation',
  'hotel',
  'job-interview',
  'presentation',
  'negotiation',
  'project-management',
  'social-communication'
];

const HISTORY_PAGE_SIZE = 10;
const REVIEW_SESSION_SIZE = 10;

const stopwords = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'his', 'i',
  'in', 'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or', 'our', 'she', 'that', 'the', 'their', 'them', 'there',
  'they', 'this', 'to', 'was', 'we', 'were', 'will', 'with', 'you', 'your', 'yours', 'do', 'does', 'did', 'done',
  'can', 'could', 'should', 'would', 'please', 'one', 'more', 'time'
]);

function buildChoices(referenceAnswer: string): string[] {
  const options = [
    referenceAnswer,
    `${referenceAnswer} please.`,
    'Could you explain this one more time?',
    'I will check and update you shortly.'
  ];
  return options.sort(() => Math.random() - 0.5);
}

function normalizeWord(token: string): string | null {
  const cleaned = token.toLowerCase().replace(/[^a-z']/g, '').replace(/^'+|'+$/g, '');
  if (!cleaned || cleaned.length < 2 || stopwords.has(cleaned)) {
    return null;
  }
  return cleaned;
}

function normalizeVocabularyHints(vocabularyHints: VocabularyHint[] | undefined): VocabularyHint[] {
  if (!Array.isArray(vocabularyHints)) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: VocabularyHint[] = [];
  for (const hint of vocabularyHints) {
    const term = String(hint?.term ?? '').trim();
    if (!term) {
      continue;
    }
    const key = term.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push({
      term,
      meaningVi: String(hint?.meaningVi ?? '').trim() || '(chưa có nghĩa)',
      note: String(hint?.note ?? '').trim()
    });
  }
  return normalized;
}

export function App() {
  const [currentTab, setCurrentTab] = useState<Tab>('learning');
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [draftConfig, setDraftConfig] = useState<AppConfig>(defaultConfig);
  const [token, setToken] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [countdown, setCountdown] = useState(config.periodicIntervalSeconds);

  const [currentPrompt, setCurrentPrompt] = useState<PracticePromptResponse | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [freeTextAnswer, setFreeTextAnswer] = useState('');
  const [history, setHistory] = useState<PracticeHistoryItemResponse[]>([]);
  const [reviewPool, setReviewPool] = useState<ReviewItem[]>([]);
  const [reviewBusyAnswerId, setReviewBusyAnswerId] = useState<string | null>(null);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);
  const [reviewSession, setReviewSession] = useState<ReviewCard[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewGrading, setReviewGrading] = useState(false);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [manualVocabulary, setManualVocabulary] = useState<ManualVocabularyItem[]>([]);
  const [pendingResult, setPendingResult] = useState<PendingResult | null>(null);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());
  const [selectedVocabularyKeys, setSelectedVocabularyKeys] = useState<Set<string>>(new Set());
  const [hintStep, setHintStep] = useState<0 | 1 | 2>(0);
  const [historyViewMode, setHistoryViewMode] = useState<HistoryViewMode>('full');
  const [historyHighlightOnly, setHistoryHighlightOnly] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  const [loginEmail, setLoginEmail] = useState('admin@english-coach.local');
  const [loginPassword, setLoginPassword] = useState('demo');

  const bridgeReady = typeof window !== 'undefined' && typeof window.desktopApi !== 'undefined';

  const answerChoices = useMemo(
    () => (currentPrompt ? buildChoices(currentPrompt.referenceAnswer) : []),
    [currentPrompt?.promptId]
  );

  const reviewMap = useMemo(() => new Map(reviewPool.map((item) => [item.answerId, item])), [reviewPool]);
  const highlightedCount = useMemo(() => reviewPool.filter((item) => item.highlighted).length, [reviewPool]);
  const manualWordSet = useMemo(
    () => new Set(manualVocabulary.map((item) => manualKey(item.sourceAnswerId, item.term))),
    [manualVocabulary]
  );
  const filteredHistory = useMemo(
    () => historyHighlightOnly ? history.filter((item) => item.highlighted) : history,
    [history, historyHighlightOnly]
  );
  const historyTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE)),
    [filteredHistory.length]
  );
  const pagedHistory = useMemo(() => {
    const page = Math.min(historyPage, historyTotalPages);
    const start = (page - 1) * HISTORY_PAGE_SIZE;
    return filteredHistory.slice(start, start + HISTORY_PAGE_SIZE);
  }, [filteredHistory, historyPage, historyTotalPages]);

  const loginRequired = !token;
  const currentReviewCard = reviewSession[reviewIndex] ?? null;
  const reviewRemaining = Math.max(0, reviewSession.length - reviewIndex);
  const configDirty = useMemo(
    () => JSON.stringify(draftConfig) !== JSON.stringify(config),
    [draftConfig, config]
  );

  useEffect(() => {
    if (!bridgeReady) {
      return;
    }
    void (async () => {
      const cfg = await window.desktopApi.config.get();
      setConfig(cfg);
      setDraftConfig(cfg);
      setCountdown(cfg.periodicIntervalSeconds);
    })();
  }, [bridgeReady]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyViewMode, historyHighlightOnly]);

  useEffect(() => {
    if (historyPage > historyTotalPages) {
      setHistoryPage(historyTotalPages);
    }
  }, [historyPage, historyTotalPages]);

  useEffect(() => {
    if (!bridgeReady) {
      return;
    }

    const unsubPrompt = window.desktopApi.scheduler.onPromptIncoming((prompt) => {
      setCurrentPrompt(prompt);
      setCurrentTab('learning');
      setSelectedAnswer('');
      setFreeTextAnswer('');
      setPendingResult(null);
      setHintStep(0);
    });

    const unsubCountdown = window.desktopApi.scheduler.onCountdown((seconds) => setCountdown(seconds));
    const unsubError = window.desktopApi.scheduler.onError(() => undefined);
    const unsubNav = window.desktopApi.navigation.onOpenLearning((prompt) => {
      setCurrentTab('learning');
      if (prompt) {
        setCurrentPrompt(prompt);
        setHintStep(0);
      }
    });

    return () => {
      unsubPrompt();
      unsubCountdown();
      unsubError();
      unsubNav();
    };
  }, [bridgeReady]);

  async function hydrateReviewPool() {
    if (!bridgeReady) {
      return;
    }
    const items = await window.desktopApi.review.getAll();
    setReviewPool(items);
  }

  async function hydrateDashboard() {
    if (!bridgeReady) {
      return;
    }
    const summary = await window.desktopApi.dashboard.getSummary();
    setDashboardSummary(summary);
  }

  async function hydrateReviewSummary() {
    if (!bridgeReady) {
      return;
    }
    const summary = await window.desktopApi.review.summary();
    setReviewSummary(summary);
  }

  async function hydrateManualVocabulary() {
    if (!bridgeReady) {
      return;
    }
    const items = await window.desktopApi.manualVocabulary.getAll();
    setManualVocabulary(items);
  }

  async function refreshHistory() {
    if (!bridgeReady) {
      return;
    }
    const items = await window.desktopApi.practice.history(50);
    setHistory(items);
    setHistoryPage(1);
  }

  async function onSignIn() {
    if (!bridgeReady) {
      return;
    }

    setLoading(true);
    setLoadingMessage('Đang đăng nhập...');
    try {
      const response: SignInResponse = await window.desktopApi.auth.signIn(loginEmail, loginPassword);
      setToken(response.accessToken);
      await refreshHistory();
      await hydrateReviewPool();
      await hydrateManualVocabulary();
      await hydrateReviewSummary();
      await hydrateDashboard();
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }

  async function onSignOut() {
    if (!bridgeReady) {
      return;
    }

    setLoading(true);
    setLoadingMessage('Đang đăng xuất...');
    try {
      await window.desktopApi.auth.signOut();
      setToken('');
      setCurrentPrompt(null);
      setHistory([]);
      setReviewPool([]);
      setManualVocabulary([]);
      setReviewSummary(null);
      setReviewSession([]);
      setReviewIndex(0);
      setDashboardSummary(null);
      setPendingResult(null);
      setSelectedHistoryIds(new Set());
      setSelectedVocabularyKeys(new Set());
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }

  async function startReviewSession() {
    if (!bridgeReady) {
      return;
    }
    setLoading(true);
    setLoadingMessage('Đang chuẩn bị phiên ôn tập...');
    try {
      const cards = await window.desktopApi.review.session(REVIEW_SESSION_SIZE);
      setReviewSession(cards);
      setReviewIndex(0);
      setCurrentTab('review');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }

  async function gradeReview(quality: number) {
    if (!bridgeReady || !currentReviewCard || reviewGrading) {
      return;
    }
    setReviewGrading(true);
    try {
      await window.desktopApi.review.grade({ cardId: currentReviewCard.cardId, quality });
      setReviewIndex((prev) => prev + 1);
      await Promise.all([hydrateReviewSummary(), hydrateDashboard()]);
    } finally {
      setReviewGrading(false);
    }
  }

  async function fetchPrompt() {
    if (!bridgeReady) {
      return;
    }
    setLoading(true);
    setLoadingMessage('Đang lấy câu hỏi mới...');
    try {
      const prompt = await window.desktopApi.practice.instant();
      setCurrentPrompt(prompt);
      setSelectedAnswer('');
      setFreeTextAnswer('');
      setPendingResult(null);
      setHintStep(0);
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }

  async function submitAnswer() {
    if (!bridgeReady || !currentPrompt) {
      return;
    }

    const answerText = config.answerMode === 'FREE_TEXT' ? freeTextAnswer.trim() : selectedAnswer.trim();
    if (!answerText) {
      return;
    }

    setLoading(true);
    setLoadingMessage('Đang nộp và chấm câu trả lời...');
    try {
      const submitted = await window.desktopApi.practice.submit({
        promptId: currentPrompt.promptId,
        sourceSentence: currentPrompt.promptText,
        referenceAnswer: currentPrompt.referenceAnswer,
        answerText
      });

      const vocabularyHints = normalizeVocabularyHints(submitted.vocabularyHints);

      setPendingResult({
        submitted,
        prompt: currentPrompt,
        answerText,
        vocabularyHints
      });
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }

  async function continueAfterResult() {
    if (!bridgeReady || !pendingResult) {
      return;
    }

    setLoading(true);
    setLoadingMessage('Đang cập nhật lịch sử và chuẩn bị câu mới...');
    try {
      await refreshHistory();
      const latest = await window.desktopApi.practice.history(50);
      const latestItem = latest.find((item) => item.answerId === pendingResult.submitted.answerId);
      if (latestItem) {
        await window.desktopApi.review.upsertFromHistory(latestItem);
      }
      await hydrateReviewPool();
      await hydrateDashboard();

      setPendingResult(null);
      setSelectedAnswer('');
      setFreeTextAnswer('');
      setCurrentTab('learning');
      await fetchPrompt();
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }

  async function updateConfig(next: AppConfig) {
    if (!bridgeReady) {
      return;
    }
    const saved = await window.desktopApi.config.update(next);
    setConfig(saved);
    setDraftConfig(saved);
  }

  async function saveConfig() {
    if (!bridgeReady || !configDirty) {
      return;
    }
    setLoading(true);
    setLoadingMessage('Đang lưu cấu hình...');
    try {
      await updateConfig(draftConfig);
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }

  async function toggleHighlight(item: PracticeHistoryItemResponse) {
    if (!bridgeReady) {
      return;
    }
    setReviewBusyAnswerId(item.answerId);
    try {
      await window.desktopApi.review.toggleHighlight(item.answerId);
      await refreshHistory();
      await hydrateReviewPool();
      await hydrateDashboard();
    } finally {
      setReviewBusyAnswerId(null);
    }
  }

  async function toggleManualWord(hint: VocabularyHint, answerId: string, sourceContext: string) {
    if (!bridgeReady) {
      return;
    }

    const term = hint.term.trim();
    const key = manualKey(answerId, term);
    if (manualWordSet.has(key)) {
      await window.desktopApi.manualVocabulary.remove({ term, sourceAnswerId: answerId });
    } else {
      await window.desktopApi.manualVocabulary.add({
        sourceAnswerId: answerId,
        term,
        meaningVi: hint.meaningVi,
        note: hint.note,
        sourceContext
      });
    }
    await hydrateManualVocabulary();
    await hydrateDashboard();
  }

  async function deleteSelectedHistory() {
    if (!bridgeReady || selectedHistoryIds.size === 0) {
      return;
    }
    await window.desktopApi.practice.deleteHistory([...selectedHistoryIds]);
    setSelectedHistoryIds(new Set());
    await refreshHistory();
    await hydrateReviewPool();
    await hydrateManualVocabulary();
    await hydrateDashboard();
  }

  async function deleteSelectedVocabulary() {
    if (!bridgeReady || selectedVocabularyKeys.size === 0) {
      return;
    }
    const items = manualVocabulary
      .filter((item) => selectedVocabularyKeys.has(manualKey(item.sourceAnswerId, item.term)))
      .map((item) => ({ sourceAnswerId: item.sourceAnswerId, term: item.term }));

    await window.desktopApi.manualVocabulary.deleteMany(items);
    setSelectedVocabularyKeys(new Set());
    await hydrateManualVocabulary();
    await hydrateDashboard();
  }

  async function togglePendingHighlight() {
    if (!bridgeReady || !pendingResult) {
      return;
    }
    setLoading(true);
    setLoadingMessage('Đang cập nhật highlight...');
    try {
      await window.desktopApi.review.toggleHighlight(pendingResult.submitted.answerId);
      setPendingResult((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          submitted: {
            ...prev.submitted,
            highlighted: !prev.submitted.highlighted
          }
        };
      });
      await Promise.all([refreshHistory(), hydrateReviewPool(), hydrateDashboard()]);
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }

  function historyVocabulary(item: PracticeHistoryItemResponse): VocabularyHint[] {
    return normalizeVocabularyHints(item.vocabularyHints);
  }

  return (
    <div className="app-root">
      <header className="top-header card">
        <div className="header-title-wrap">
          <h1 className="title">English Coach</h1>
          <p className="subtitle">Desktop · Modern SaaS · Windows-first</p>
        </div>
        <div className="header-actions">
          {!bridgeReady && <span className="badge badge-warn">Bridge offline</span>}
          {!loginRequired && <button className="btn btn-ghost" onClick={onSignOut}>Logout</button>}
        </div>
      </header>

      {loginRequired ? (
        <section className="card panel panel-compact">
          <h2 className="section-title">Đăng nhập</h2>
          <div className="grid2">
            <label>
              Email
              <input value={loginEmail} onChange={(e: ChangeEvent<HTMLInputElement>) => setLoginEmail(e.target.value)} />
            </label>
            <label>
              Password
              <input type="password" value={loginPassword} onChange={(e: ChangeEvent<HTMLInputElement>) => setLoginPassword(e.target.value)} />
            </label>
          </div>
          <button className="btn btn-primary" disabled={loading} onClick={onSignIn}>Đăng nhập</button>
        </section>
      ) : (
        <>
          <nav className="tabs card" aria-label="Main navigation tabs">
            <button className={`tab-btn ${currentTab === 'learning' ? 'active' : ''}`} onClick={() => setCurrentTab('learning')}>Học tập</button>
            <button className={`tab-btn ${currentTab === 'review' ? 'active' : ''}`} onClick={() => setCurrentTab('review')}>Review Daily</button>
            <button className={`tab-btn ${currentTab === 'history' ? 'active' : ''}`} onClick={() => setCurrentTab('history')}>Lịch sử</button>
            <button className={`tab-btn ${currentTab === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentTab('dashboard')}>Dashboard</button>
            <button className={`tab-btn ${currentTab === 'vocabulary' ? 'active' : ''}`} onClick={() => setCurrentTab('vocabulary')}>Vocabulary</button>
            <button className={`tab-btn ${currentTab === 'config' ? 'active' : ''}`} onClick={() => setCurrentTab('config')}>Config</button>
          </nav>

          {currentTab === 'review' && (
            <section className="card panel">
              <div className="toolbar">
                <button className="btn btn-secondary" disabled={loading} onClick={() => void hydrateReviewSummary()}>Làm mới review summary</button>
                <button className="btn btn-primary" disabled={loading || reviewGrading} onClick={() => void startReviewSession()}>Bắt đầu phiên ôn (10)</button>
                <span className="badge">Due: {reviewSummary?.dueCount ?? 0}</span>
                <span className="badge">Overdue: {reviewSummary?.overdueCount ?? 0}</span>
                <span className="badge">New: {reviewSummary?.newCount ?? 0}</span>
                <span className="badge">Streak: {reviewSummary?.streakDays ?? 0} ngày</span>
                <span className="badge">Retention 30d: {reviewSummary?.retentionRate30d ?? 0}%</span>
              </div>

              {reviewSession.length === 0 && (
                <p className="muted">Chưa có phiên ôn nào. Nhấn "Bắt đầu phiên ôn" để lấy danh sách từ đến hạn.</p>
              )}

              {reviewSession.length > 0 && !currentReviewCard && (
                <article className="result-card">
                  <h3>Hoàn thành phiên ôn 🎉</h3>
                  <p>Đã ôn xong {reviewSession.length}/{reviewSession.length} thẻ trong phiên hiện tại.</p>
                </article>
              )}

              {currentReviewCard && (
                <article className="review-card-panel">
                  <div className="history-actions">
                    <span className="badge">Tiến độ: {reviewIndex + 1}/{reviewSession.length}</span>
                    <span className="badge">Còn lại: {reviewRemaining}</span>
                    <span className="badge">State: {currentReviewCard.state}</span>
                    <span className="badge">Interval: {currentReviewCard.intervalDays}d</span>
                    <span className="badge">Ease: {currentReviewCard.easeFactor.toFixed(2)}</span>
                  </div>

                  <div className="result-section result-question">
                    <p><strong>Term:</strong> {currentReviewCard.term}</p>
                    <p><strong>Meaning:</strong> {currentReviewCard.meaningVi}</p>
                    {currentReviewCard.note && <p><strong>Note:</strong> {currentReviewCard.note}</p>}
                  </div>

                  {!!currentReviewCard.sourceContext && (
                    <pre className="context-text">{currentReviewCard.sourceContext}</pre>
                  )}

                  <div className="history-actions">
                    <button className="btn btn-ghost" disabled={reviewGrading} onClick={() => void gradeReview(1)}>Again (1)</button>
                    <button className="btn btn-secondary" disabled={reviewGrading} onClick={() => void gradeReview(4)}>Good (4)</button>
                    <button className="btn btn-primary" disabled={reviewGrading} onClick={() => void gradeReview(5)}>Easy (5)</button>
                  </div>
                </article>
              )}
            </section>
          )}

          {currentTab === 'learning' && (
            <section className="card panel">
              <div className="toolbar">
                <span className="badge">Periodic: {config.periodicEnabled ? `ON · ${config.periodicIntervalSeconds}s` : 'OFF'}</span>
                <span className="badge">⏳ {String(Math.floor(countdown / 60)).padStart(2, '0')}:{String(countdown % 60).padStart(2, '0')}</span>
                <span className="badge">Level: {config.practiceLevel}</span>
              </div>
              <button className="btn btn-primary" disabled={loading || Boolean(pendingResult)} onClick={fetchPrompt}>Lấy câu hỏi mới</button>

              <div className="question-box">
                <h3 className="question-title">{currentPrompt?.promptText ?? 'Nhấn "Lấy câu hỏi mới" để bắt đầu.'}</h3>
                {!!currentPrompt?.hint && (
                  <div className="history-actions" style={{ marginTop: 8 }}>
                    <button
                      className="btn btn-ghost"
                      onClick={() => setHintStep((prev) => (prev === 0 ? 1 : prev === 1 ? 2 : 0))}
                      disabled={loading || Boolean(pendingResult)}
                    >
                      {hintStep === 0 ? 'Show hint (cấp 1)' : hintStep === 1 ? 'Show hint (cấp 2)' : 'Ẩn gợi ý'}
                    </button>
                    {hintStep >= 1 && (
                      <div className="muted">
                        <div>💡 <strong>Pattern:</strong> {currentPrompt.hint.grammarPattern}</div>
                        <div><strong>Formula:</strong> {currentPrompt.hint.formula}</div>
                      </div>
                    )}
                    {hintStep >= 2 && (
                      <div className="muted">
                        <div><strong>Key vocabulary:</strong> {currentPrompt.hint.keyVocabulary.join(', ')}</div>
                        <div><strong>Usage note:</strong> {currentPrompt.hint.usageNote}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!pendingResult && (
                <>
                  {config.answerMode === 'MULTIPLE_CHOICE' ? (
                    <div className="answers-grid">
                      {answerChoices.map((choice) => (
                        <button
                          key={choice}
                          className={`answer-btn ${selectedAnswer === choice ? 'selected' : ''}`}
                          onClick={() => setSelectedAnswer(choice)}
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      className="answer-input"
                      rows={4}
                      value={freeTextAnswer}
                      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setFreeTextAnswer(e.target.value)}
                      placeholder="Nhập câu trả lời tự do..."
                    />
                  )}

                  <button className="btn btn-primary" disabled={loading} onClick={submitAnswer}>Nộp câu trả lời</button>
                </>
              )}

              {pendingResult && (
                <article className="result-card">
                  <h3>Kết quả câu trả lời</h3>
                  <div className="result-section result-question">
                    <p><strong>Question:</strong> {pendingResult.prompt.promptText}</p>
                  </div>
                  <div className="result-section result-answer">
                    <p><strong>Your answer:</strong> {pendingResult.answerText}</p>
                  </div>
                  <div className="result-section result-ai">
                    <p><strong>Status:</strong> {pendingResult.submitted.evaluationStatus}</p>
                    <p><strong>Score:</strong> Overall {pendingResult.submitted.overallScore} · G {pendingResult.submitted.grammarScore} · N {pendingResult.submitted.naturalnessScore} · V {pendingResult.submitted.vocabularyScore}</p>
                    <p><strong>Suggestion:</strong> {pendingResult.submitted.betterPhrasing}</p>
                    <p className="muted"><strong>Feedback:</strong> {pendingResult.submitted.explanation}</p>
                    <p><strong>Highlight:</strong> {pendingResult.submitted.highlighted ? '★ Đã highlight' : 'Chưa highlight'}</p>
                  </div>

                  <div className="vocab-chips">
                    {pendingResult.vocabularyHints.map((hint) => {
                      const word = hint.term;
                      const key = manualKey(pendingResult.submitted.answerId, word);
                      const selected = manualWordSet.has(key);
                      return (
                        <button
                          key={word}
                          className={`chip ${selected ? 'selected' : ''}`}
                          onClick={() => void toggleManualWord(
                            hint,
                            pendingResult.submitted.answerId,
                            `${pendingResult.submitted.betterPhrasing}\n${hint.term}: ${hint.meaningVi}${hint.note ? ` (${hint.note})` : ''}`
                          )}
                        >
                          {selected ? '✓ ' : '+ '}{hint.term} · {hint.meaningVi}
                        </button>
                      );
                    })}
                  </div>

                  <div className="history-actions">
                    <button
                      className="btn btn-ghost"
                      onClick={() => void togglePendingHighlight()}
                      disabled={loading}
                    >
                      {pendingResult.submitted.highlighted ? 'Bỏ highlight' : 'Highlight'}
                    </button>
                    <button className="btn btn-primary" onClick={() => void continueAfterResult()} disabled={loading}>Tiếp tục</button>
                    <button className="btn btn-ghost" onClick={() => setCurrentTab('history')}>Xem History</button>
                  </div>
                </article>
              )}
            </section>
          )}

          {currentTab === 'history' && (
            <section className="card panel">
              <div className="toolbar">
                <button className="btn btn-secondary" disabled={loading} onClick={() => void refreshHistory()}>Làm mới lịch sử</button>
                <span className="badge">Review pool: {reviewPool.length}</span>
                <span className="badge">Highlight: {highlightedCount}</span>
                <div className="toolbar-group">
                  <button
                    className={`btn ${historyViewMode === 'full' ? 'btn-secondary' : 'btn-ghost'}`}
                    disabled={loading}
                    onClick={() => setHistoryViewMode('full')}
                  >
                    Full
                  </button>
                  <button
                    className={`btn ${historyViewMode === 'short' ? 'btn-secondary' : 'btn-ghost'}`}
                    disabled={loading}
                    onClick={() => setHistoryViewMode('short')}
                  >
                    Short
                  </button>
                </div>
                <label className="checkbox-row checkbox-compact">
                  <input
                    className="checkbox-input"
                    type="checkbox"
                    checked={historyHighlightOnly}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setHistoryHighlightOnly(e.target.checked)}
                  />
                  <span className="checkbox-label-text">Highlight only</span>
                </label>
                <button className="btn btn-ghost" disabled={selectedHistoryIds.size === 0 || loading} onClick={() => void deleteSelectedHistory()}>
                  Xóa mục đã chọn ({selectedHistoryIds.size})
                </button>
                <div className="history-pagination">
                  <button
                    className="btn btn-ghost"
                    disabled={loading || historyPage <= 1}
                    onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
                  >
                    Prev
                  </button>
                  <span className="badge">Page {historyPage}/{historyTotalPages}</span>
                  <button
                    className="btn btn-ghost"
                    disabled={loading || historyPage >= historyTotalPages}
                    onClick={() => setHistoryPage((prev) => Math.min(historyTotalPages, prev + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
              <div className="history-list">
                {filteredHistory.length === 0 && (
                  <p className="muted">{historyHighlightOnly ? 'Không có mục highlight.' : 'Chưa có dữ liệu lịch sử.'}</p>
                )}
                {pagedHistory.map((item) => {
                  const hints = historyVocabulary(item);
                  return (
                    <article key={item.answerId} className="history-card">
                      <div className="history-head">
                        <div className="history-meta">
                          <label className="checkbox-row checkbox-compact">
                            <input
                              className="checkbox-input"
                              type="checkbox"
                              checked={selectedHistoryIds.has(item.answerId)}
                              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                setSelectedHistoryIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) {
                                    next.add(item.answerId);
                                  } else {
                                    next.delete(item.answerId);
                                  }
                                  return next;
                                });
                              }}
                            />
                            <span className="checkbox-label-text">Chọn</span>
                          </label>
                          <strong>{new Date(item.submittedAt).toLocaleString()}</strong>
                          <span className={`badge ${item.evaluationStatus !== 'PASS' ? 'badge-warn' : ''}`}>{item.evaluationStatus}</span>
                          {item.highlighted && <span className="badge">★ Highlight</span>}
                        </div>
                        {historyViewMode === 'full' && (
                          <div className="score-cluster">
                            <span className="score-pill">Overall {item.overallScore}</span>
                            <span className="score-sub">G {item.grammarScore}</span>
                            <span className="score-sub">N {item.naturalnessScore}</span>
                            <span className="score-sub">V {item.vocabularyScore}</span>
                          </div>
                        )}
                      </div>

                      <div className="history-content">
                        <p><strong>Prompt:</strong> {item.sourceSentence}</p>
                        <p><strong>Suggestion:</strong> {item.betterPhrasing}</p>
                        {historyViewMode === 'full' && (
                          <>
                            <p><strong>Your answer:</strong> {item.userAnswer}</p>
                            <p className="muted"><strong>Feedback:</strong> {item.explanation}</p>
                          </>
                        )}
                      </div>

                      {historyViewMode === 'full' && (
                        <>
                          <div className="vocab-chips">
                            {hints.map((hint) => {
                              const word = hint.term;
                              const key = manualKey(item.answerId, word);
                              const selected = manualWordSet.has(key);
                              return (
                                <button
                                  key={`${item.answerId}-${word}`}
                                  className={`chip ${selected ? 'selected' : ''}`}
                                  onClick={() => void toggleManualWord(
                                    hint,
                                    item.answerId,
                                    `${item.betterPhrasing}\n${hint.term}: ${hint.meaningVi}${hint.note ? ` (${hint.note})` : ''}`
                                  )}
                                >
                                  {selected ? '✓ ' : '+ '}{hint.term} · {hint.meaningVi}
                                </button>
                              );
                            })}
                          </div>

                          <div className="history-actions">
                            <button
                              className="btn btn-ghost"
                              disabled={reviewBusyAnswerId === item.answerId}
                              onClick={() => void toggleHighlight(item)}
                            >
                              {reviewMap.get(item.answerId)?.highlighted ? 'Bỏ highlight' : 'Highlight'}
                            </button>
                          </div>
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {currentTab === 'dashboard' && (
            <section className="card panel">
              <div className="toolbar">
                <button className="btn btn-secondary" disabled={loading} onClick={() => void hydrateDashboard()}>Làm mới dashboard</button>
              </div>
              {!dashboardSummary && <p className="muted">Chưa có dữ liệu dashboard.</p>}
              {dashboardSummary && (
                <div className="dashboard-grid">
                  <article className="dashboard-card">
                    <h3>Today</h3>
                    <p>Practiced: <strong>{dashboardSummary.today.practicedCount}</strong></p>
                    <p>Avg score: <strong>{dashboardSummary.today.averageOverallScore}</strong></p>
                    <p>Highlighted: <strong>{dashboardSummary.today.highlightedCount}</strong></p>
                    <p>Saved words: <strong>{dashboardSummary.today.savedWordsCount}</strong></p>
                  </article>
                  <article className="dashboard-card">
                    <h3>Week</h3>
                    <p>Practiced: <strong>{dashboardSummary.week.practicedCount}</strong></p>
                    <p>Avg score: <strong>{dashboardSummary.week.averageOverallScore}</strong></p>
                    <p>Highlighted: <strong>{dashboardSummary.week.highlightedCount}</strong></p>
                    <p>Saved words: <strong>{dashboardSummary.week.savedWordsCount}</strong></p>
                  </article>
                  <article className="dashboard-card">
                    <h3>Month</h3>
                    <p>Practiced: <strong>{dashboardSummary.month.practicedCount}</strong></p>
                    <p>Avg score: <strong>{dashboardSummary.month.averageOverallScore}</strong></p>
                    <p>Highlighted: <strong>{dashboardSummary.month.highlightedCount}</strong></p>
                    <p>Saved words: <strong>{dashboardSummary.month.savedWordsCount}</strong></p>
                  </article>
                  <article className="dashboard-card">
                    <h3>Memory</h3>
                    <p>Due: <strong>{dashboardSummary.dueCount}</strong></p>
                    <p>Overdue: <strong>{dashboardSummary.overdueCount}</strong></p>
                    <p>Retention 30d: <strong>{dashboardSummary.retentionRate30d}%</strong></p>
                    <p>Streak: <strong>{dashboardSummary.streakDays} ngày</strong></p>
                  </article>
                </div>
              )}
            </section>
          )}

          {currentTab === 'vocabulary' && (
            <section className="card panel">
              <div className="toolbar">
                <button className="btn btn-secondary" disabled={loading} onClick={() => void hydrateManualVocabulary()}>Làm mới vocabulary</button>
                <span className="badge">Manual words: {manualVocabulary.length}</span>
                <button className="btn btn-ghost" disabled={selectedVocabularyKeys.size === 0 || loading} onClick={() => void deleteSelectedVocabulary()}>
                  Xóa mục đã chọn ({selectedVocabularyKeys.size})
                </button>
              </div>

              <div className="vocabulary-list">
                {manualVocabulary.length === 0 && <p className="muted">Chưa có từ vựng nào được chọn thủ công.</p>}
                {manualVocabulary.map((item) => (
                  <article key={`${item.sourceAnswerId}-${item.term}-${item.selectedAt}`} className="vocabulary-card">
                    <div className="vocabulary-main">
                      <label className="checkbox-row checkbox-compact">
                        <input
                          className="checkbox-input"
                          type="checkbox"
                          checked={selectedVocabularyKeys.has(manualKey(item.sourceAnswerId, item.term))}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => {
                            setSelectedVocabularyKeys((prev) => {
                              const next = new Set(prev);
                              const key = manualKey(item.sourceAnswerId, item.term);
                              if (e.target.checked) {
                                next.add(key);
                              } else {
                                next.delete(key);
                              }
                              return next;
                            });
                          }}
                        />
                        <span className="checkbox-label-text">Chọn</span>
                      </label>
                      <strong>{item.term}</strong>
                      <span className="muted">Nghĩa: {item.meaningVi}</span>
                      {item.note && <span className="muted">Ghi chú: {item.note}</span>}
                      <span className="muted">From answer: {item.sourceAnswerId.slice(0, 8)}</span>
                      <pre className="context-text">Suggestion/Context:
{item.sourceContext}</pre>
                    </div>
                    <button
                      className="btn btn-ghost"
                      onClick={() => void window.desktopApi.manualVocabulary.remove({ term: item.term, sourceAnswerId: item.sourceAnswerId }).then(() => Promise.all([hydrateManualVocabulary(), hydrateDashboard()]))}
                    >
                      Bỏ chọn
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {currentTab === 'config' && (
            <section className="card panel panel-compact">
              <h2 className="section-title">Cấu hình</h2>
              <label>
                Backend URL
                <input
                  value={draftConfig.backendBaseUrl}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setDraftConfig((prev) => ({ ...prev, backendBaseUrl: e.target.value }))}
                />
              </label>

              <label className="checkbox-row checkbox-setting">
                <input
                  className="checkbox-input"
                  type="checkbox"
                  checked={draftConfig.periodicEnabled}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    setDraftConfig((prev) => ({ ...prev, periodicEnabled: e.target.checked }));
                  }}
                />
                <span className="checkbox-label-text">Bật câu hỏi định kỳ</span>
              </label>

              <label>
                Chu kỳ (giây)
                <input
                  type="number"
                  min={10}
                  max={600}
                  value={draftConfig.periodicIntervalSeconds}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const val = Number(e.target.value);
                    setDraftConfig((prev) => ({
                      ...prev,
                      periodicIntervalSeconds: Number.isNaN(val) ? 45 : val
                    }));
                  }}
                />
              </label>

              <label>
                Chủ đề luyện tập
                <select
                  value={draftConfig.practiceTopic}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    setDraftConfig((prev) => ({ ...prev, practiceTopic: e.target.value }));
                  }}
                >
                  {practiceTopics.map((topic) => (
                    <option key={topic} value={topic}>{topic}</option>
                  ))}
                </select>
              </label>

              <label>
                Độ khó
                <select
                  value={draftConfig.practiceLevel}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    setDraftConfig((prev) => ({
                      ...prev,
                      practiceLevel: e.target.value as AppConfig['practiceLevel']
                    }));
                  }}
                >
                  <option value="easy">easy</option>
                  <option value="medium">medium</option>
                  <option value="hard">hard</option>
                </select>
              </label>

              <label>
                Chế độ trả lời
                <select
                  value={draftConfig.answerMode}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    setDraftConfig((prev) => ({
                      ...prev,
                      answerMode: e.target.value as AppConfig['answerMode']
                    }));
                  }}
                >
                  <option value="MULTIPLE_CHOICE">Trắc nghiệm</option>
                  <option value="FREE_TEXT">Tự nhập</option>
                </select>
              </label>

              <div className="history-actions">
                {configDirty && <span className="badge badge-warn">Có thay đổi chưa lưu</span>}
                <button className="btn btn-primary" disabled={!configDirty || loading} onClick={() => void saveConfig()}>
                  Save
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {loading && (
        <div className="loading-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="loading-card">
            <span className="spinner" />
            <span>{loadingMessage || 'Đang xử lý...'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

