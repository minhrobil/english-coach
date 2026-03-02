"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const api = __importStar(require("./backend-api"));
const DEFAULT_CONFIG = {
    backendBaseUrl: 'http://localhost:8088',
    periodicEnabled: true,
    periodicIntervalSeconds: 45,
    answerMode: 'MULTIPLE_CHOICE',
    practiceTopic: 'work',
    practiceLevel: 'medium'
};
function normalizeConfig(config) {
    const safeLevel = ['easy', 'medium', 'hard'].includes(String(config.practiceLevel))
        ? config.practiceLevel
        : 'medium';
    return {
        ...DEFAULT_CONFIG,
        ...config,
        practiceLevel: safeLevel
    };
}
let state = {
    config: DEFAULT_CONFIG,
    accessToken: ''
};
let mainWindow = null;
let tray = null;
let periodicTimer = null;
let countdownTimer = null;
let secondsRemaining = DEFAULT_CONFIG.periodicIntervalSeconds;
let hasUnansweredPrompt = false;
function isDev() {
    return !electron_1.app.isPackaged;
}
function createMainWindow() {
    const preloadPath = node_path_1.default.join(__dirname, 'preload.cjs');
    const win = new electron_1.BrowserWindow({
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
    win.on('close', (event) => {
        if (!electron_1.app.isQuiting) {
            event.preventDefault();
            win.hide();
        }
    });
    if (isDev()) {
        void win.loadURL('http://localhost:5173');
        win.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        void win.loadFile(node_path_1.default.join(electron_1.app.getAppPath(), 'dist', 'index.html'));
    }
    return win;
}
function focusLearningWithPrompt(prompt) {
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
function showPromptNotification(prompt) {
    const notification = new electron_1.Notification({
        title: 'English Coach - Câu hỏi mới',
        body: prompt.promptText.slice(0, 160),
        urgency: 'normal'
    });
    notification.on('click', () => focusLearningWithPrompt(prompt));
    notification.show();
}
function createTray() {
    tray = new electron_1.Tray(process.execPath);
    tray.setToolTip('English Coach Desktop');
    tray.on('click', () => focusLearningWithPrompt());
    const contextMenu = electron_1.Menu.buildFromTemplate([
        { label: 'Mở English Coach', click: () => focusLearningWithPrompt() },
        {
            label: 'Thoát',
            click: () => {
                electron_1.app.isQuiting = true;
                electron_1.app.quit();
            }
        }
    ]);
    tray.setContextMenu(contextMenu);
}
function sendCountdown(seconds) {
    mainWindow?.webContents.send('scheduler:countdown', seconds);
}
function stopScheduler() {
    if (periodicTimer) {
        clearInterval(periodicTimer);
        periodicTimer = null;
    }
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
}
function startScheduler() {
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
            const prompt = await api.nextPromptWithConfig(config.backendBaseUrl, state.accessToken, config.practiceTopic, config.practiceLevel);
            hasUnansweredPrompt = true;
            mainWindow?.webContents.send('prompt:incoming', prompt);
            showPromptNotification(prompt);
        }
        catch (error) {
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
async function getHistory(limit) {
    if (!state.accessToken) {
        throw new Error('Unauthorized: missing access token');
    }
    return api.getPracticeHistory(state.config.backendBaseUrl, state.accessToken, limit);
}
function toReviewItem(item) {
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
function summaryForRange(range, now, reviewItems, savedWordsCount) {
    const start = new Date(now);
    if (range === 'today') {
        start.setHours(0, 0, 0, 0);
    }
    else if (range === 'week') {
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);
    }
    else {
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
electron_1.ipcMain.handle('config:get', async () => {
    if (!state.accessToken) {
        return state.config;
    }
    state.config = normalizeConfig(await api.getPracticeConfig(state.config.backendBaseUrl, state.accessToken));
    return state.config;
});
electron_1.ipcMain.handle('config:update', async (_event, config) => {
    const safeConfig = normalizeConfig({
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
electron_1.ipcMain.handle('auth:signin', async (_event, email, password) => {
    const response = await api.signIn(state.config.backendBaseUrl, email, password);
    state.accessToken = response.accessToken;
    try {
        state.config = normalizeConfig(await api.getPracticeConfig(state.config.backendBaseUrl, state.accessToken));
    }
    catch {
        // keep default/local runtime config
    }
    startScheduler();
    return response;
});
electron_1.ipcMain.handle('auth:signout', async () => {
    if (state.accessToken) {
        try {
            await api.signOut(state.config.backendBaseUrl, state.accessToken);
        }
        catch {
            // best effort
        }
    }
    state.accessToken = '';
    hasUnansweredPrompt = false;
    stopScheduler();
});
electron_1.ipcMain.handle('practice:instant', async () => {
    if (!state.accessToken) {
        throw new Error('Unauthorized: missing access token');
    }
    const prompt = await api.createInstantSession(state.config.backendBaseUrl, state.accessToken, state.config.practiceTopic, state.config.practiceLevel);
    hasUnansweredPrompt = true;
    return prompt;
});
electron_1.ipcMain.handle('practice:submit', async (_event, payload) => {
    if (!state.accessToken) {
        throw new Error('Unauthorized: missing access token');
    }
    const submitted = await api.submitAnswer(state.config.backendBaseUrl, state.accessToken, payload);
    hasUnansweredPrompt = false;
    secondsRemaining = Math.max(10, state.config.periodicIntervalSeconds);
    sendCountdown(secondsRemaining);
    return submitted;
});
electron_1.ipcMain.handle('practice:history', async (_event, limit) => {
    return getHistory(limit);
});
electron_1.ipcMain.handle('practice:deleteHistory', async (_event, answerIds) => {
    if (!state.accessToken) {
        throw new Error('Unauthorized: missing access token');
    }
    return api.deleteHistory(state.config.backendBaseUrl, state.accessToken, answerIds);
});
electron_1.ipcMain.handle('review:getAll', async () => {
    const history = await getHistory(100);
    return history.map(toReviewItem);
});
electron_1.ipcMain.handle('review:getHighlighted', async () => {
    const history = await getHistory(100);
    return history.filter((item) => item.highlighted).map(toReviewItem);
});
electron_1.ipcMain.handle('review:upsertFromHistory', async (_event, item) => {
    return toReviewItem(item);
});
electron_1.ipcMain.handle('review:toggleHighlight', async (_event, answerId) => {
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
electron_1.ipcMain.handle('dashboard:getSummary', async () => {
    const [history, manualVocabulary, reviewSummary] = await Promise.all([
        getHistory(300),
        state.accessToken
            ? api.getManualVocabulary(state.config.backendBaseUrl, state.accessToken, 500)
            : Promise.resolve([]),
        state.accessToken
            ? api.getReviewSummary(state.config.backendBaseUrl, state.accessToken)
            : Promise.resolve({
                dueCount: 0,
                overdueCount: 0,
                newCount: 0,
                todayReviewedCount: 0,
                retentionRate30d: 0,
                streakDays: 0
            })
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
electron_1.ipcMain.handle('review:summary', async () => {
    if (!state.accessToken) {
        throw new Error('Unauthorized: missing access token');
    }
    return api.getReviewSummary(state.config.backendBaseUrl, state.accessToken);
});
electron_1.ipcMain.handle('review:session', async (_event, limit) => {
    if (!state.accessToken) {
        throw new Error('Unauthorized: missing access token');
    }
    return api.getReviewSession(state.config.backendBaseUrl, state.accessToken, Math.max(1, Math.min(50, limit || 10)));
});
electron_1.ipcMain.handle('review:grade', async (_event, payload) => {
    if (!state.accessToken) {
        throw new Error('Unauthorized: missing access token');
    }
    return api.gradeReviewCard(state.config.backendBaseUrl, state.accessToken, payload);
});
electron_1.ipcMain.handle('manualVocabulary:getAll', async () => {
    if (!state.accessToken) {
        throw new Error('Unauthorized: missing access token');
    }
    return api.getManualVocabulary(state.config.backendBaseUrl, state.accessToken, 500);
});
electron_1.ipcMain.handle('manualVocabulary:add', async (_event, payload) => {
    if (!state.accessToken) {
        throw new Error('Unauthorized: missing access token');
    }
    return api.addManualVocabulary(state.config.backendBaseUrl, state.accessToken, payload);
});
electron_1.ipcMain.handle('manualVocabulary:remove', async (_event, payload) => {
    if (!state.accessToken) {
        throw new Error('Unauthorized: missing access token');
    }
    const res = await api.deleteManualVocabulary(state.config.backendBaseUrl, state.accessToken, [{
            sourceAnswerId: payload.sourceAnswerId,
            term: payload.term
        }]);
    return res.deletedCount > 0;
});
electron_1.ipcMain.handle('manualVocabulary:deleteMany', async (_event, items) => {
    if (!state.accessToken) {
        throw new Error('Unauthorized: missing access token');
    }
    return api.deleteManualVocabulary(state.config.backendBaseUrl, state.accessToken, items);
});
process.on('unhandledRejection', (reason) => {
    console.error('[electron/main] unhandledRejection:', reason);
});
electron_1.app.whenReady()
    .then(() => {
    mainWindow = createMainWindow();
    createTray();
    startScheduler();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            mainWindow = createMainWindow();
        }
        else {
            focusLearningWithPrompt();
        }
    });
})
    .catch((error) => {
    console.error('[electron/main] app.whenReady failed:', error);
});
electron_1.app.on('before-quit', () => {
    electron_1.app.isQuiting = true;
    stopScheduler();
});
electron_1.app.on('window-all-closed', () => {
    // keep app in tray
});
