#!/usr/bin/env node
/**
 * Nghi thức khởi động + vệ sinh môi trường.   SessionStart hook
 *
 * Chữa bốn bệnh cùng lúc:
 *   1. "session sau không biết session trước làm gì"  → in định hướng
 *   2. "agent chạy nhầm repo/nhánh"                    → in pwd + branch + remote
 *   3. ".git/index.lock treo do agent crash"           → dọn CƠ HỌC
 *   4. "nửa team hành xử theo rule cũ"                 → /whats-new một lần
 *
 * Hook này CHỈ IN, không chặn. Output phải NGẮN.
 */
import { readFileSync, writeFileSync, statSync, unlinkSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, repoPath, git, currentBranch, issueFromBranch, config, limit, readJson, writeJson, exists, hookRan, stateDir, declareFailMode } from '../../tooling/lib/harness.mjs';

declareFailMode(1, 'Không dựng được bản tin đầu phiên. Phiên vẫn phải mở được — nhưng crash phải HIỆN RA, không được im.');

const lines = [];

// ── 1. Định vị ───────────────────────────────────────────────────────────────
const branch = currentBranch();
const issue = issueFromBranch(branch);
const remote = git(['remote', 'get-url', 'origin']).stdout || '(không có remote)';
lines.push(`📍 ${REPO_ROOT}`);
lines.push(`   branch: ${branch || '(detached)'}${issue ? `  ·  issue: ${issue}` : ''}`);
lines.push(`   origin: ${remote}`);

// ── 2. Dọn .git/index.lock treo ──────────────────────────────────────────────
try {
  const lock = repoPath('.git', 'index.lock');
  if (existsSync(lock)) {
    const ageMin = (Date.now() - statSync(lock).mtimeMs) / 60000;
    if (ageMin > limit('staleLockMinutes', 5)) {
      unlinkSync(lock);
      lines.push(`🧹 đã dọn .git/index.lock treo ${Math.round(ageMin)} phút (agent trước crash giữa lệnh git)`);
    } else {
      lines.push(`⚠️  .git/index.lock đang tồn tại (${Math.round(ageMin)} phút) — có session khác đang chạy?`);
    }
  }
} catch {}

// ── 3. Tình trạng công việc ──────────────────────────────────────────────────
const log = git(['log', '--oneline', '-5']).stdout;
if (log) lines.push('📜 5 commit gần nhất:\n' + log.split('\n').map(l => '   ' + l).join('\n'));

if (issue) {
  const progress = repoPath('docs', 'progress', `${issue}.md`);
  lines.push(exists(progress)
    ? `📓 nhật ký: docs/progress/${issue}.md — ĐỌC TRƯỚC KHI SỬA GÌ`
    : `📓 chưa có docs/progress/${issue}.md — chạy /claim để tạo`);
}

// ── 4. Cảnh báo worktree tích tụ ─────────────────────────────────────────────
try {
  const wt = git(['worktree', 'list', '--porcelain']).stdout;
  const count = (wt.match(/^worktree /gm) || []).length;
  const max = limit('maxWorktrees', 4);
  if (count > max) lines.push(`⚠️  ${count} worktree đang tồn tại (trần ${max}). Chạy /wt để dọn — ổ cứng và file-watcher sẽ cạn.`);
} catch {}

// ── 5. Reservation của người khác trên vùng nóng ─────────────────────────────
try {
  const dir = repoPath('reservations');
  if (existsSync(dir)) {
    const now = Date.now();
    const active = readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => readJson(join(dir, f)))
      .filter(r => r && new Date(r.expires).getTime() > now);
    if (active.length) {
      lines.push('🔒 vùng đang được đặt chỗ:');
      for (const r of active) lines.push(`   ${r.owner}: ${(r.files || []).join(', ')} — ${r.reason || ''}`);
    }
  }
} catch {}

// ── 6. /whats-new một lần cho mỗi version ────────────────────────────────────
try {
  const wn = repoPath('.claude', 'whats-new.md');
  if (existsSync(wn)) {
    const body = readFileSync(wn, 'utf8');
    const version = (body.match(/<!--\s*version:\s*([^\s>]+)\s*-->/) || [])[1];
    const statePath = join(stateDir(), 'whats-new-seen.json');
    const seen = readJson(statePath, {});
    if (version && seen.version !== version) {
      const excerpt = body.replace(/<!--[\s\S]*?-->/g, '').trim().slice(0, 700);
      lines.push('\n📢 HARNESS ĐÃ ĐỔI (đọc một lần):\n' + excerpt);
      writeJson(statePath, { version, seenAt: new Date().toISOString() });
    }
  }
} catch {}

// ── 7. Phiên TRƯỚC có dừng vì tiền/quota không? ───────────────────────────────
//
// `observe.mjs` ghi mẩu bánh mì này ở sự kiện `StopFailure`. Nó phải được ĐỌC Ở ĐÂY
// chứ không in tại chỗ, vì vendor khai StopFailure là fire-and-forget: **output và
// exit code của hook đó bị BỎ QUA**. Một cảnh báo về TIỀN mà không ai đọc thì bằng
// không có cảnh báo — nên đây là chỗ duy nhất nó tới được mắt người.
// In MỘT LẦN rồi xoá: một cảnh báo lặp mãi sẽ bị lọc bỏ đúng lúc nó kêu thật.
try {
  const crumb = join(stateDir(), 'last-stop-failure.json');
  const f = readJson(crumb);
  if (f?.error) {
    lines.push('');
    lines.push(`💸 PHIÊN TRƯỚC DỪNG VÌ: ${f.error}  (${String(f.at).slice(0, 16).replace('T', ' ')})`);
    if (f.unattended) {
      lines.push('   Phiên đó KHÔNG có người ngồi xem (scheduled task / webhook / background agent).');
      lines.push('   KIỂM HOÁ ĐƠN TRƯỚC KHI CHẠY LẠI — một vòng lặp hỏng lúc 3h sáng không tự dừng,');
      lines.push('   và không ai thấy để dừng nó.');
    } else {
      lines.push('   Xem .claude/telemetry/budget-alarm.log · ngưỡng ở harness.config.json → budget.');
    }
    unlinkSync(crumb);
  }
} catch {}

// ── 8. SỰ CÓ MẶT CỦA PHIÊN — tự động, không cần ai gõ lệnh ───────────────────
//
// `/claim` tồn tại để đóng cửa sổ chồng lấn giữa hai phiên. Đo 2026-08-05: `reservations/`
// chỉ có `README.md` — nó CHƯA CHẠY LẦN NÀO, dù dòng nhắc "/claim" được in ở mọi phiên. Và
// cửa sổ đó đã mở thật cùng ngày: hai phiên song song commit lên MỘT nhánh ở `sakubun`, và
// một `git add -A` cuốn theo file sản phẩm của phiên kia — file chưa tồn tại lúc đọc
// `git status`, đã tồn tại lúc `git add`.
//
// Nên phần MÁY LÀM ĐƯỢC thì máy làm: ghi sự có mặt của phiên này, và phát hiện phiên khác.
// Không cần người nhớ gì. `/claim` giữ lại đúng phần cần PHÁN ĐOÁN (đọc nhật ký cũ, đặt chỗ
// vùng nóng cho cả ĐỘI, quyết phạm vi) — phần đó không tự động hoá được, và nó được nhắc ở
// mục 9 chỉ khi thật sự tới hạn.
//
// Ghi vào `stateDir()` (máy-cục-bộ, gitignore) chứ KHÔNG vào `reservations/` (được commit):
// một hook tự ghi file được commit sẽ làm cây bẩn ở mọi phiên, và `gen-clean` sẽ báo về nó.
// Đổi lại, phát hiện này chỉ thấy phiên TRÊN CÙNG MÁY — mà đó đúng là ca đã xảy ra.
// Chồng lấn giữa hai MÁY vẫn cần `reservations/`, tức vẫn cần người.
// PID của PHIÊN là `process.ppid`, không phải `process.pid`. Hook chạy trong một process con
// chết ngay sau khi in — ghi `process.pid` thì mọi bản ghi đều là của một process đã chết, và
// phép kiểm còn sống không nói được gì. `ppid` là process Claude Code, sống bằng đúng phiên.
//
// Và phép kiểm là LIVENESS THẬT (`process.kill(pid, 0)`), không phải TTL đoán theo thời gian.
// Bản đầu dùng TTL 120 phút và nó cảnh báo SAI ngay khi thử: khởi động lại phiên trong cửa sổ
// đó thì bản ghi của phiên CŨ vẫn "còn tươi" ⇒ báo "có phiên khác cùng nhánh" trong khi không
// có. Một cảnh báo sai mỗi lần khởi động lại là đúng loại nhiễu mà mục này ra đời để diệt.
// TTL giữ lại làm LƯỚI CUỐI cho ca pid bị hệ điều hành cấp lại sau reboot.
try {
  const dir = join(stateDir(), 'sessions');
  mkdirSync(dir, { recursive: true });
  const ttlMin = limit('sessionPresenceMinutes', 240);
  const myPid = process.ppid;
  writeJson(join(dir, `${myPid}.json`), { pid: myPid, branch: branch || '(detached)', cwd: REPO_ROOT, at: new Date().toISOString() });

  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const others = [];
  for (const f of readdirSync(dir)) {
    if (f === `${myPid}.json` || !f.endsWith('.json')) continue;
    const p = join(dir, f);
    const s = readJson(p);
    const ageMin = (Date.now() - statSync(p).mtimeMs) / 60000;
    if (!s?.pid || !alive(s.pid) || ageMin > ttlMin) { try { unlinkSync(p); } catch {} continue; }
    if (s.branch) others.push({ ...s, ageMin: Math.round(ageMin) });
  }
  const sameBranch = others.filter(o => o.branch === branch);
  if (sameBranch.length) {
    lines.push('');
    lines.push(`⚠️  ${sameBranch.length} phiên KHÁC đang ở CÙNG nhánh \`${branch}\` (${sameBranch.map(o => `pid ${o.pid}, ${o.ageMin} phút trước`).join(' · ')})`);
    lines.push('   KHÔNG dùng `git add -A` — nó sẽ cuốn theo file của phiên kia. Stage theo đường dẫn.');
    lines.push('   Xảy ra thật 2026-08-05: file chưa tồn tại lúc `git status`, đã tồn tại lúc `git add`.');
  } else if (others.length) {
    lines.push('');
    lines.push(`ℹ️  ${others.length} phiên khác trên máy này, nhánh khác: ${others.map(o => o.branch).join(' · ')} (trần ${limit('maxSessionsPerPerson', 2)}/người)`);
  }
} catch {}

// ── 9. VIỆC ĐANG TỚI HẠN — suy ra từ trạng thái, không nhắc theo lịch ────────
//
// Bản trước in một dòng tĩnh: "bắt đầu bằng /claim · kết thúc bằng /handoff · trước PR chạy
// /pre-merge". Dòng đó không sai, nhưng nó nói MỌI THỨ ở MỌI LÚC — nên nó không nói gì ở lúc
// nào cả, và bằng chứng là hai trong ba nghi thức đó chưa từng chạy.
//
// `tooling/rituals.mjs` suy ra việc nào ĐANG tới hạn kèm SỐ ĐO. IMPORT, không spawn: một
// process node nữa ở mỗi phiên là ~60ms không cần trả.
const c = config();
lines.push('');
try {
  const { evaluate, collect } = await import('../../tooling/rituals.mjs');
  const res = evaluate(collect());
  const due = res.filter(r => r.state === 'due');
  const unknown = res.filter(r => r.state === '?');
  if (due.length) {
    lines.push(`▶️  ${due.length} việc ĐANG TỚI HẠN:`);
    for (const r of due.slice(0, 3)) lines.push(`   ▸ ${r.cmd}  —  ${r.why}`);
    if (due.length > 3) lines.push(`   … và ${due.length - 3} nữa`);
  } else {
    lines.push(`▶️  Không có nghi thức nào tới hạn (${res.length} mục đã kiểm).`);
  }
  if (unknown.length) lines.push(`   ? ${unknown.length} mục KHÔNG đo được — chúng không phải "ổn".`);
  lines.push(`   Xem hết ${res.length} năng lực + vì sao: node tooling/rituals.mjs --all`);
} catch (e) {
  // FAIL OPEN và NÓI RA. Một hook chỉ IN thì không được phép làm vỡ phiên; nhưng im lặng ở
  // đây biến "bảng điều khiển hỏng" thành "không có việc nào tới hạn" — đúng chiều dễ chịu.
  lines.push(`▶️  ⚠️  không tính được việc tới hạn (${String(e.message || e).slice(0, 60)}) — chạy tay: node tooling/rituals.mjs --all`);
}
lines.push(`   Không tự sửa .claude/settings.json — dùng /harness-propose.`);
if (!c.commands?.verify && !c.commands?.test) {
  lines.push(`   ⚠️  harness.config.json chưa khai báo lệnh verify/test — gate đang rỗng. Đây là việc số 1 cần làm.`);
}

console.log(lines.join('\n'));
hookRan('session-start', 'pass', branch || '(detached)');
process.exit(0);
