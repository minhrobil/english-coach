#!/usr/bin/env node

const { spawn } = require('node:child_process');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const electronCli = require.resolve('electron/cli.js');
const child = spawn(process.execPath, [electronCli, '.'], {
  stdio: 'inherit',
  env
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

