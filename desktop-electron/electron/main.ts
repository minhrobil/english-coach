import { app, BrowserWindow, ipcMain, Menu, Notification, Tray } from 'electron';
import type {
  BrowserWindow as BrowserWindowType,
  Event as ElectronEvent,
  IpcMainInvokeEvent,
  Tray as TrayType
} from 'electron';
import path from 'node:path';
import type {
  AppConfig,
  DashboardRangeKey,
  DashboardRangeSummary,
  DashboardSummary,
  ManualVocabularyItem,
  PracticeHistoryItemResponse,
  PracticePromptResponse,
  PracticeSubmitResponse,
  ReviewCard,
  ReviewGradeResponse,
  ReviewSummary,
  ReviewItem,
  SignInResponse
} from '../src/types';
import * as api from './backend-api';

const DEFAULT_CONFIG: AppConfig = {
  backendBaseUrl: 'http://localhost:8088',
  periodicEnabled: true,
  periodicIntervalSeconds: 45,
  answerMode: 'MULTIPLE_CHOICE',
  practiceTopic: 'work',
  practiceLevel: 'medium'
};

function normalizeConfig(config: AppConfig): AppConfig {
  const safeLevel = ['easy', 'medium', 'hard'].includes(String(config.practiceLevel))
    ? config.practiceLevel
    : 'medium';
  return {
    ...DEFAULT_CONFIG,
    ...config,
    practiceLevel: safeLevel
  };
}

let state: { config: AppConfig; accessToken: string } = {
  config: DEFAULT_CONFIG,
  accessToken: ''
};

let mainWindow: BrowserWindowType | null = null;
let tray: TrayType | null = null;
let periodicTimer: NodeJS.Timeout | null = null;
let countdownTimer: NodeJS.Timeout | null = null;
let secondsRemaining = DEFAULT_CONFIG.periodicIntervalSeconds;
let hasUnansweredPrompt = false;

function isDev(): boolean {
  return !app.isPackaged;
}

function createMainWindow(): BrowserWindowType {
  const preloadPath = path.join(__dirname, 'preload.cjs');
  const win = new BrowserWindow({
    width: 1200,
    height: 840,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.on('close', (event: ElectronEvent) => {
    if (!app.isQuiting) {
      event.preventDefault();
      win.hide();
    }
  });

  if (isDev()) {
    void win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  }

  return win;
}

function focusLearningWithPrompt(prompt?: PracticePromptResponse): void {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('navigation:learning', prompt ?? null);
}

function showPromptNotification(prompt: PracticePromptResponse): void {
  const notification = new Notification({
    title: 'English Coach - Câu hỏi mới',
    body: prompt.promptText.slice(0, 160),
    urgency: 'normal'
  });
  notification.on('click', () => focusLearningWithPrompt(prompt));
  notification.show();
}

function createTray(): void {
  tray = new Tray(process.execPath);
  tray.setToolTip('English Coach Desktop');
  tray.on('click', () => focusLearningWithPrompt());

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Mở English Coach', click: () => focusLearningWithPrompt() },
    {
      label: 'Thoát',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
}

function sendCountdown(seconds: number): void {
  mainWindow?.webContents.send('scheduler:countdown', seconds);
}

function stopScheduler(): void {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function startScheduler(): void {
  stopScheduler();
  const config = state.config;
  if (!config.periodicEnabled || !state.accessToken) {
    return;
  }
  const interval = Math.max(10, config.periodicIntervalSeconds);
  secondsRemaining = interval;
  sendCountdown(secondsRemaining);

  periodicTimer = setInterval(async () => {
    if (hasUnansweredPrompt) {
      return;
    }
    try {
      const prompt = await api.nextPromptWithConfig(
        config.backendBaseUrl,
        state.accessToken,
        config.practiceTopic,
        config.practiceLevel
      );
      hasUnansweredPrompt = true;
      mainWindow?.webContents.send('prompt:incoming', prompt);
      showPromptNotification(prompt);
    } catch (error) {
      mainWindow?.webContents.send('scheduler:error', String(error));
    }
    secondsRemaining = interval;
    sendCountdown(secondsRemaining);
  }, interval * 1000);

  countdownTimer = setInterval(() => {
    if (hasUnansweredPrompt) {
      return;
    }
    secondsRemaining = Math.max(0, secondsRemaining - 1);
    sendCountdown(secondsRemaining);
  }, 1000);
}

async function getHistory(limit: number): Promise<PracticeHistoryItemResponse[]> {
  if (!state.accessToken) {
    throw new Error('Unauthorized: missing access token');
  }
  return api.getPracticeHistory(state.config.backendBaseUrl, state.accessToken, limit);
}

function toReviewItem(item: PracticeHistoryItemResponse): ReviewItem {
  return {
    answerId: item.answerId,
    promptId: item.promptId,
    sourceSentence: item.sourceSentence,
    referenceAnswer: item.referenceAnswer,
    userAnswer: item.userAnswer,
    overallScore: item.overallScore,
    grammarScore: item.grammarScore,
    naturalnessScore: item.naturalnessScore,
    vocabularyScore: item.vocabularyScore,
    explanation: item.explanation,
    betterPhrasing: item.betterPhrasing,
    evaluationStatus: item.evaluationStatus,
    submittedAt: item.submittedAt,
    savedAt: item.submittedAt,
    highlighted: item.highlighted
  };
}

function summaryForRange(range: DashboardRangeKey, now: Date, reviewItems: ReviewItem[], savedWordsCount: number): DashboardRangeSummary {
  const start = new Date(now);
  if (range === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (range === 'week') {
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
  }
  const selected = reviewItems.filter((item) => new Date(item.submittedAt) >= start);
  const practicedCount = selected.length;
  const averageOverallScore = practicedCount === 0
    ? 0
    : Number((selected.reduce((sum, item) => sum + item.overallScore, 0) / practicedCount).toFixed(1));

  return {
    range,
    practicedCount,
    averageOverallScore,
    highlightedCount: selected.filter((item) => item.highlighted).length,
    savedWordsCount
  };
}

ipcMain.handle('config:get', async (): Promise<AppConfig> => {
  if (!state.accessToken) {
    return state.config;
  }
  state.config = normalizeConfig(await api.getPracticeConfig(state.config.backendBaseUrl, state.accessToken));
  return state.config;
});

ipcMain.handle('config:update', async (_event: IpcMainInvokeEvent, config: AppConfig): Promise<AppConfig> => {
  const safeConfig: AppConfig = normalizeConfig({
    ...config,
    periodicIntervalSeconds: Math.max(10, Math.min(600, config.periodicIntervalSeconds))
  });
  state.config = safeConfig;
  if (state.accessToken) {
    state.config = normalizeConfig(await api.updatePracticeConfig(safeConfig.backendBaseUrl, state.accessToken, safeConfig));
  }
  startScheduler();
  return state.config;
});

ipcMain.handle('auth:signin', async (_event: IpcMainInvokeEvent, email: string, password: string): Promise<SignInResponse> => {
  const response = await api.signIn(state.config.backendBaseUrl, email, password);
  state.accessToken = response.accessToken;
  try {
    state.config = normalizeConfig(await api.getPracticeConfig(state.config.backendBaseUrl, state.accessToken));
  } catch {
    // keep default/local runtime config
  }
  startScheduler();
  return response;
});

ipcMain.handle('auth:signout', async (): Promise<void> => {
  if (state.accessToken) {
    try {
      await api.signOut(state.config.backendBaseUrl, state.accessToken);
    } catch {
      // best effort
    }
  }
  state.accessToken = '';
  hasUnansweredPrompt = false;
  stopScheduler();
});

ipcMain.handle('practice:instant', async (): Promise<PracticePromptResponse> => {
  if (!state.accessToken) {
    throw new Error('Unauthorized: missing access token');
  }
  const prompt = await api.createInstantSession(
    state.config.backendBaseUrl,
    state.accessToken,
    state.config.practiceTopic,
    state.config.practiceLevel
  );
  hasUnansweredPrompt = true;
  return prompt;
});

ipcMain.handle('practice:submit', async (_event: IpcMainInvokeEvent, payload: {
  promptId: string;
  sourceSentence: string;
  referenceAnswer: string;
  answerText: string;
}): Promise<PracticeSubmitResponse> => {
  if (!state.accessToken) {
    throw new Error('Unauthorized: missing access token');
  }
  const submitted = await api.submitAnswer(state.config.backendBaseUrl, state.accessToken, payload);
  hasUnansweredPrompt = false;
  secondsRemaining = Math.max(10, state.config.periodicIntervalSeconds);
  sendCountdown(secondsRemaining);
  return submitted;
});

ipcMain.handle('practice:history', async (_event: IpcMainInvokeEvent, limit: number): Promise<PracticeHistoryItemResponse[]> => {
  return getHistory(limit);
});

ipcMain.handle('practice:deleteHistory', async (_event: IpcMainInvokeEvent, answerIds: string[]): Promise<{ deletedCount: number }> => {
  if (!state.accessToken) {
    throw new Error('Unauthorized: missing access token');
  }
  return api.deleteHistory(state.config.backendBaseUrl, state.accessToken, answerIds);
});

ipcMain.handle('review:getAll', async (): Promise<ReviewItem[]> => {
  const history = await getHistory(100);
  return history.map(toReviewItem);
});

ipcMain.handle('review:getHighlighted', async (): Promise<ReviewItem[]> => {
  const history = await getHistory(100);
  return history.filter((item) => item.highlighted).map(toReviewItem);
});

ipcMain.handle('review:upsertFromHistory', async (_event: IpcMainInvokeEvent, item: PracticeHistoryItemResponse): Promise<ReviewItem> => {
  return toReviewItem(item);
});

ipcMain.handle('review:toggleHighlight', async (_event: IpcMainInvokeEvent, answerId: string): Promise<ReviewItem | null> => {
  if (!state.accessToken) {
    throw new Error('Unauthorized: missing access token');
  }
  const history = await getHistory(200);
  const current = history.find((h) => h.answerId === answerId);
  if (!current) {
    return null;
  }
  await api.setHistoryHighlight(state.config.backendBaseUrl, state.accessToken, answerId, !current.highlighted);
  return toReviewItem({ ...current, highlighted: !current.highlighted });
});

ipcMain.handle('dashboard:getSummary', async (): Promise<DashboardSummary> => {
  const [history, manualVocabulary, reviewSummary] = await Promise.all([
    getHistory(300),
    state.accessToken
      ? api.getManualVocabulary(state.config.backendBaseUrl, state.accessToken, 500)
      : Promise.resolve([] as ManualVocabularyItem[]),
    state.accessToken
      ? api.getReviewSummary(state.config.backendBaseUrl, state.accessToken)
      : Promise.resolve({
        dueCount: 0,
        overdueCount: 0,
        newCount: 0,
        todayReviewedCount: 0,
        retentionRate30d: 0,
        streakDays: 0
      } satisfies ReviewSummary)
  ]);

  const reviewItems = history.map(toReviewItem);
  const savedWordsCount = new Set(manualVocabulary.map((item) => `${item.sourceAnswerId}::${item.term}`)).size;
  const now = new Date();
  return {
    today: summaryForRange('today', now, reviewItems, savedWordsCount),
    week: summaryForRange('week', now, reviewItems, savedWordsCount),
    month: summaryForRange('month', now, reviewItems, savedWordsCount),
    totalReviewed: reviewItems.length,
    dueCount: reviewSummary.dueCount,
    overdueCount: reviewSummary.overdueCount,
    retentionRate30d: reviewSummary.retentionRate30d,
    streakDays: reviewSummary.streakDays
  };
});

ipcMain.handle('review:summary', async (): Promise<ReviewSummary> => {
  if (!state.accessToken) {
    throw new Error('Unauthorized: missing access token');
  }
  return api.getReviewSummary(state.config.backendBaseUrl, state.accessToken);
});

ipcMain.handle('review:session', async (_event: IpcMainInvokeEvent, limit: number): Promise<ReviewCard[]> => {
  if (!state.accessToken) {
    throw new Error('Unauthorized: missing access token');
  }
  return api.getReviewSession(state.config.backendBaseUrl, state.accessToken, Math.max(1, Math.min(50, limit || 10)));
});

ipcMain.handle('review:grade', async (_event: IpcMainInvokeEvent, payload: { cardId: string; quality: number }): Promise<ReviewGradeResponse> => {
  if (!state.accessToken) {
    throw new Error('Unauthorized: missing access token');
  }
  return api.gradeReviewCard(state.config.backendBaseUrl, state.accessToken, payload);
});

ipcMain.handle('manualVocabulary:getAll', async (): Promise<ManualVocabularyItem[]> => {
  if (!state.accessToken) {
    throw new Error('Unauthorized: missing access token');
  }
  return api.getManualVocabulary(state.config.backendBaseUrl, state.accessToken, 500);
});

ipcMain.handle('manualVocabulary:add', async (_event: IpcMainInvokeEvent, payload: {
  sourceAnswerId: string;
  term: string;
  meaningVi: string;
  note: string;
  sourceContext: string;
}): Promise<ManualVocabularyItem> => {
  if (!state.accessToken) {
    throw new Error('Unauthorized: missing access token');
  }
  return api.addManualVocabulary(state.config.backendBaseUrl, state.accessToken, payload);
});

ipcMain.handle('manualVocabulary:remove', async (_event: IpcMainInvokeEvent, payload: {
  sourceAnswerId: string;
  term: string;
}): Promise<boolean> => {
  if (!state.accessToken) {
    throw new Error('Unauthorized: missing access token');
  }
  const res = await api.deleteManualVocabulary(state.config.backendBaseUrl, state.accessToken, [{
    sourceAnswerId: payload.sourceAnswerId,
    term: payload.term
  }]);
  return res.deletedCount > 0;
});

ipcMain.handle('manualVocabulary:deleteMany', async (_event: IpcMainInvokeEvent, items: Array<{ sourceAnswerId: string; term: string }>): Promise<{ deletedCount: number }> => {
  if (!state.accessToken) {
    throw new Error('Unauthorized: missing access token');
  }
  return api.deleteManualVocabulary(state.config.backendBaseUrl, state.accessToken, items);
});

process.on('unhandledRejection', (reason) => {
  console.error('[electron/main] unhandledRejection:', reason);
});

app.whenReady()
  .then(() => {
    mainWindow = createMainWindow();
    createTray();
    startScheduler();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      } else {
        focusLearningWithPrompt();
      }
    });
  })
  .catch((error) => {
    console.error('[electron/main] app.whenReady failed:', error);
  });

app.on('before-quit', () => {
  app.isQuiting = true;
  stopScheduler();
});

app.on('window-all-closed', () => {
  // keep app in tray
});

declare global {
  namespace Electron {
    interface App {
      isQuiting?: boolean;
    }
  }
}

