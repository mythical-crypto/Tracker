import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const entry = join(homedir(), '.hindsight', 'coding-agents', 'dist', 'daemon-start.js');
if (!existsSync(entry)) throw new Error('Hindsight coding-agents не установлен.');
try {
  const response = await fetch('http://127.0.0.1:9077/health', { signal: AbortSignal.timeout(1500) });
  if (response.ok) process.exit(0);
} catch { /* cold start */ }
const child = spawn(process.execPath, [entry, '--harness', 'codex'], {
  cwd: new URL('..', import.meta.url), detached: true, stdio: 'ignore', windowsHide: true,
});
child.unref();
