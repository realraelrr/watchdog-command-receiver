import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

test('installer stages runtime and renders plist without repo paths', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'receiver-install-'));
  const home = path.join(tempDir, 'home');
  const launchAgents = path.join(tempDir, 'LaunchAgents');
  const output = execFileSync('/bin/bash', ['scripts/install-launchagent.sh'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      LAUNCH_AGENT_DIR: launchAgents,
      SKIP_LAUNCHCTL: '1',
    },
  });

  const runtimeDir = path.join(home, '.watchdog-command-receiver', 'runtime', 'current');
  const plistPath = path.join(launchAgents, 'ai.watchdog-command-receiver.plist');
  const plist = fs.readFileSync(plistPath, 'utf8');

  assert.match(output, /WATCHDOG_COMMAND_RUNTIME_DIR:/);
  assert.equal(fs.existsSync(path.join(runtimeDir, 'src', 'index.js')), true);
  assert.equal(fs.existsSync(path.join(runtimeDir, 'package.json')), true);
  assert.equal(fs.existsSync(path.join(runtimeDir, 'node_modules')), true);
  assert.match(plist, new RegExp(path.join(runtimeDir, 'src', 'index.js').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(plist, /CodeProjects\/watchdog-command-receiver/);
});

test('installer explains missing dependencies before staging runtime', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'receiver-install-missing-deps-'));
  const shadowRepo = path.join(tempDir, 'repo');
  fs.mkdirSync(shadowRepo);
  fs.cpSync(path.join(repoRoot, 'scripts'), path.join(shadowRepo, 'scripts'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'launchd'), path.join(shadowRepo, 'launchd'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'src'), path.join(shadowRepo, 'src'), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, 'package.json'), path.join(shadowRepo, 'package.json'));
  fs.copyFileSync(path.join(repoRoot, 'package-lock.json'), path.join(shadowRepo, 'package-lock.json'));
  fs.copyFileSync(path.join(repoRoot, 'config.example.json'), path.join(shadowRepo, 'config.example.json'));

  const result = spawnSync('/bin/bash', ['scripts/install-launchagent.sh'], {
    cwd: shadowRepo,
    encoding: 'utf8',
    env: { ...process.env, HOME: path.join(tempDir, 'home'), SKIP_LAUNCHCTL: '1' },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Run npm ci before installing/);
});
