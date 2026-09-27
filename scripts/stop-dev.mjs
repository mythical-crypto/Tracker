import { execFileSync } from 'node:child_process';

if (process.platform !== 'win32') process.exit(0);
try {
  const rows = execFileSync('powershell', ['-NoProfile', '-Command', "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"], { encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean);
  for (const pid of rows) {
    const command = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`], { encoding: 'utf8' });
    if (command.includes('treker') && command.includes('next')) execFileSync('taskkill', ['/PID', pid, '/T', '/F']);
  }
} catch { /* no dev server */ }
