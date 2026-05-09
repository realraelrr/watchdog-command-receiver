import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

export function createAuditLogger(filePath, options = {}) {
  const now = options.now ?? (() => new Date().toISOString());

  async function record(entry) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const line = JSON.stringify({ timestamp: now(), ...entry });
    await fs.appendFile(filePath, `${line}\n`, 'utf8');
    fsSync.chmodSync(filePath, 0o600);
  }

  return { record };
}
