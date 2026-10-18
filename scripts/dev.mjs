#!/usr/bin/env node
// Startet dev:server und dev:client parallel mit Präfix. Strg+C beendet beide.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const procs = [
  ['server', '\x1b[36m'],
  ['client', '\x1b[35m'],
].map(([name, color]) => {
  const p = spawn(npm, ['run', `dev:${name}`], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  const prefix = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const l of lines) out.write(prefix + l + '\n');
    });
  };
  pipe(p.stdout, process.stdout);
  pipe(p.stderr, process.stderr);
  p.on('exit', (code) => {
    console.log(`${prefix}exited (${code ?? 'signal'})`);
    shutdown(code ?? 0);
  });
  return p;
});

let down = false;
function shutdown(code) {
  if (down) return;
  down = true;
  for (const p of procs) if (p.exitCode === null) p.kill('SIGTERM');
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
