#!/usr/bin/env node
/**
 * "Việc gì đang TỚI HẠN ngay bây giờ" — suy ra từ trạng thái repo, không phải nhắc theo lịch.
 *
 *   node tooling/rituals.mjs           chỉ in việc ĐANG tới hạn (SessionStart gọi bản này)
 *   node tooling/rituals.mjs --all     bảng đầy đủ: mọi nghi thức, trạng thái, và VÌ SAO
 *   node tooling/rituals.mjs --json    cho máy đọc
 *
 * ── VÌ SAO FILE NÀY TỒN TẠI
 *
 * Một năng lực mà người dùng phải NHỚ mới dùng được thì nằm im. Đo 2026-08-05 trên repo này:
 * `reservations/` chỉ có `README.md` và `docs/progress/` chỉ có hai file khuôn — tức `/claim`
 * và `/handoff` **chưa chạy lần nào** kể từ khi harness ra đời, dù `session-start.mjs` in
 * đúng dòng *"bắt đầu bằng /claim · kết thúc bằng /handoff"* ở MỌI phiên.
 *
 * Dòng đó không sai. Nó chỉ là loại thông tin không ai hành động theo: nó nói MỌI THỨ ở MỌI
 * LÚC, nên nó không nói gì ở lúc nào cả. Cùng lớp lỗi với `harness-doctor` in *"5/5 điểm mở
 * rộng native còn TRỐNG"* suốt nhiều version mà không ai đóng (v2.8.0), và với 22 nhóm fixlog
 * trên 4 repo mà 0 bài học được promote.
 *
 * Và cái giá không phải lý thuyết: hôm nay hai phiên song song cùng commit lên một nhánh ở
 * `sakubun`, và một `git add -A` cuốn theo file sản phẩm của phiên kia. Đó đúng là cửa sổ mà
 * `/claim` đóng lại.
 *
 * ── BA LUẬT CỦA FILE NÀY
 *
 * 1. TỰ ĐỘNG TRƯỚC, NHẮC SAU. Phần nào máy làm được thì máy làm — xem mục 8 của
 *    `.claude/hooks/session-start.mjs`: sự có mặt của phiên được ghi TỰ ĐỘNG và phát hiện
 *    chồng lấn không cần ai gõ `/claim`. Chỉ phần cần PHÁN ĐOÁN của người mới được nhắc ở đây.
 * 2. NHẮC PHẢI CÓ BẰNG CHỨNG. Mỗi mục tới hạn phải kèm con số/đường dẫn đo được. "Nên chạy
 *    /harness-retro" là lời khuyên chung; "3 nhóm fixlog đã ≥2 lần" là một việc.
 * 3. BA GIÁ TRỊ, KHÔNG PHẢI HAI. `due` / `ok` / `?`. Một nghi thức KHÔNG ĐO ĐƯỢC (thiếu git,
 *    thiếu config) phải hiện ra là `?`, không được im lặng thành `ok` — im lặng thành `ok` là
 *    cách một bảng điều khiển báo "mọi thứ ổn" trong khi nó chưa nhìn.
 *
 * `evaluate()` là HÀM THUẦN trên một object trạng thái, tách khỏi `collect()`. Nhờ vậy
 * `tooling/test-hooks.mjs` khẳng định được LOGIC bằng trạng thái dựng sẵn, thay vì phải dựng
 * một repo giả cho mỗi ca — và đó là điều kiện để suite này chạy được ở project đích, nơi
 * trạng thái git là của HỌ (xem knowledge/lessons/0003).
 */
import { readdirSync, existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoPath, git, config, limit, report, telemetryDir, exists, fixlogKey, fixlogGroupRules, readJson, readPacks, packPending, budgetStatus, latestCapoEntry, repoRole } from './lib/harness.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// PHẦN THUẦN — không đọc đĩa, không gọi git. Test khẳng định trực tiếp vào đây.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mỗi nghi thức trả về `{ state, why }` với `state` ∈ `due` | `ok` | `?`.
 *
 * `why` là BẰNG CHỨNG, không phải lời khuyên — nó phải chứa con số hoặc đường dẫn. Một dòng
 * không có bằng chứng thì người đọc không kiểm được, và thứ không kiểm được sẽ bị bỏ qua đúng
 * như dòng nhắc tĩnh mà file này thay thế.
 */
export const RITUALS = [
  {
    id: 'claim',
    cmd: '/claim',
    what: 'nhận việc: đọc nhật ký cũ, đặt chỗ vùng nóng, tạo docs/progress/<issue>.md',
    check: (s) => {
      if (s.issue == null) return { state: '?', cause: 'branch-no-issue', why: 'nhánh không theo quy ước `<type>/<issue>-<slug>` nên không suy ra được issue — không đo được' };
      if (!s.issue) return { state: 'ok', why: 'đang ở nhánh tích hợp, không có issue để nhận' };
      // Solo vẫn cần nhật ký — chỉ khác NGƯỜI ĐỌC. "người sau" là lời khuyên rỗng khi bạn
      // là người duy nhất, và một lý do rỗng làm cả nghi thức đọc như thủ tục. Người đọc
      // thật của solo là PHIÊN SAU và MÁY KHÁC: đo 2026-08-06, một nhánh 3 commit nằm ngoài
      // main một ngày vì phiên tạo ra nó hết quota — không ai biết nó tồn tại.
      if (!s.progressExists) return { state: 'due', why: `đang ở issue ${s.issue} mà chưa có docs/progress/${s.issue}.md — `
        + (s.solo ? 'phiên sau của BẠN (và máy khác của bạn) không có gì để đọc' : 'phiên sau (và người sau) không có gì để đọc') };
      return { state: 'ok', why: `docs/progress/${s.issue}.md đã có` };
    },
  },
  {
    id: 'handoff',
    cmd: '/handoff',
    what: 'kết phiên: ghi lại đã làm gì, đang dở gì, bước tiếp theo',
    check: (s) => {
      // TÁCH "không suy ra được issue" khỏi "đang ở nhánh tích hợp". Bản trước gộp hai cái
      // vào một dòng `ok`, và nhật ký W32 đã bắt được đúng ca đó: *"/handoff OK — không có
      // gì để giao lại"* trong khi có 2 commit chưa push và người dùng sắp sang máy khác.
      // Nhánh không theo quy ước `<type>/<issue>-<slug>` là ca THƯỜNG GẶP, không phải ca lạ.
      if (s.issue == null) return { state: '?', cause: 'branch-no-issue', why: 'không suy ra được issue từ tên nhánh — không đo được. Có việc dở hay không thì bảng này KHÔNG biết' };
      if (!s.issue) return { state: 'ok', why: 'đang ở nhánh tích hợp — không có gì để giao lại' };
      if (!s.progressExists) return { state: 'ok', why: '/claim đang tới hạn trước — nhật ký chưa tồn tại' };
      if (s.commitsSinceProgress > 0) {
        return { state: 'due', why: `${s.commitsSinceProgress} commit mới hơn lần sửa docs/progress/${s.issue}.md gần nhất — công việc đã đi trước nhật ký` };
      }
      return { state: 'ok', why: 'nhật ký ngang bằng với commit gần nhất' };
    },
  },
  {
    id: 'pre-merge',
    cmd: '/pre-merge',
    what: 'chạy đủ gate preMerge trước khi mở PR',
    check: (s) => {
      if (s.ahead == null) return { state: '?', why: 'không resolve được nhánh tích hợp — không đo được. Kiểm `project.integrationBranch`' };
      if (s.ahead === 0) return { state: 'ok', why: 'không có commit nào đi trước nhánh tích hợp' };
      // Bản trước in "chưa thấy dấu gate preMerge chạy" mà KHÔNG đi tìm dấu nào — `gates.mjs`
      // chỉ ghi telemetry khi HỎNG, nên dấu đó chưa từng tồn tại. Nghi thức đỏ theo `ahead > 0`
      // và ở đỏ mãi, chạy gate bao nhiêu lần cũng vậy. Một lý do mô tả phép đo chưa từng xảy ra
      // dạy người đọc rằng mục này không đáng phản ứng — và sau đó nó không được phản ứng thật.
      if (s.preMergeRanAt == null) {
        return { state: 'due', why: `${s.ahead} commit đi trước ${s.integrationBranch}, và CHƯA có lần chạy gate preMerge nào được ghi (\`gate-runs.log\`)` };
      }
      if (s.lastCommitAt == null) {
        return { state: '?', why: `${s.ahead} commit đi trước ${s.integrationBranch} và gate preMerge CÓ chạy, nhưng không đọc được thời điểm commit cuối — không so được hai mốc` };
      }
      if (s.preMergeRanAt < s.lastCommitAt) {
        const mins = Math.round((s.lastCommitAt - s.preMergeRanAt) / 60000);
        return { state: 'due', why: `gate preMerge chạy lần cuối ${mins} phút TRƯỚC commit mới nhất — lần chạy đó không nói gì về cây hiện tại. Chạy lại: \`node tooling/gates.mjs --stage preMerge\`` };
      }
      return { state: 'ok', why: `gate preMerge đã chạy sau commit cuối (${new Date(s.preMergeRanAt).toISOString().slice(0, 16).replace('T', ' ')})` };
    },
  },
  {
    id: 'harness-retro',
    cmd: '/harness-retro',
    what: 'chưng fixlog thành bài học — bước DISTILL của vòng học',
    check: (s) => {
      if (s.fixlogTotal == null) return { state: '?', why: 'không đọc được fixlog — không đo được' };
      if (s.fixlogRepeated > 0) {
        return { state: 'due', why: `${s.fixlogRepeated} nhóm fixlog đã ≥2 lần (ngưỡng promote) trên tổng ${s.fixlogTotal} mục — mỗi nhóm là một ứng viên bài học ĐANG chờ` };
      }
      if (s.fixlogTotal >= 10) return { state: 'due', why: `${s.fixlogTotal} mục fixlog mà chưa nhóm nào ≥2 — đủ nhiều để đáng đọc một lượt` };
      // Nói rõ phép nhóm là TỪ VỰNG. "Chưa nhóm nào ≥2" đọc như "không có gì lặp lại", nhưng nó
      // chỉ có nghĩa "không có hai dòng nào mở đầu giống nhau" — đo 2026-08-06: 3 mục cùng một
      // gác nằm ở 3 nhóm rời. Một dòng xanh nói quá thì tệ hơn một dòng đỏ nói thiếu.
      return { state: 'ok', why: `${s.fixlogTotal} mục fixlog, chưa nhóm nào đạt ngưỡng ≥2 — nhóm mặc định theo TỪ VỰNG, hai dòng cùng gốc rễ mà khác cách diễn đạt thì khai bằng \`fixlog.mjs --group\`` };
    },
  },
  {
    id: 'knowledge-promote',
    cmd: '/knowledge-promote',
    what: 'đưa bài học đã chín vào knowledge/lessons/ để nó đi theo bạn sang repo khác',
    check: (s) => {
      if (s.learningsNewerThanLessons == null) return { state: '?', why: 'không đọc được .claude/learnings/ hoặc knowledge/lessons/ — không đo được' };
      if (s.learningsNewerThanLessons > 0) {
        // "chỉ REPO này thấy", KHÔNG phải "chỉ máy này thấy" — `.claude/learnings/` được COMMIT
        // (`git ls-files` xác nhận 2026-08-06). Bản cũ nói sai về cái mất: nó doạ mất bài học
        // khi đổi máy, trong khi cái thật sự mất là tính MANG ĐI ĐƯỢC sang repo khác. Một lý do
        // sai hướng vẫn khiến người ta hành động, nhưng vì lý do không có thật — và khi họ phát
        // hiện ra bài học vẫn còn sau khi đổi máy, họ học được rằng bảng này nói quá.
        return { state: 'due', why: `${s.learningsNewerThanLessons} file trong .claude/learnings/ mới hơn bài học mới nhất ở knowledge/lessons/ — bài học đang ở dạng chỉ-repo-này-thấy, chưa mang được sang project khác` };
      }
      return { state: 'ok', why: 'không có learnings nào mới hơn lessons' };
    },
  },
  {
    // `/verify-ui` là 1 trong 2 skill chỉ-người-gõ mà 2.15.0 đã ghi thẳng là KHÔNG có bất kỳ
    // cơ chế nào nhắc tới (`/harness-propose` là cái còn lại, đã có nghi thức ở 2.15.0).
    //
    // Lý do khi ấy: *"nó cần khai `paths.ui` trong `harness.config.json` (vùng cấm)"*. Câu đó
    // SAI, và cái sai đáng ghi lại: `paths.ui` không cần thiết. Tín hiệu đúng nằm ở
    // `features/<id>.json → platforms.web` — chính artefact mà skill này đọc và ghi ở bước 5.
    // Giả định "cần vùng cấm" đến từ chỗ TRIỆU CHỨNG (skill nói về UI, config nói về path),
    // không từ chỗ dữ liệu thật sự nằm.
    //
    // Không trùng `check-feature-integrity.mjs`: gate đó bắt chiều "khai `passes: true` mà
    // KHÔNG có bằng chứng". Nó im lặng ở chiều ngược lại — "còn nợ một tấm ảnh" — và chiều đó
    // mới là chiều cần NHẮC, vì nó không có triệu chứng nào khi bị bỏ qua (SKILL.md §mở đầu).
    id: 'verify-ui',
    cmd: '/verify-ui',
    what: 'chụp UI thật ở 2 viewport làm bằng chứng, rồi giao design-evaluator chấm',
    check: (s) => {
      // `=== null` CỐ Ý, không phải `== null`: ở mục này `null` và `undefined` là HAI trạng
      // thái khác nhau — `null` = không đọc được `features/`, `undefined` = đọc được nhưng
      // không feature nào khai issue này (dòng dưới). Đổi thành `== null` làm dòng đó thành
      // mã chết. Đã thử và bị chính eval `0006` bắt, 2026-08-07.
      if (s.ui === null) return { state: '?', why: 'không đọc được features/ — không đo được' };
      if (s.issue == null) return { state: '?', cause: 'branch-no-issue', why: 'không suy ra được issue từ tên nhánh — không biết có feature nào cần chụp không' };
      if (!s.issue) return { state: 'ok', why: 'đang ở nhánh tích hợp — không có feature nào để chụp' };
      if (s.ui === undefined) return { state: 'ok', why: `không có features/*.json nào khai issue ${s.issue}` };
      if (s.ui.state === 'n/a') return { state: 'ok', why: `${s.ui.id}: web ngoài scope${s.ui.why ? ` (${s.ui.why})` : ''}` };
      if (s.ui.state === 'no-web') return { state: 'ok', why: `${s.ui.id}: không khai nền web` };
      if (s.ui.state === 'done') return { state: 'ok', why: `${s.ui.id}: web.passes=true, bằng chứng ${s.ui.evidence || '(rỗng — gate check-feature-integrity sẽ bắt)'}` };
      return { state: 'due', why: `${s.ui.id}: web trong scope mà passes vẫn false — còn nợ 2 ảnh ở docs/evidence/${s.issue}/, và không gì báo khi bỏ qua` };
    },
  },
  {
    id: 'entropy-sweep',
    cmd: '/entropy-sweep',
    what: 'cắt rule/skill/doc đã hết tác dụng',
    check: (s) => {
      if (s.skillCount == null) return { state: '?', why: 'không đếm được skill — không đo được' };
      if (s.skillCount > s.maxSkills) {
        return { state: 'due', why: `${s.skillCount} skill (trần ${s.maxSkills}) — tool/skill definition ăn context ở MỌI request` };
      }
      return { state: 'ok', why: `${s.skillCount}/${s.maxSkills} skill` };
    },
  },
  {
    // `/harness-propose` là skill NGƯỜI GỌI, và tới 2.14.0 nó là **skill duy nhất KHÔNG có bất
    // kỳ cơ chế nào nhắc tới nó** — 8/9 skill người-gọi có nghi thức, riêng nó thì không. Hệ
    // quả: con đường HỢP PHÁP DUY NHẤT để đổi vùng cấm (`hooks/`, `settings.json`, `AGENTS.md`,
    // `harness.config.json`) chỉ chạy khi ai đó tình cờ nhớ ra nó tồn tại.
    //
    // TÍN HIỆU LÀ THỨ ĐÃ CÓ SẴN, không phải cờ mới: mỗi lần `protect-harness` chặn một lần
    // sửa vùng cấm, nó ghi một dòng `protect-harness` vào `gate-fails.log`. Bị chặn nhiều lần
    // nghĩa là **có thứ trong harness đang cản việc thật** — đúng điều kiện mà chính skill đó
    // đòi ("agent làm sai cùng một thứ ≥2 lần, hoặc bị hook chặn mà bạn nghĩ hook sai").
    //
    // Ngưỡng 2 khớp với ngưỡng của skill: một lần là ngẫu nhiên, hai lần là một hình dạng.
    id: 'guard-nhanh-tich-hop',
    cmd: 'guard nhánh tích hợp',
    what: 'đối chiếu số lần dùng CỬA THOÁT với số lần CHẶN — cửa thoát thắng nghĩa là guard sai',
    check: (s) => {
      if (s.mainEditEscapes == null || s.mainEditBlocks == null) {
        return { state: '?', why: 'không đọc được telemetry của guard nhánh tích hợp — không đo được' };
      }
      const total = s.mainEditEscapes + s.mainEditBlocks;
      // Chưa có ca nào ⇒ chưa đo được TỈ LỆ. Không phải "ổn": guard mới cắm thì mẫu số bằng 0,
      // và một tỉ lệ trên mẫu số 0 là câu trả lời dễ chịu chứ không phải câu trả lời đúng (L0005).
      if (total === 0) return { state: '?', why: 'guard nhánh tích hợp chưa gặp ca nào (0 chặn, 0 cửa thoát) — chưa có mẫu để nói nó đúng hay sai' };
      if (s.mainEditEscapes > s.mainEditBlocks) {
        return { state: 'due', why: `cửa thoát dùng ${s.mainEditEscapes} lần, chặn ${s.mainEditBlocks} lần — GUARD SAI. `
          + 'Điều kiện thoát của #44: cắt nó, ĐỪNG nới nó. Một guard bị đi vòng nhiều hơn được tuân theo là một guard đang dạy người ta đi vòng' };
      }
      return { state: 'ok', why: `chặn ${s.mainEditBlocks} lần, cửa thoát ${s.mainEditEscapes} lần — guard còn đúng hơn sai` };
    },
  },
  {
    id: 'harness-propose',
    cmd: '/harness-propose',
    what: 'đổi vùng cấm bằng đường hợp pháp — hook, settings, AGENTS.md, harness.config.json',
    check: (s) => {
      if (s.harnessBlocks == null) return { state: '?', why: 'không đọc được gate-fails.log — không đo được' };
      if (s.harnessBlocks >= 2) {
        return { state: 'due', why: `${s.harnessBlocks} lần bị \`protect-harness\` chặn khi sửa vùng cấm (gate-fails.log) — `
          + 'hoặc harness đang cản một việc chính đáng, hoặc ai đó đang thử sửa tay thứ phải đi qua PR. Cả hai đều là lý do chạy skill này' };
      }
      return { state: 'ok', why: s.harnessBlocks ? `${s.harnessBlocks} lần bị chặn ở vùng cấm, chưa đạt ngưỡng 2` : 'chưa lần nào bị chặn ở vùng cấm' };
    },
  },
  {
    id: 'wt',
    cmd: '/wt',
    what: 'dọn worktree đã merge',
    check: (s) => {
      if (s.worktrees == null) return { state: '?', why: 'không liệt kê được worktree — không đo được' };
      if (s.worktrees > s.maxWorktrees) return { state: 'due', why: `${s.worktrees} worktree (trần ${s.maxWorktrees}) — ổ cứng và file-watcher sẽ cạn` };
      return { state: 'ok', why: `${s.worktrees}/${s.maxWorktrees} worktree` };
    },
  },
  {
    // KHÔNG gộp với `/harness-retro`. Retro là bước DISTILL trên fixlog của CHÍNH repo này;
    // mục này là quyết định trên nguyên liệu ĐI LÊN từ repo khác. Hai tín hiệu khác nhau, hai
    // hành động khác nhau — gộp chúng thì một trong hai luôn bị che.
    id: 'accept-packs',
    cmd: 'knowledge/accept.mjs --list',
    what: 'quyết định trên pack đi lên từ project khác (MERGE / ACCEPT / RETURN / REJECT)',
    check: (s) => {
      if (s.pendingPacks == null) return { state: '?', why: 'không đọc được knowledge/incoming/ — không đo được' };
      if (s.pendingPacks > 0) return { state: 'due', why: `${s.pendingPacks} pack từ project khác đang chờ quyết ở knowledge/incoming/ (${s.pendingMaterial} mục nguyên liệu: bài học + fixlog thô + diff cơ chế) — nguyên liệu đã tới, quyết định thì chưa` };
      return { state: 'ok', why: 'không có pack chờ quyết' };
    },
  },
  {
    // NĂNG LỰC DUY NHẤT CHẠM TIỀN THẬT — và cho tới v2.28.0 nó không có mặt ở bảng này,
    // nên `budget.monthlyUsdCap` là một con số không ai đối chiếu. Đặt $50 vào config
    // không làm gì cả, và chính điều đó khiến người ta TIN là có lớp bảo vệ.
    //
    // `?` ở đây KHÔNG phải "ổn": khai trần mà chưa lần nào đo thì trần chưa so với gì.
    id: 'capo-report',
    cmd: 'capo-report.mjs --usd <N>',
    what: 'đối chiếu chi tiêu THẬT với trần tháng (số lấy từ dashboard billing, harness không đọc được hoá đơn)',
    check: (s) => {
      const b = s.budget;
      // TEMPLATE (#92): trần không khai được ở đây — `setup.mjs:55` từ chối, và đúng. Nhưng
      // `capo-report.mjs` KHÔNG đọc trần (nó ghi vào `stateDir()`), nên CAPO đo được. Gộp hai
      // cái thành một `?` làm mất việc LÀM ĐƯỢC sau lưng việc KHÔNG làm được.
      if (b.mode === 'template-na') {
        return b.measured
          ? { state: 'ok', why: `CAPO đo ${b.ageDays} ngày trước · trần n/a ở repo template (nó là SEED — cap ở đây chảy xuống mọi consumer)` }
          : { state: 'due', why: b.advice };
      }
      if (b.mode === 'template-cap') return { state: 'due', why: b.advice };
      if (b.mode === 'off') return { state: '?', why: 'budget.monthlyUsdCap = 0 — chưa khai trần, nên không có gì để đối chiếu. Đây KHÔNG phải "ổn"' };
      if (b.mode === 'unmeasured') return { state: 'due', why: b.advice };
      if (b.mode === 'stale') return { state: 'due', why: b.advice };
      if (b.mode === 'over' || b.mode === 'alert') return { state: 'due', why: b.advice };
      return { state: 'ok', why: `run-rate ${b.percent}% trần tháng (số nhập tay ${b.ageDays} ngày trước)` };
    },
  },
  {
    // ── NGHI THỨC DUY NHẤT HỎI LẠI TIỀN ĐỀ CỦA CHÍNH HARNESS.
    //
    // Mọi mục trên hỏi "việc trong repo đã xong chưa". Mục này hỏi một câu khác hẳn:
    // *thứ harness tự viết có còn đáng tự viết không* — vì cái công cụ mình đang chạy BÊN
    // TRONG vừa lên phiên bản.
    //
    // Vì sao nó tồn tại: `fleet` (repo bên cạnh) bỏ ~6 phiên tháng 6/2026 xây "auto-pilot"
    // — orchestrator chạy lại `claude -p` mỗi batch, scheduled task, control plane Discord
    // ký RS256. Nó CHẠY ĐƯỢC. Ngày 2026-07-28 xoá sạch, vì Claude Code đã ra sẵn scheduled
    // agents. Không có bước nào trong quy trình cũ đi kiểm lại tiền đề. Ghi chép của họ:
    // *"Nothing about the process was wrong… The premise expired and no step ever re-checked
    // it."* Harness là repo tự viết RẤT nhiều (presence detection, migration, ratchet,
    // telemetry, ledger) nên nó phơi ra đúng rủi ro đó, chỉ là chưa ai đo.
    //
    // HÌNH DẠNG LÀ MỘT NGHI THỨC, KHÔNG PHẢI MỘT HOOK MỚI — và đó là chỗ khác fleet. Fleet
    // cắm một hook SessionStart riêng; ở harness một hook mới cần sửa `settings.json` ở MỌI
    // repo đã áp, tức là cần một migration đăng ký, tức là ba bước có thể hỏng để mua đúng
    // một câu hỏi. `rituals.mjs` đã được SessionStart gọi sẵn, nên ở đây nó tốn 0 bước.
    //
    // NEO LÀ VERSION, KHÔNG PHẢI LỊCH. Câu trả lời chỉ đổi khoảng một lần mỗi release, nên
    // một job nghiên cứu hằng tuần sẽ đốt phiên để không tìm ra gì. Một lần bump version là
    // cái cò rẻ và chính xác: đọc một biến môi trường, so với một file JSON.
    id: 'claude-code-drift',
    cmd: 'rituals.mjs --reviewed-claude-code',
    what: 'Claude Code vừa lên bản mới — hỏi MỘT câu: nó có ra sẵn thứ harness đang tự viết không?',
    check: (s) => {
      if (!s.claudeCodeVersion) {
        // Lý do đến từ `collect()`, không đọc env ở đây: `check` phải THUẦN (xem đầu file).
        // Và lý do phải nói ĐÚNG nguồn nào đã thử — bản cũ nói "cách cài không đặt biến này"
        // kể cả khi biến CÓ được đặt, tức một mục `?` kèm lời giải thích sai. Không ai đi tìm
        // tiếp sau một lời giải thích nghe đã xong.
        return { state: '?', why: s.claudeCodeVersionWhy || 'không đo được version Claude Code' };
      }
      if (!s.reviewedClaudeCode) {
        return { state: 'due', why: `đang chạy Claude Code ${s.claudeCodeVersion} và CHƯA có bản rà nào được ghi (.claude/claude-code-baseline.json) — chưa ai hỏi bản này có ra sẵn thứ harness tự viết không` };
      }
      if (s.reviewedClaudeCode !== s.claudeCodeVersion) {
        return { state: 'due', why: `Claude Code đã đổi ${s.reviewedClaudeCode} → ${s.claudeCodeVersion}: đọc changelog bản mới với ĐÚNG một câu hỏi "nó vừa ra sẵn thứ nào harness đang tự làm tay?", rồi ghi lại bằng \`node tooling/rituals.mjs --reviewed-claude-code "<thấy gì>"\`` };
      }
      // MÁY TRỪ ĐƯỢC THÌ ĐỪNG HỎI NGƯỜI. Phần "vendor ra sẵn thứ gì" là câu hỏi khó, đúng
      // là việc của người. Nhưng "tập sự kiện hook có đổi không" là một PHÉP TRỪ TẬP HỢP —
      // và tới 2.38.0 nó vẫn đang được giao cho trí nhớ. Đo 2026-08-07 (issue #85): bản rà
      // 2.1.222 ghi "13 tên", binary 2.1.224 có 31, và bản rà 2.1.224 không nhắc tập nào.
      //
      // Chỉ SO Ở ĐÂY, không quét: binary 285 MB, quét mất ~0,5 giây và mục này chạy ở mọi
      // SessionStart. `native-surface.mjs --record` là chỗ trả chi phí đó, một lần mỗi version.
      if (!s.nativeEventsVersion) {
        return { state: 'due', why: `đã rà changelog ${s.claudeCodeVersion} nhưng CHƯA đo tập sự kiện hook lần nào — `
          + 'con số duy nhất trong bề mặt đó kiểm được bằng máy đang không ai tính. `node tooling/native-surface.mjs --record`' };
      }
      if (s.nativeEventsVersion !== s.claudeCodeVersion) {
        return { state: 'due', why: `tập sự kiện hook mới đo ở ${s.nativeEventsVersion}, đang chạy ${s.claudeCodeVersion} — `
          + 'phép trừ tập hợp này máy làm được, đừng để nó cho trí nhớ. `node tooling/native-surface.mjs --record`' };
      }
      return { state: 'ok', why: `đã rà Claude Code ${s.claudeCodeVersion}${s.reviewedClaudeCodeAt ? ` ngày ${s.reviewedClaudeCodeAt.slice(0, 10)}` : ''}`
        + `, và tập sự kiện hook đã đo ở đúng version đó (${s.nativeEventsCount} sự kiện)` };
    },
  },
];

/** `…/versions/2.1.221` → `2.1.221`. Trả `null` thay vì đoán — `null` chạy tiếp thành `?`. */
export function claudeCodeVersion(execPath = process.env.CLAUDE_CODE_EXECPATH || '') {
  const base = String(execPath).split(/[\\/]/).filter(Boolean).pop() || '';
  return /^\d+\.\d+\.\d+/.test(base) ? base : null;
}

/**
 * NGUỒN THỨ HAI: `package.json` của chính gói đang chạy.
 *
 * `claudeCodeVersion()` chỉ đọc được CÁCH CÀI có version nằm trong đường dẫn
 * (`…/versions/2.1.221`). Cách cài bằng npm thì `CLAUDE_CODE_EXECPATH` trỏ thẳng vào
 * binary — `…/node_modules/@anthropic-ai/claude-code/bin/claude.exe` — và đoạn cuối là
 * TÊN FILE, không phải version. Đúng là không được đoán, nhưng "không đoán" đã bị hiểu
 * thành "không đo", và lời giải thích đi kèm còn sai sự thật: nó nói "cách cài không đặt
 * biến này", trong khi biến CÓ được đặt (đo 2026-08-06, Windows + npm) — nó chỉ trỏ vào
 * một layout khác. Một mục `?` kèm lý do sai thì không ai đi tìm tiếp.
 *
 * Đây KHÔNG phải đoán thêm: nó đọc `version` trong `package.json` của đúng gói
 * `@anthropic-ai/claude-code` chứa binary đó. Đó là bằng chứng trên đĩa, không phải suy luận
 * từ hình dạng chuỗi. Không thấy gói ⇒ vẫn `null`, vẫn `?`.
 *
 * Đi lên tối đa 5 tầng: `bin/claude.exe` cách gốc gói 1 tầng, trần rộng gấp mấy lần layout
 * đã biết mà vẫn không thể lang thang lên tận gốc đĩa.
 */
export function claudeCodeVersionFromPackage(execPath = process.env.CLAUDE_CODE_EXECPATH || '') {
  let dir = String(execPath).trim();
  if (!dir) return null;
  dir = dirname(dir);
  for (let i = 0; i < 5 && dir && dir !== dirname(dir); i++, dir = dirname(dir)) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      if (pkg?.name === '@anthropic-ai/claude-code' && /^\d+\.\d+\.\d+/.test(String(pkg.version || ''))) {
        return String(pkg.version);
      }
    } catch { /* tầng này không phải gốc gói — đi tiếp */ }
  }
  return null;
}

/** Version đo được, theo thứ tự nguồn. `null` = THẬT SỰ không đo được, không phải chưa thử. */
export function claudeCodeVersionMeasured(execPath = process.env.CLAUDE_CODE_EXECPATH || '') {
  return claudeCodeVersion(execPath) ?? claudeCodeVersionFromPackage(execPath);
}

/** Chạy toàn bộ nghi thức trên một trạng thái. Thuần, tất định. */
export function evaluate(state) {
  return RITUALS.map(r => {
    let res;
    try { res = r.check(state); } catch (e) { res = { state: '?', why: `check throw: ${String(e.message || e).slice(0, 80)}` }; }
    return { id: r.id, cmd: r.cmd, what: r.what, ...res };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PHẦN KHÔNG THUẦN — đọc đĩa và git. Mọi nhánh lỗi trả `null`, KHÔNG trả 0.
//
// `null` nghĩa là "không đo được" và nó chạy tiếp thành `?` ở trên. Trả `0` ở đây là gộp
// "không có" với "chưa nhìn" — phép gộp mà AGENTS.md cấm, và ở một bảng điều khiển thì nó
// biến "chưa nhìn" thành "mọi thứ ổn".
// ─────────────────────────────────────────────────────────────────────────────

const num = (fn, fallback = null) => { try { const v = fn(); return typeof v === 'number' && Number.isFinite(v) ? v : fallback; } catch { return fallback; } };

export function collect() {
  const cfg = config();
  const branch = (() => { try { return git(['branch', '--show-current']).stdout.trim(); } catch { return ''; } })();
  const integrationBranch = cfg.project?.integrationBranch || 'origin/main';

  // `issue`: '' nghĩa là nhánh tích hợp (không có issue — đúng, không phải thiếu);
  // `null` nghĩa là KHÔNG SUY RA ĐƯỢC (nhánh không theo quy ước) ⇒ `?`, không phải `ok`.
  const prefixes = cfg.project?.issuePrefixes ?? [];
  let issue = null;
  if (!branch || /^(main|master|develop)$/.test(branch)) issue = '';
  else {
    const m = branch.match(new RegExp(`(${prefixes.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})-?\\d+`, 'i'));
    if (m) issue = m[0];
    else if (/^(chore|docs|ci|test)\//.test(branch)) issue = '';   // nhánh việc-nhà: không cần issue
  }

  const progress = issue ? repoPath('docs', 'progress', `${issue}.md`) : null;
  const progressExists = Boolean(progress && exists(progress));

  return {
    branch, integrationBranch, issue, progressExists,
    // Đọc ở ĐÂY, không trong `check` — `check` là phần THUẦN (xem mốc ở đầu file), và một
    // lần đọc đĩa lén trong đó làm test không lái được nhánh solo.
    solo: cfg.project?.teamSize === 1,

    // ── UI của ĐÚNG issue đang làm ────────────────────────────────────────────
    //
    // `null` = không đọc được thư mục features/ ⇒ `?`. `undefined` = issue này không có file
    // feature nào (khác hẳn: không có gì để verify). Đọc `platforms.web` vì đó là nền duy
    // nhất mà `/verify-ui` chụp được — ios/android/desktop cần công cụ của project.
    //
    // VÌ SAO KHOÁ VÀO ISSUE HIỆN TẠI, không quét cả repo: quét cả repo thì template (và mọi
    // project thật) luôn có ít nhất một feature chưa xong ⇒ mục này ĐỎ VĨNH VIỄN. Một mục đỏ
    // vĩnh viễn dạy người ta bỏ qua màu đỏ — đúng tầng 1 của `knowledge/lessons/0003`, và
    // đúng lý do `fixlog --close` phải tồn tại. Khoá vào issue thì nó TỰ TẮT khi bạn xong.
    ui: (() => {
      if (!issue) return undefined;
      try {
        const dir = repoPath('features');
        if (!exists(dir)) return undefined;
        for (const f of readdirSync(dir)) {
          if (!f.endsWith('.json') || f.startsWith('_')) continue;
          const j = readJson(join(dir, f));
          if (!j || j.issue !== issue) continue;
          const web = j.platforms?.web;
          if (!web) return { id: j.id || f, state: 'no-web' };
          if (web.passes === 'n/a') return { id: j.id || f, state: 'n/a', why: String(web.evidence || '') };
          if (web.passes === true) return { id: j.id || f, state: 'done', evidence: String(web.evidence || '') };
          return { id: j.id || f, state: 'owed' };
        }
        return undefined;
      } catch { return null; }
    })(),

    // Số commit mới hơn lần sửa nhật ký gần nhất. Dùng mtime của file so với ngày commit —
    // thô nhưng đúng hướng, và nó KHÔNG đòi nhật ký phải được commit (thường nó chưa).
    commitsSinceProgress: !progressExists ? 0 : num(() => {
      const since = new Date(statSync(progress).mtimeMs).toISOString();
      const out = git(['log', '--oneline', `--since=${since}`]).stdout.trim();
      return out ? out.split('\n').filter(Boolean).length : 0;
    }, 0),

    ahead: num(() => {
      const r = git(['rev-list', '--count', `${integrationBranch}..HEAD`]);
      if (r.status !== 0) return null;
      return Number(r.stdout.trim());
    }),

    // Lần chạy gate `preMerge` gần nhất, và commit gần nhất — so HAI MỐC, không so một.
    // Chạy gate rồi commit thêm thì lần chạy đó không còn nói gì về cây hiện tại, nên
    // "đã chạy rồi" phải nghĩa là "đã chạy SAU commit cuối". Cả hai đều `null` được, và
    // `null` ở đây chạy tiếp thành `?` — KHÔNG thành `ok`.
    // Số lần `protect-harness` CHẶN một lần sửa vùng cấm. Đọc từ cùng log mà hook ghi vào,
    // nên không có cờ mới nào phải nhớ bật. `null` = không đọc được ⇒ `?`, KHÔNG phải 0:
    // "chưa có log" và "chưa lần nào bị chặn" là hai chuyện khác nhau.
    harnessBlocks: num(() => {
      const f = join(telemetryDir(), 'gate-fails.log');
      if (!existsSync(f)) return 0;              // log tồn tại được nhưng rỗng là 0 THẬT
      return readFileSync(f, 'utf8').split('\n').filter(l => l.split('|')[2] === 'protect-harness').length;
    }, null),

    // GUARD NHÁNH TÍCH HỢP: cửa thoát so với nhánh chặn.
    //
    // `protect-integration-branch` bắt buộc có cửa thoát — sửa tài liệu thẳng trên nhánh tích
    // hợp là việc hợp lệ, và không có cửa thoát thì người ta tắt hook, mất cả guard lẫn tín
    // hiệu. Nhưng một cửa thoát không ai đếm là một cửa thoát mở vĩnh viễn.
    //
    // Phép so là điều kiện thoát của chính issue #44: **cửa thoát dùng NHIỀU HƠN nhánh chặn
    // ⇒ guard sai, CẮT nó — đừng nới nó.** Đây là mục hiếm hoi trong bảng này đề xuất bỏ một
    // cơ chế thay vì làm một việc, và nó cố ý như vậy.
    ...(() => {
      const count = (file, col2) => {
        const f = join(telemetryDir(), file);
        if (!existsSync(f)) return 0;
        try { return readFileSync(f, 'utf8').split('\n').filter(Boolean).filter(l => !col2 || l.split('|')[2] === col2).length; }
        catch { return null; }
      };
      return { mainEditEscapes: count('main-edits.log'), mainEditBlocks: count('gate-fails.log', 'protect-integration-branch') };
    })(),

    preMergeRanAt: num(() => {
      const f = join(telemetryDir(), 'gate-runs.log');
      if (!existsSync(f)) return null;
      const times = readFileSync(f, 'utf8').split('\n')
        .filter(l => l.split('|')[2] === 'gates:preMerge')
        .map(l => Date.parse(l.split('|')[0]))
        .filter(Number.isFinite);
      return times.length ? Math.max(...times) : null;
    }, null),
    lastCommitAt: num(() => {
      const r = git(['log', '-1', '--format=%cI']);
      if (r.status !== 0 || !r.stdout.trim()) return null;
      const t = Date.parse(r.stdout.trim());
      return Number.isFinite(t) ? t : null;
    }, null),

    ...fixlogState(),

    learningsNewerThanLessons: num(() => {
      const ld = repoPath('.claude', 'learnings'), kd = repoPath('knowledge', 'lessons');
      if (!existsSync(ld) || !existsSync(kd)) return null;
      const newest = (dir) => Math.max(0, ...readdirSync(dir).filter(f => f.endsWith('.md') && !f.startsWith('_'))
        .map(f => statSync(join(dir, f)).mtimeMs));
      const lessonAt = newest(kd);
      return readdirSync(ld).filter(f => f.endsWith('.md') && !f.startsWith('_'))
        .filter(f => statSync(join(ld, f)).mtimeMs > lessonAt).length;
    }),

    skillCount: num(() => readdirSync(repoPath('.claude', 'skills'), { withFileTypes: true }).filter(d => d.isDirectory()).length),
    maxSkills: limit('maxSkills', 12),
    worktrees: num(() => (git(['worktree', 'list', '--porcelain']).stdout.match(/^worktree /gm) || []).length),
    maxWorktrees: limit('maxWorktrees', 4),
    // Đếm pack CHƯA ĐƯỢC QUYẾT, không đếm pack TỒN TẠI — phán đoán nằm ở `packPending`
    // trong lib, và từ v2.27.0 `harness-doctor` cùng `accept.mjs --list` gọi CHÍNH nó.
    // Ba định nghĩa cho một câu hỏi là cách hai công cụ nói ngược nhau về cùng một thư mục.
    ...(() => {
      const packs = readPacks();
      if (packs === null) return { pendingPacks: null, pendingMaterial: null };
      let log = '';
      try { log = readFileSync(repoPath('knowledge', 'DECISIONS.log'), 'utf8'); } catch {}
      const p = packPending(packs, log);
      return { pendingPacks: p.count, pendingMaterial: p.material };
    })(),

    // Phán đoán ngân sách nằm ở `budgetStatus` (THUẦN). `collect` chỉ đọc đĩa.
    budget: budgetStatus({
      cap: cfg.budget?.monthlyUsdCap,
      alertAtPercent: cfg.budget?.alertAtPercent,
      latest: latestCapoEntry(),
      role: repoRole(),
    }),

    // Version Claude Code ĐANG chạy, và version đã được RÀ. Cả hai đều có thể là null, và
    // hai cái null đó nghĩa khác nhau: không đọc được version ⇒ `?` (không đo được); đọc
    // được version mà chưa có baseline ⇒ `due` (chưa ai rà). Gộp chúng thành một là cách
    // một mục tới hạn thật biến thành một mục im lặng.
    claudeCodeVersion: claudeCodeVersionMeasured(),
    claudeCodeVersionWhy: claudeCodeVersionMeasured() ? null
      : `không đo được version Claude Code — đã thử CẢ HAI nguồn: ${process.env.CLAUDE_CODE_EXECPATH
        ? `CLAUDE_CODE_EXECPATH = "${process.env.CLAUDE_CODE_EXECPATH}" (không có đoạn nào là version)`
        : 'CLAUDE_CODE_EXECPATH không được đặt'}, và không thấy package.json của @anthropic-ai/claude-code trong 5 tầng trên binary đó`,
    ...(() => {
      try {
        const b = JSON.parse(readFileSync(repoPath('.claude', 'claude-code-baseline.json'), 'utf8'));
        return {
          reviewedClaudeCode: b.reviewedVersion || null,
          reviewedClaudeCodeAt: b.reviewedAt || null,
          // Chỉ ĐỌC cache, không quét binary — xem lý do ở `check` của `claude-code-drift`.
          nativeEventsVersion: b.nativeEvents?.version || null,
          nativeEventsCount: Array.isArray(b.nativeEvents?.events) ? b.nativeEvents.events.length : null,
        };
      } catch { return { reviewedClaudeCode: null, reviewedClaudeCodeAt: null, nativeEventsVersion: null, nativeEventsCount: null }; }
    })(),
  };
}

/** fixlog: tổng số mục, và số NHÓM đã đạt ngưỡng ≥2 (ngưỡng promote của /harness-propose). */
function fixlogState() {
  try {
    const f = join(telemetryDir(), 'manual-fixes.log');
    if (!existsSync(f)) return { fixlogTotal: 0, fixlogRepeated: 0 };
    const lines = readFileSync(f, 'utf8').split('\n').filter(Boolean);
    // `fixlogKey` ở `lib/harness.mjs` — MỘT nguồn cho cả `--top`, `--close` và chỗ này.
    // Luật gom nhóm thủ công phải đọc Ở ĐÂY NỮA: nếu `--top` thấy một nhóm ≥2 mà bảng nghi thức
    // không thấy, thì người dùng đọc được "có ứng viên bài học" ở một chỗ và "chưa nhóm nào đạt
    // ngưỡng" ở chỗ kia — hai câu trả lời khác nhau cho cùng một câu hỏi, và không gì báo.
    const rules = fixlogGroupRules();
    const norm = (t) => fixlogKey(t, rules);
    const groups = new Map();
    for (const l of lines) {
      const text = l.split('|').slice(3).join('|').trim() || l;
      const k = norm(text);
      groups.set(k, (groups.get(k) ?? 0) + 1);
    }
    // Trừ nhóm ĐÃ ĐÓNG. Không trừ thì một nhóm ≥2 lần ĐỎ VĨNH VIỄN: fixlog chỉ biết ghi thêm,
    // không biết việc đã được xử. Đo ở `sakubun`: nhóm `gen-clean chẩn đoán sai` đạt 2 lần và
    // đã được sửa ở template v2.10.0 — fixlog cục bộ không biết, nên mục này sẽ nhắc mãi.
    // Cùng hình dạng với bug đếm pack ở 2.10.4: đếm cái TỒN TẠI thay vì cái CHƯA XỬ.
    const closedFile = join(telemetryDir(), 'fixlog-closed.log');
    const closed = new Set();
    try {
      for (const l of readFileSync(closedFile, 'utf8').split('\n').filter(Boolean)) closed.add(l.split('\t')[1]);
    } catch { /* chưa đóng nhóm nào */ }
    const open = [...groups.entries()].filter(([k]) => !closed.has(k));
    return { fixlogTotal: lines.length, fixlogRepeated: open.filter(([, n]) => n >= 2).length };
  } catch { return { fixlogTotal: null, fixlogRepeated: null }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────
// So ĐƯỜNG DẪN ĐÃ RESOLVE, không so hậu tố tên file: `test-hooks.mjs` IMPORT module này để
// khẳng định `evaluate()`, và một guard so tên sẽ chạy luôn cả CLI trong lúc test.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const ALL = process.argv.includes('--all');
  const JSONOUT = process.argv.includes('--json');

  // ── Ghi lại một lần rà Claude Code. LÝ DO BẮT BUỘC, và đó không phải hình thức: mục này
  // đóng được bằng cách "không thấy gì" — nhưng *"đã đọc changelog 2.1.221, không có gì
  // trùng thứ harness tự viết"* là một kết luận kiểm được, còn một file baseline bị bump
  // lặng lẽ thì không phân biệt được với việc chưa ai đọc. Cùng lý do `fixlog --close` đòi
  // lý do: một mục bị đóng mà không ghi vì sao thì lần sau không ai dựng lại được quyết định.
  const ri = process.argv.indexOf('--reviewed-claude-code');
  if (ri > -1) {
    const found = process.argv.slice(ri + 1).filter(a => !a.startsWith('--')).join(' ').trim();
    // CÙNG nguồn với `collect()`. Hai phép đo khác nhau ở chỗ ĐỌC và chỗ GHI nghĩa là:
    // bảng nói "đang chạy 2.1.222, hãy rà đi", còn lệnh rà thì từ chối vì không biết version.
    const version = claudeCodeVersionMeasured();
    if (!version) {
      console.error('Không đo được version Claude Code (cả CLAUDE_CODE_EXECPATH lẫn package.json của @anthropic-ai/claude-code) — không ghi baseline cho một version không biết.');
      process.exit(1);
    }
    if (!found) {
      console.error(`Cách dùng: node tooling/rituals.mjs --reviewed-claude-code "<đã thấy gì>"`);
      console.error(`  Ví dụ: "2.1.221 không ra thêm gì trùng harness" hoặc "ra native X — mở issue bỏ tooling/y.mjs".`);
      console.error(`  Lý do là BẮT BUỘC: một baseline bị bump lặng lẽ không phân biệt được với việc chưa ai đọc.`);
      process.exit(1);
    }
    const p = repoPath('.claude', 'claude-code-baseline.json');
    let prev = {};
    try { prev = JSON.parse(readFileSync(p, 'utf8')); } catch { /* lần đầu */ }
    const history = Array.isArray(prev.history) ? prev.history : [];
    history.unshift({ version, at: new Date().toISOString(), found });
    writeFileSync(p, JSON.stringify({
      $comment: 'Bản rà Claude Code gần nhất. Nghi thức `claude-code-drift` so `reviewedVersion` với version đang chạy. '
        + 'Đừng sửa tay — dùng `node tooling/rituals.mjs --reviewed-claude-code "<thấy gì>"`.',
      reviewedVersion: version,
      reviewedAt: history[0].at,
      history: history.slice(0, 20),
    }, null, 2) + '\n', 'utf8');
    console.log(`✓ đã ghi: rà Claude Code ${version}`);
    console.log(`  thấy: ${found}`);
    console.log(`  Nghi thức claude-code-drift sẽ im cho tới lần Claude Code lên version tiếp theo.\n`);
    process.exit(0);
  }

  const results = evaluate(collect());

  if (JSONOUT) { console.log(JSON.stringify(results, null, 2)); process.exit(0); }

  const due = results.filter(r => r.state === 'due');
  const unknown = results.filter(r => r.state === '?');

  if (!ALL) {
    // Bản NGẮN cho SessionStart: chỉ việc tới hạn. Không có gì tới hạn thì IM LẶNG —
    // một dòng "không có gì cần làm" mỗi phiên là chính loại nhiễu file này thay thế.
    for (const r of due) console.log(`   ▸ ${r.cmd.padEnd(20)} ${r.why}`);
    // NÊU TÊN, không nêu số lượng. Bản cũ in `? 2 nghi thức KHÔNG đo được` rồi bảo chạy
    // `--all` để biết thêm — và gặp thật 2026-08-06: một mục `?` xuất hiện ở SessionStart rồi
    // BIẾN MẤT trước khi kịp chạy `--all`. Trạng thái `?` thường do một phép đo chập chờn
    // (git bận, đường dẫn chưa sẵn), tức đúng loại hay tự khỏi — nên lời khuyên "chạy lại để
    // xem" là lời khuyên KHÔNG BAO GIỜ trả lời được cho chính ca nó được sinh ra để phục vụ.
    // Một cái tên tại chỗ thì rẻ hơn, và nó còn nguyên giá trị sau khi triệu chứng đã qua.
    for (const r of unknown) console.log(`   ? ${r.cmd.padEnd(20)} KHÔNG đo được — ${r.why}`);
    process.exit(0);
  }

  report('NGHI THỨC', {
    fail: due.map(r => `${r.cmd.padEnd(20)} ${r.why}`),
    unknown: unknown.map(r => `${r.cmd.padEnd(20)} ${r.why}`),
    ok: results.filter(r => r.state === 'ok').map(r => `${r.cmd.padEnd(20)} ${r.why}`),
  });
  console.log('  Mọi năng lực của harness đều nằm ở bảng trên — không có cái nào chỉ tồn tại');
  console.log('  trong tài liệu. Mục ĐỎ là việc đang tới hạn, kèm số đo để bạn tự kiểm.\n');
  process.exit(0);
}
