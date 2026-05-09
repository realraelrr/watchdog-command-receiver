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
  const killGraceMs = Number(command?.killGraceMs ?? options.killGraceMs ?? 2000);
  const maxOutputBytes = Number(command?.maxOutputBytes ?? options.maxOutputBytes ?? 65536);

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
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let settled = false;
    let timedOut = false;
    let child;
    try {
      child = spawn(argv[0], argv.slice(1), {
        shell: false,
        windowsHide: true,
        detached: process.platform !== 'win32',
        env: options.env ?? process.env,
      });
    } catch (error) {
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        timedOut: false,
        reason: 'spawn_error',
        stdout: '',
        stderr: error.message,
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      killChild(child, 'SIGTERM');
      setTimeout(() => {
        if (!settled) {
          killChild(child, 'SIGKILL');
        }
      }, killGraceMs).unref();
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      const captured = captureChunk(stdout, stdoutBytes, chunk, maxOutputBytes);
      stdout = captured.text;
      stdoutBytes = captured.bytes;
      stdoutTruncated ||= captured.truncated;
    });
    child.stderr?.on('data', (chunk) => {
      const captured = captureChunk(stderr, stderrBytes, chunk, maxOutputBytes);
      stderr = captured.text;
      stderrBytes = captured.bytes;
      stderrTruncated ||= captured.truncated;
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
        stdoutTruncated,
        stderrTruncated,
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
        stdoutTruncated,
        stderrTruncated,
      });
    });
  });
}

function captureChunk(current, currentBytes, chunk, maxOutputBytes) {
  if (currentBytes >= maxOutputBytes) {
    return { text: current, bytes: currentBytes + chunk.length, truncated: true };
  }
  const remaining = maxOutputBytes - currentBytes;
  const slice = chunk.subarray(0, remaining);
  return {
    text: `${current}${slice.toString('utf8')}`,
    bytes: currentBytes + chunk.length,
    truncated: chunk.length > remaining,
  };
}

function killChild(child, signal) {
  try {
    if (process.platform !== 'win32') {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch {
    try {
      child.kill(signal);
    } catch {
      // Process already exited.
    }
  }
}
