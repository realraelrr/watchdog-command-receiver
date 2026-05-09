import fs from 'node:fs/promises';
import path from 'node:path';

export function createAuditLogger(filePath, options = {}) {
  const now = options.now ?? (() => new Date().toISOString());

  async function record(entry) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const line = JSON.stringify({ timestamp: now(), ...entry });
    await fs.appendFile(filePath, `${line}\n`, 'utf8');
  }

  return { record };
}
