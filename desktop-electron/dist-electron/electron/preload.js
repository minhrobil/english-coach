"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    config: {
        get: () => electron_1.ipcRenderer.invoke('config:get'),
        update: (config) => electron_1.ipcRenderer.invoke('config:update', config)
    },
    auth: {
        signIn: (email, password) => electron_1.ipcRenderer.invoke('auth:signin', email, password),
        signOut: () => electron_1.ipcRenderer.invoke('auth:signout')
    },
    practice: {
        instant: () => electron_1.ipcRenderer.invoke('practice:instant'),
        submit: (payload) => electron_1.ipcRenderer.invoke('practice:submit', payload),
        history: (limit) => electron_1.ipcRenderer.invoke('practice:history', limit),
        deleteHistory: (answerIds) => electron_1.ipcRenderer.invoke('practice:deleteHistory', answerIds)
    },
    review: {
        getAll: () => electron_1.ipcRenderer.invoke('review:getAll'),
        getHighlighted: () => electron_1.ipcRenderer.invoke('review:getHighlighted'),
        upsertFromHistory: (item) => electron_1.ipcRenderer.invoke('review:upsertFromHistory', item),
        toggleHighlight: (answerId) => electron_1.ipcRenderer.invoke('review:toggleHighlight', answerId),
        summary: () => electron_1.ipcRenderer.invoke('review:summary'),
        session: (limit) => electron_1.ipcRenderer.invoke('review:session', limit),
        grade: (payload) => electron_1.ipcRenderer.invoke('review:grade', payload)
    },
    dashboard: {
        getSummary: () => electron_1.ipcRenderer.invoke('dashboard:getSummary')
    },
    manualVocabulary: {
        getAll: () => electron_1.ipcRenderer.invoke('manualVocabulary:getAll'),
        add: (payload) => electron_1.ipcRenderer.invoke('manualVocabulary:add', payload),
        remove: (payload) => electron_1.ipcRenderer.invoke('manualVocabulary:remove', payload),
        deleteMany: (items) => electron_1.ipcRenderer.invoke('manualVocabulary:deleteMany', items)
    },
    scheduler: {
        onPromptIncoming: (handler) => {
            const wrapped = (_event, payload) => handler(payload);
            electron_1.ipcRenderer.on('prompt:incoming', wrapped);
            return () => electron_1.ipcRenderer.removeListener('prompt:incoming', wrapped);
        },
        onCountdown: (handler) => {
            const wrapped = (_event, payload) => handler(payload);
            electron_1.ipcRenderer.on('scheduler:countdown', wrapped);
            return () => electron_1.ipcRenderer.removeListener('scheduler:countdown', wrapped);
        },
        onError: (handler) => {
            const wrapped = (_event, payload) => handler(payload);
            electron_1.ipcRenderer.on('scheduler:error', wrapped);
            return () => electron_1.ipcRenderer.removeListener('scheduler:error', wrapped);
        }
    },
    navigation: {
        onOpenLearning: (handler) => {
            const wrapped = (_event, payload) => handler(payload);
            electron_1.ipcRenderer.on('navigation:learning', wrapped);
            return () => electron_1.ipcRenderer.removeListener('navigation:learning', wrapped);
        }
    }
};
electron_1.contextBridge.exposeInMainWorld('desktopApi', api);
