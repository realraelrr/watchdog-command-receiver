import { spawn } from 'node:child_process';

export function summarizeText(text, maxLength = 400) {
  const compact = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function executeCommand(command, options = {}) {
  const argv = command?.argv ?? [];
  const timeoutMs = Number(command?.timeoutMs ?? options.timeoutMs ?? 30000);

  return new Promise((resolve) => {
    if (!Array.isArray(argv) || argv.length === 0) {
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        timedOut: false,
        reason: 'invalid_argv',
        stdout: '',
        stderr: '',
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    const child = spawn(argv[0], argv.slice(1), {
      shell: false,
      windowsHide: true,
      env: options.env ?? process.env,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        timedOut: false,
        reason: error.code === 'ENOENT' ? 'not_found' : 'spawn_error',
        stdout,
        stderr: stderr || error.message,
      });
    });
    child.on('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: exitCode === 0 && !timedOut,
        exitCode,
        signal,
        timedOut,
        reason: timedOut ? 'timeout' : exitCode === 0 ? 'ok' : 'nonzero_exit',
        stdout,
        stderr,
      });
    });
  });
}
