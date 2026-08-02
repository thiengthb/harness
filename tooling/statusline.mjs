#!/usr/bin/env node
/**
 * Statusline: repo · branch · worktree · reservation · dirty.
 * Chống nhầm session — bệnh phổ biến nhất khi chạy 2–4 session song song.
 *
 * Bật trong .claude/settings.local.json → statusLine.command
 */
import { readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { REPO_ROOT, git, currentBranch, issueFromBranch, config, readJson, repoPath } from './lib/harness.mjs';

const parts = [];

parts.push(`\x1b[36m${config().project?.id || basename(REPO_ROOT)}\x1b[0m`);

const branch = currentBranch();
const issue = issueFromBranch(branch);
if (branch) {
  const isMain = /^(main|master)$/.test(branch);
  parts.push(`${isMain ? '\x1b[31m⚠ ' : '\x1b[32m'}${branch}\x1b[0m`);
}

// worktree khác main?
const top = git(['worktree', 'list', '--porcelain']).stdout.split('\n')[0]?.slice(9);
if (top && top !== REPO_ROOT) parts.push(`\x1b[35mwt:${basename(REPO_ROOT)}\x1b[0m`);

const dirty = git(['status', '--porcelain']).stdout.split('\n').filter(Boolean).length;
if (dirty) parts.push(`\x1b[33m±${dirty}\x1b[0m`);

// reservation của người khác còn hiệu lực
try {
  const dir = repoPath('reservations');
  const me = process.env.DEV_ID || process.env.USER || process.env.USERNAME;
  if (existsSync(dir)) {
    const n = readdirSync(dir).filter(f => f.endsWith('.json'))
      .map(f => readJson(join(dir, f)))
      .filter(r => r && r.owner !== me && new Date(r.expires).getTime() > Date.now()).length;
    if (n) parts.push(`\x1b[31m🔒${n}\x1b[0m`);
  }
} catch {}

if (issue) parts.push(`\x1b[90m${issue}\x1b[0m`);

console.log(parts.join(' · '));
