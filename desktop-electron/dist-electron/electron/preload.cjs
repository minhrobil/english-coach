const { contextBridge, ipcRenderer } = require('electron');

const api = {
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    update: (config) => ipcRenderer.invoke('config:update', config)
  },
  auth: {
    signIn: (email, password) => ipcRenderer.invoke('auth:signin', email, password),
    signOut: () => ipcRenderer.invoke('auth:signout')
  },
  practice: {
    instant: () => ipcRenderer.invoke('practice:instant'),
    submit: (payload) => ipcRenderer.invoke('practice:submit', payload),
    history: (limit) => ipcRenderer.invoke('practice:history', limit),
    deleteHistory: (answerIds) => ipcRenderer.invoke('practice:deleteHistory', answerIds)
  },
  review: {
    getAll: () => ipcRenderer.invoke('review:getAll'),
    getHighlighted: () => ipcRenderer.invoke('review:getHighlighted'),
    upsertFromHistory: (item) => ipcRenderer.invoke('review:upsertFromHistory', item),
    toggleHighlight: (answerId) => ipcRenderer.invoke('review:toggleHighlight', answerId),
    summary: () => ipcRenderer.invoke('review:summary'),
    session: (limit) => ipcRenderer.invoke('review:session', limit),
    grade: (payload) => ipcRenderer.invoke('review:grade', payload)
  },
  dashboard: {
    getSummary: () => ipcRenderer.invoke('dashboard:getSummary')
  },
  manualVocabulary: {
    getAll: () => ipcRenderer.invoke('manualVocabulary:getAll'),
    add: (payload) => ipcRenderer.invoke('manualVocabulary:add', payload),
    remove: (payload) => ipcRenderer.invoke('manualVocabulary:remove', payload),
    deleteMany: (items) => ipcRenderer.invoke('manualVocabulary:deleteMany', items)
  },
  scheduler: {
    onPromptIncoming: (handler) => {
      const wrapped = (_event, payload) => handler(payload);
      ipcRenderer.on('prompt:incoming', wrapped);
      return () => ipcRenderer.removeListener('prompt:incoming', wrapped);
    },
    onCountdown: (handler) => {
      const wrapped = (_event, payload) => handler(payload);
      ipcRenderer.on('scheduler:countdown', wrapped);
      return () => ipcRenderer.removeListener('scheduler:countdown', wrapped);
    },
    onError: (handler) => {
      const wrapped = (_event, payload) => handler(payload);
      ipcRenderer.on('scheduler:error', wrapped);
      return () => ipcRenderer.removeListener('scheduler:error', wrapped);
    }
  },
  navigation: {
    onOpenLearning: (handler) => {
      const wrapped = (_event, payload) => handler(payload);
      ipcRenderer.on('navigation:learning', wrapped);
      return () => ipcRenderer.removeListener('navigation:learning', wrapped);
    }
  }
};

contextBridge.exposeInMainWorld('desktopApi', api);

