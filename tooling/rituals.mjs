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
import { repoPath, git, config, limit, report, telemetryDir, exists, fixlogKey, fixlogGroupRules, readJson, writeJson, readPacks, packPending, budgetSnapshot, repoRole, openTelemetryEntries, closeTelemetry, telemetryEntries, inferIssue } from './lib/harness.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// PHẦN THUẦN — không đọc đĩa, không gọi git. Test khẳng định trực tiếp vào đây.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nói RA rằng số issue là SUY RA, không phải đọc được.
 *
 * `inferIssue()` nhận số trần khi không `issuePrefixes` nào khớp, và phép đó bắn nhầm được:
 * `fix/2-space-indent` sẽ đọc thành issue 2. Cái giá của việc né bằng `?` là mù trên 100%
 * nhánh (đó chính là #96); cái giá của bắn nhầm là một dòng sai mà người đọc SỬA ĐƯỢC — nhưng
 * chỉ khi họ thấy nó đến từ đâu. Một phán đoán ngầm thì không ai sửa.
 */
const inferred = (s) => (s.issueFrom === 'bare'
  ? ' · issue SUY TỪ số trần trong tên nhánh (`project.issuePrefixes` không khớp) — sai thì đổi tên nhánh hoặc khai prefix'
  : '');

/**
 * Mỗi nghi thức trả về `{ state, why }` với `state` ∈ `due` | `ok` | `n/a` | `?`.
 *
 * `why` là BẰNG CHỨNG, không phải lời khuyên — nó phải chứa con số hoặc đường dẫn. Một dòng
 * không có bằng chứng thì người đọc không kiểm được, và thứ không kiểm được sẽ bị bỏ qua đúng
 * như dòng nhắc tĩnh mà file này thay thế.
 *
 * ── VÌ SAO CÓ `n/a`, VÀ NÓ KHÔNG PHẢI MỘT CÁCH IM LẶNG ───────────────────────────────────
 *
 * Tới 2.52.0 bảng này chỉ có BA giá trị, nên mọi thứ không trả lời được đều rơi vào `?`. Hai
 * thứ rất khác nhau bị gộp vào đó:
 *
 *   ① KHÔNG CÓ CHỦ NGỮ — câu hỏi không áp dụng. Nhánh `fix/learner-ability-legacy-id` không
 *      mang số issue ⇒ `/claim` hỏi *"đã nhận issue nào chưa"* về một issue KHÔNG TỒN TẠI.
 *      Đo được, kết quả là "không có gì để nhận", và đo lại kỹ hơn cũng không đổi.
 *   ② PHÉP ĐO HỎNG — `fixlog` không đọc được, `git` không resolve được nhánh tích hợp. Ở đây
 *      `?` là câu trả lời ĐÚNG và nó che một rủi ro thật.
 *
 * Gộp ① vào ② phải trả giá bằng nhiễu, và cái giá đó đã đo được: chú thích ở
 * `.claude/hooks/session-start.mjs` ghi thẳng rằng **một nhánh không mang số issue làm BA
 * nghi thức cùng ra `?`** (`/claim`, `/handoff`, `/verify-ui`). Ba dòng `?` mỗi phiên, cho một
 * tình huống không ai sửa được bằng cách nào khác ngoài đổi tên nhánh — đúng tầng 1 của
 * `knowledge/lessons/0003`: một tín hiệu không hành động được dạy người ta bỏ qua tín hiệu.
 *
 * `n/a` là rổ đã có sẵn ở `report()` (`lib/harness.mjs`) và nó nói ĐÚNG một câu: **bằng không
 * DO CẤU TRÚC**. Nó KHÔNG phải `ok` — `ok` khẳng định nghi thức đã chạy và sạch. Và nó không
 * làm báo cáo tự nhận là "xanh" theo cách khác: `report()` in riêng dòng đếm cho nó.
 *
 * RANH GIỚI ĐẮT NHẤT NẰM Ở `null` vs `undefined`:
 *
 *   s.issue === null       → đã đọc tên nhánh, nhánh KHÔNG mang số issue   ⇒ `n/a`
 *   s.issue === undefined  → `collect()` rơi mất khoá này                  ⇒ `?`
 *
 * Một `collect()` bị refactor làm rơi khoá `issue` mà đi xuống nhánh `n/a` là bảng báo "không
 * áp dụng" cho một phép đo **chưa từng chạy** — đúng lớp lỗi cả khối này ra đời để chống.
 *
 * CHỖ CHỊU LỰC LÀ GUARD `=== undefined` ĐỨNG TRƯỚC, không phải dấu `===` ở dòng `null`. Đo
 * bằng mutation 2026-08-10, trong lượt review chính bản vá này:
 *
 *   đổi `=== null` → `== null` ở dòng `n/a`   → KHÔNG ca nào đỏ (mutant TƯƠNG ĐƯƠNG:
 *                                               guard phía trên đã trả `?` cho `undefined` rồi)
 *   BỎ HẲN guard `=== undefined`              → ca ⑤b ĐỎ ngay, đúng tên nghi thức
 *
 * Nên `=== null` ở đây là **dự phòng có chủ ý** (nó nói rõ nhánh này chỉ về ca `null`), và ca
 * ⑤b là thứ thật sự canh. Bản đầu của chú thích này gán vai chịu lực cho `===` — một lời khai
 * độ phủ không có độ phủ, và mutation là thứ duy nhất phân biệt được hai điều đó.
 * `/verify-ui` đã dùng đúng khuôn này cho `s.ui` từ 2026-08-07.
 */
export const RITUALS = [
  {
    id: 'claim',
    cmd: '/claim',
    what: 'nhận việc: đọc nhật ký cũ, đặt chỗ vùng nóng, tạo docs/progress/<issue>.md',
    check: (s) => {
      if (s.issue === undefined) return { state: '?', why: '`collect()` không trả về khoá `issue` — phép suy chưa chạy, KHÔNG phải "nhánh không có issue"' };
      // KHÔNG CÓ CHỦ NGỮ ⇒ `n/a`, không phải `?`. Phép suy ĐÃ chạy và kết quả là "nhánh này
      // không mang số issue" — `/claim` tạo `docs/progress/<issue>.md`, và không có `<issue>`
      // thì không có file để đòi. Đo lại kỹ hơn không đổi được câu trả lời, nên `?` ở đây chỉ
      // sinh nhiễu: xem chú thích trạng thái ở đầu khối RITUALS.
      if (s.issue === null) return { state: 'n/a', cause: 'branch-no-issue', why: `nhánh \`${s.branch || '?'}\` không mang số issue (\`<type>/<issue>-<slug>\`) — không có issue nào để nhận. Muốn bảng theo dõi thì đổi tên nhánh, hoặc khai \`project.issuePrefixes\`` };
      if (!s.issue) return { state: 'ok', why: 'đang ở nhánh tích hợp, không có issue để nhận' };
      // Solo vẫn cần nhật ký — chỉ khác NGƯỜI ĐỌC. "người sau" là lời khuyên rỗng khi bạn
      // là người duy nhất, và một lý do rỗng làm cả nghi thức đọc như thủ tục. Người đọc
      // thật của solo là PHIÊN SAU và MÁY KHÁC: đo 2026-08-06, một nhánh 3 commit nằm ngoài
      // main một ngày vì phiên tạo ra nó hết quota — không ai biết nó tồn tại.
      if (!s.progressExists) return { state: 'due', why: `đang ở issue ${s.issue} mà chưa có docs/progress/${s.issue}.md — `
        + (s.solo ? 'phiên sau của BẠN (và máy khác của bạn) không có gì để đọc' : 'phiên sau (và người sau) không có gì để đọc') + inferred(s) };
      return { state: 'ok', why: `docs/progress/${s.issue}.md đã có${inferred(s)}` };
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
      if (s.issue === undefined) return { state: '?', why: '`collect()` không trả về khoá `issue` — phép suy chưa chạy' };
      // ── MỤC DUY NHẤT KHÔNG ĐƯỢC IM KHI THIẾU SỐ ISSUE ────────────────────────────────
      //
      // Hai mục kia (`/claim`, `/verify-ui`) mất CHỦ NGỮ khi nhánh không mang số issue: không
      // có issue thì không có nhật ký để đòi, không có feature để chụp. `/handoff` thì không —
      // chủ ngữ của nó là **công việc sẽ mất**, và cái đó tồn tại độc lập với tên nhánh.
      //
      // Số issue chỉ là ĐƯỜNG TẮT để tra `docs/progress/<issue>.md`. Bản trước coi mất đường
      // tắt là mất phép đo và trả `?`; bản trước nữa còn tệ hơn, trả `ok — không có gì để giao
      // lại` (nhật ký W32 bắt được đúng ca đó: 2 commit chưa push, người dùng sắp sang máy
      // khác). Cả hai đều sai cùng một kiểu — hỏi sai câu rồi báo cáo về câu đã hỏi.
      //
      // Câu đúng đo được mà không cần issue: cây có bẩn không, và có commit nào chưa vào nhánh
      // tích hợp không. Hai tín hiệu đó CHÍNH LÀ thứ mất khi đổi máy hoặc hết quota giữa phiên.
      if (s.issue === null) {
        const bits = [];
        if (s.dirtyFiles > 0) bits.push(`${s.dirtyFiles} file chưa commit`);
        if (s.ahead > 0) bits.push(`${s.ahead} commit chưa vào ${s.integrationBranch}`);
        // Có tín hiệu DƯƠNG thì kết luận được ngay, kể cả khi tín hiệu kia không đọc được —
        // "biết chắc có việc dở" không cần cả hai phép đo. Thứ tự này cố ý: nó làm mục đỏ
        // sống sót qua một phép đo hỏng, thay vì bị một `null` nuốt mất.
        if (bits.length) {
          return { state: 'due', why: `nhánh \`${s.branch || '?'}\` không mang số issue nên không có docs/progress/ để tra, nhưng ${bits.join(' và ')} — đó là thứ biến mất khi bạn đổi máy hoặc hết quota giữa phiên` };
        }
        if (s.dirtyFiles == null || s.ahead == null) {
          return { state: '?', why: `nhánh không mang số issue, và ${s.dirtyFiles == null ? 'không đọc được cây làm việc (`git status`)' : `không resolve được ${s.integrationBranch}`} — không nói được là có việc dở hay không` };
        }
        return { state: 'n/a', cause: 'branch-no-issue', why: `nhánh \`${s.branch || '?'}\` không mang số issue, cây sạch và 0 commit đi trước ${s.integrationBranch} — không có gì để giao lại` };
      }
      if (!s.issue) return { state: 'ok', why: 'đang ở nhánh tích hợp — không có gì để giao lại' };
      if (!s.progressExists) return { state: 'ok', why: '/claim đang tới hạn trước — nhật ký chưa tồn tại' };
      if (s.commitsSinceProgress > 0) {
        return { state: 'due', why: `${s.commitsSinceProgress} commit mới hơn lần sửa docs/progress/${s.issue}.md gần nhất — công việc đã đi trước nhật ký${inferred(s)}` };
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
      if (s.issue === undefined) return { state: '?', why: '`collect()` không trả về khoá `issue` — phép suy chưa chạy' };
      // Cùng lý do với `/claim`: `s.ui` được tra BẰNG số issue (`j.issue !== issue`), nên
      // không có số thì không có feature nào để đối chiếu — bằng không do cấu trúc, không
      // phải một phép đo còn nợ. Giữ `=== null` ở dòng `s.ui` phía trên: đó mới là ca `?` thật.
      if (s.issue === null) return { state: 'n/a', cause: 'branch-no-issue', why: `nhánh \`${s.branch || '?'}\` không mang số issue — không tra được features/*.json theo issue, nên không có ảnh nào đang nợ` };
      if (!s.issue) return { state: 'ok', why: 'đang ở nhánh tích hợp — không có feature nào để chụp' };
      if (s.ui === undefined) return { state: 'ok', why: `không có features/*.json nào khai issue ${s.issue}${inferred(s)}` };
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
      // Chưa có ca nào ⇒ KHÔNG CÓ TỈ LỆ, vì không có mẫu số. Đây là `n/a` (bằng không do cấu
      // trúc), không phải `?` — và tuyệt đối không phải `ok`.
      //
      // L0005 vẫn được giữ nguyên ở đây: bài học đó cấm trả lời "guard ổn" trên mẫu số 0, và
      // `n/a` KHÔNG nói guard ổn. Cái đổi là chỗ khác — `?` hứa rằng đo lại sẽ ra số, nhưng ở
      // một repo mới cắm guard thì phép đo ĐÃ chạy đúng và kết quả thật sự là "chưa có ca nào".
      // Giữ nó ở `?` biến một sự thật vĩnh viễn-cho-tới-khi-ai-đó-chạm-main thành một dòng
      // nhắc mỗi phiên mà không ai hành động được — trừ khi cố tình vi phạm để tạo mẫu.
      if (total === 0) return { state: 'n/a', why: 'guard nhánh tích hợp chưa gặp ca nào (0 chặn, 0 cửa thoát) — chưa có mẫu số, nên chưa có tỉ lệ. KHÔNG đọc là "guard ổn": nó mới chỉ chưa được thử' };
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
        // LỐI RA IN NGAY Ở CHỖ BÁO ĐỎ. Một cơ chế đóng mà người đọc không tìm thấy thì tương
        // đương không có — và mục này đã đỏ vĩnh viễn suốt vì đúng lý do đó (#105).
        return { state: 'due', why: `${s.harnessBlocks} lần bị \`protect-harness\` chặn khi sửa vùng cấm (gate-fails.log) — `
          + 'hoặc harness đang cản một việc chính đáng, hoặc ai đó đang thử sửa tay thứ phải đi qua PR. Cả hai đều là lý do chạy skill này. '
          + 'Xử lý xong rồi: `node tooling/rituals.mjs --close harness-propose "<đã làm gì>"` (lần chặn MỚI sẽ tự mở lại)' };
      }
      if (s.harnessBlocks) return { state: 'ok', why: `${s.harnessBlocks} lần bị chặn ở vùng cấm, chưa đạt ngưỡng 2` };
      const closed = (s.harnessBlocksEver ?? 0) - s.harnessBlocks;
      return { state: 'ok', why: closed > 0
        ? `${closed} lần bị chặn ở vùng cấm, tất cả ĐÃ ĐÓNG (lý do trong gate-fails.log) — không phải "chưa từng xảy ra"`
        : 'chưa lần nào bị chặn ở vùng cấm' };
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
      // GÓI PHẲNG (#111): CAPO vẫn đo được và vẫn đáng đo — nhưng nó đọc là *"giá trị rút ra
      // trên một khoản phí CỐ ĐỊNH"*, không phải *"tiền đã tiêu"*. Cổ chai là rate limit, và
      // con số đó do chính harness đếm, không phải người chép từ dashboard.
      if (b.mode === 'flat-unmeasured') return { state: '?', why: b.advice };
      if (b.mode === 'flat-limited') return { state: 'due', why: b.advice };
      if (b.mode === 'flat-ok') {
        return b.measured
          ? { state: 'ok', why: `gói PHẲNG · 0 lần chạm rate limit trong 30 ngày · CAPO đo ${b.ageDays} ngày trước — CAPO ở đây là giá trị rút ra trên phí cố định, không phải tiền tiêu` }
          : { state: 'due', why: 'gói PHẲNG: 0 lần chạm rate limit (tốt), nhưng CAPO chưa lần nào đo — không biết harness có đang tốt lên không. `node tooling/capo-report.mjs --days 7 --usd <phí tháng>`' };
      }
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
  {
    // ── CÂU HỎI **CỘNG** — cặp đôi của `claude-code-drift` ngay trên, và nửa còn thiếu của nó.
    //
    // Mục trên hỏi *"vendor có làm thứ harness tự viết thành thừa không"*: nó đi tìm cơ chế để
    // CẮT, nên nó chỉ nhìn được những chỗ harness ĐÃ có mặt. Chỗ vendor **gọi cho ta mà ta chưa
    // bao giờ nhấc máy** thì không mục nào trong bảng này nhìn thấy.
    //
    // Đo 2026-08-09: binary 2.1.226 có 31 sự kiện hook, `settings.json` cắm 9, còn **22 ô để
    // trống** — và cả 22 nằm im trong rổ `na` của `native-surface` kèm lời *"không phải thiếu
    // sót"*. Con số 22 được IN RA suốt nhiều version như một số đo; không ai XÉT nó.
    //
    // RANH GIỚI CỦA MỤC NÀY LÀ "ĐÃ HỎI CHƯA", KHÔNG PHẢI "ĐÃ LÀM CHƯA". Một ô `co-viec` làm mục
    // này XANH — kèm số issue in ra mỗi lần `--all`. Bắt nó đỏ cho tới khi ô được cắm là bắt nó
    // đỏ vĩnh viễn, và một mục đỏ vĩnh viễn dạy người ta bỏ qua màu đỏ (lessons/0003 tầng 1;
    // cùng lý do `ui` phải khoá vào issue hiện tại thay vì quét cả repo). Phần THI HÀNH có nơi
    // theo dõi riêng rồi: issue tracker. Đổi lại, `--slot … co-viec` TỪ CHỐI một lý do không có
    // số issue — nếu không thì "có việc" là một câu ghi vào sổ rồi không ai đọc lại.
    id: 'native-slot-review',
    cmd: 'rituals.mjs --slots',
    what: 'ô mở rộng native còn TRỐNG: ô nào harness CÓ việc cho nó? (câu hỏi CỘNG)',
    check: (s) => {
      const n = s.nativeSlots;
      if (!n) {
        return { state: '?', why: 'chưa có tập sự kiện hook trong `.claude/claude-code-baseline.json` (hoặc không đọc được '
          + '`.claude/settings.json`) — không trừ được tập nào, nên KHÔNG biết còn ô nào trống. '
          + '`node tooling/native-surface.mjs --record`' };
      }
      if (n.unexamined.length) {
        const rest = n.unexamined.length - 3;
        return { state: 'due', why: `${n.unexamined.length}/${n.empty.length} ô mở rộng native để TRỐNG mà chưa ai xét `
          + `(${n.unexamined.slice(0, 3).join(' · ')}${rest > 0 ? ` … +${rest}` : ''}) — mỗi ô là một chỗ vendor GỌI cho bạn `
          + 'mà harness không nhấc máy. Cả sổ: `node tooling/rituals.mjs --slots`' };
      }
      // Phán đoán cũ nói về một sự kiện vendor đã bỏ. Không nguy hiểm, nhưng nó chiếm chỗ của
      // một câu hỏi: `khong-co-viec` về một sự kiện không tồn tại đọc y hệt một câu đã trả lời.
      if (n.stale.length) {
        return { state: 'due', why: `${n.stale.length} phán đoán trong sổ nói về sự kiện binary KHÔNG còn có `
          + `(${n.stale.join(' · ')}) — vendor đã bỏ nó. Xoá: \`node tooling/rituals.mjs --slot <Event> chua-xet\`` };
      }
      return { state: 'ok', why: `${n.empty.length} ô để trống đã xét hết — ${n.hasWork.length} CÓ việc`
        + (n.hasWork.length ? ` (${n.hasWork.join(' · ')}${n.issues.length ? ` → ${n.issues.join(' ')}` : ''})` : '')
        + ` · ${n.noWork.length} không có việc` };
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

/**
 * HỢP NHẤT bản rà mới vào baseline cũ — THUẦN, để test được mà không đụng file thật.
 *
 * `.claude/claude-code-baseline.json` có **HAI người ghi**, và họ ghi hai thứ khác nhau:
 *
 *   rituals.mjs --reviewed-claude-code   → reviewedVersion · reviewedAt · history   (người đọc changelog)
 *   native-surface.mjs --record          → nativeEvents                             (máy quét binary)
 *
 * Bản trước dựng lại object từ đầu với đúng bốn khoá và chỉ đọc `prev` để lấy `history`. Nên
 * `nativeEvents` **biến mất** — và nó biến mất IM LẶNG, chỉ phụ thuộc thứ tự chạy hai lệnh.
 * Đo 2026-08-08 (issue #120): chạy `--record` trước rồi rà, `git diff` ra `8 thêm · 40 XOÁ`, và
 * nghi thức ngay sau đó nói *"CHƯA đo tập sự kiện hook lần nào"* — trong khi nó vừa được đo 30
 * giây trước. Câu đó không phân biệt được với "thật sự chưa ai đo".
 *
 * Đánh đúng vào phép đo mà chính file này gọi là *"máy trừ được thì đừng hỏi người"*: tập sự
 * kiện hook là con số DUY NHẤT trong bề mặt vendor kiểm được bằng máy, và cơ chế bảo vệ nó lại
 * là cơ chế xoá nó.
 *
 * `...prev` TRƯỚC, bốn khoá của lần rà GHI ĐÈ SAU — thứ tự đó là cả bản vá. Đảo lại thì
 * `history` cũ trong `prev` thắng bản ghi mới, tức bản rà vừa viết bị nuốt: cùng một lỗi, đổi
 * nạn nhân.
 */
export function mergeBaseline(prev, { version, at, found }) {
  const history = Array.isArray(prev?.history) ? prev.history : [];
  return {
    ...prev,
    $comment: 'Bản rà Claude Code gần nhất. Nghi thức `claude-code-drift` so `reviewedVersion` với version đang chạy. '
      + 'Đừng sửa tay — dùng `node tooling/rituals.mjs --reviewed-claude-code "<thấy gì>"`.',
    reviewedVersion: version,
    reviewedAt: at,
    history: [{ version, at, found }, ...history].slice(0, 20),
  };
}

/**
 * SỔ Ô MỞ RỘNG NATIVE — THUẦN, và nó là một **phép trừ tập hợp**, không phải một danh sách.
 *
 * `chua-xet = events − wired − ledger`. Nhờ là phần BÙ, một sự kiện MỚI vendor thêm vào binary
 * **tự rơi vào `chua-xet`** ở lần `native-surface --record` kế tiếp — không có bảng viết tay nào
 * phải bảo trì, và không có cách nào quên một ô mới. Đó là khác biệt cố ý với `NATIVE_SLOTS` ở
 * `harness-doctor`: bảng đó là 5 ô mà TEMPLATE đã quyết là có việc, để repo tiêu thụ đối chiếu
 * settings.json của HỌ; nó cố ý viết tay và cố ý KHÔNG đổi theo binary. Hai câu hỏi khác nhau.
 *
 * BA TRẠNG THÁI, trùng đúng ba rổ mà `report()` đã có sẵn (`lib/harness.mjs`):
 *
 *   co-viec        có việc, đã mở issue     → `warn`     đã đo, và đây là kết quả
 *   khong-co-viec  đã xét và bác, có lý do  → `na`       bằng không DO CẤU TRÚC
 *   chua-xet       chưa ai hỏi              → `unknown`  CHƯA ĐO ĐƯỢC — không phải 0
 *
 * Sự trùng đó không phải trang trí, nó là chỗ bản vá này bắt đầu: tới 2.46.0 `native-surface`
 * đẩy **cả 22** ô trống vào `na` kèm lời *"không phải thiếu sót, nội dung là đặc thù repo"* —
 * tức tự khai là đã trả lời xong một câu chưa ai đặt ra.
 *
 * `events` rỗng / không phải mảng ⇒ **`null`**, KHÔNG phải "0 ô trống". "Chưa quét binary lần
 * nào" và "quét rồi, không ô nào trống" là hai câu khác hẳn nhau, và gộp chúng thì mục này xanh
 * ở đúng repo chưa từng đo.
 */
export function nativeSlotState({ events, wired, ledger } = {}) {
  if (!Array.isArray(events) || !events.length) return null;
  // HAI đầu vào, HAI cách không đo được, và cả hai phải ra `null`. `wired` đọc không được mà
  // rơi xuống `[]` thì MỌI sự kiện thành "ô trống": nghi thức đỏ với 31 cái tên, dựng trên một
  // file chưa đọc nổi. Phép gộp đó cùng loại với `events` rỗng, nên nó phải chết ở CÙNG CHỖ —
  // trong hàm THUẦN, nơi bảng ca khẳng định được. Để nhánh này ở `collect()` thì nó không thuần,
  // không test được, và một mutant đổi nó sống sót im lặng (đúng ca đã gặp ở #127).
  if (!Array.isArray(wired)) return null;
  const w = new Set(wired);
  const led = (ledger && typeof ledger === 'object' && !Array.isArray(ledger)) ? ledger : {};
  const empty = events.filter(e => !w.has(e));
  const hasWork = [], noWork = [], unexamined = [];
  for (const e of empty) {
    // GIÁ TRỊ LẠ RƠI VÀO `chua-xet`, không rơi vào "đã xét". Đây là chiều SỬA QUÁ TAY của bản
    // vá này (L0007): một phép đọc rộng tay — `if (led[e]) đã-xét` — làm mẫu số `chua-xet` teo
    // về 0 và nghi thức XANH trong khi chưa ai xét gì. Chiều ồn ào (quên một ô ⇒ đỏ) thì ai
    // cũng test; chiều này im lặng, nên nó có ca riêng trong `test-hooks.mjs`.
    const v = led[e]?.state;
    if (v === 'co-viec') hasWork.push(e);
    else if (v === 'khong-co-viec') noWork.push(e);
    else unexamined.push(e);
  }
  return {
    empty, hasWork, noWork, unexamined,
    // Số issue rút từ CHÍNH lý do — không có trường riêng để lệch. In ở dòng `ok` để phần
    // THI HÀNH không biến mất sau khi câu hỏi đã được trả lời.
    issues: [...new Set(Object.values(led).filter(v => v?.state === 'co-viec')
      .flatMap(v => String(v.why || '').match(/#\d+/g) || []))].sort(),
    // Phán đoán còn trong sổ mà binary KHÔNG còn sự kiện đó — vendor đã bỏ nó.
    stale: Object.keys(led).filter(e => !events.includes(e)),
    // Đã xét RỒI mới cắm. Với `co-viec` nghĩa là việc đã làm xong; với `khong-co-viec` thì sổ
    // và settings.json đang nói ngược nhau, và chỉ chỗ liệt kê mới phân biệt được hai ca.
    wiredJudged: Object.keys(led).filter(e => w.has(e)),
  };
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
  // Phép suy nằm ở `lib` và là HÀM THUẦN — xem chú thích ở `inferIssue()` để biết vì sao có
  // nhánh "số trần" và bắn nhầm được cân thế nào. `issueFrom` đi kèm để chỗ hiển thị nói RA
  // phép suy đã dùng: một phán đoán nhìn thấy được thì sửa được, một phán đoán ngầm thì không.
  const { issue, from: issueFrom } = inferIssue(branch, cfg.project?.issuePrefixes ?? []);

  const progress = issue ? repoPath('docs', 'progress', `${issue}.md`) : null;
  const progressExists = Boolean(progress && exists(progress));

  return {
    branch, integrationBranch, issue, issueFrom, progressExists,
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

    // Số file cây làm việc đang bẩn. Tồn tại vì `/handoff` phải trả lời được "có việc dở
    // không" trên một nhánh KHÔNG mang số issue — xem chú thích dài ở nghi thức đó. `null`
    // khi `git status` không chạy được, và `null` ở đó KHÔNG được đọc là "cây sạch".
    //
    // `--porcelain` chứ không phải `--short`: định dạng porcelain được git cam kết ổn định
    // giữa các version, còn `--short` thì không. Đây là thứ chạy ở MỌI SessionStart.
    dirtyFiles: num(() => {
      const r = git(['status', '--porcelain']);
      if (r.status !== 0) return null;
      return r.stdout.split('\n').filter(l => l.trim()).length;
    }),

    // Lần chạy gate `preMerge` gần nhất, và commit gần nhất — so HAI MỐC, không so một.
    // Chạy gate rồi commit thêm thì lần chạy đó không còn nói gì về cây hiện tại, nên
    // "đã chạy rồi" phải nghĩa là "đã chạy SAU commit cuối". Cả hai đều `null` được, và
    // `null` ở đây chạy tiếp thành `?` — KHÔNG thành `ok`.
    // Số lần `protect-harness` CHẶN một lần sửa vùng cấm. Đọc từ cùng log mà hook ghi vào,
    // nên không có cờ mới nào phải nhớ bật. `null` = không đọc được ⇒ `?`, KHÔNG phải 0:
    // "chưa có log" và "chưa lần nào bị chặn" là hai chuyện khác nhau.
    // ĐI QUA `openTelemetryEntries`, KHÔNG tự `readFileSync` (#105). Bản trước đếm mọi dòng
    // từng có, nên mục này đỏ VĨNH VIỄN sau hai lần bị chặn — kể cả khi cả hai đã xử lý xong.
    harnessBlocks: num(() => {
      const open = openTelemetryEntries('gate-fails', 'protect-harness');
      return open === null ? null : open.length;
    }, null),
    // TỔNG (kể cả đã đóng). Không có nó, mục `ok` in *"chưa lần nào bị chặn"* cho một repo đã
    // bị chặn ba lần và xử lý xong — tức đóng sổ xong thì LỊCH SỬ BIẾN MẤT. Đó đúng là lớp lỗi
    // mà cơ chế đóng sinh ra để tránh, xuất hiện lại trong chính thông báo của nó.
    harnessBlocksEver: num(() => telemetryEntries('gate-fails')?.filter(e => e.selector === 'protect-harness').length ?? null, null),

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
      // Qua `openTelemetryEntries` như mọi bên đọc khác (#105). Ở ĐÂY nó còn quan trọng hơn
      // chỗ khác: đây là một TỈ LỆ (cửa thoát / lần chặn), nên nếu một vế đóng được mà vế kia
      // không thì tỉ lệ méo đúng theo hướng làm guard trông sai.
      const count = (kind, selector) => openTelemetryEntries(kind, selector)?.length ?? null;
      return { mainEditEscapes: count('main-edits'), mainEditBlocks: count('gate-fails', 'protect-integration-branch') };
    })(),

    preMergeRanAt: num(() => {
      const runs = openTelemetryEntries('gate-runs', 'gates:preMerge');
      if (!runs?.length) return null;
      const times = runs.map(e => Date.parse(e.at)).filter(Number.isFinite);
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
    budget: budgetSnapshot(cfg, repoRole()),

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
      // HAI LẦN ĐỌC TÁCH NHAU, cố ý. Gộp chúng vào một `try` thì một file hỏng nuốt luôn mọi
      // khoá của file kia — và ở đây `settings.json` là file người dùng sửa tay thường xuyên
      // nhất, còn `claude-code-baseline.json` giữ bản rà không dựng lại được.
      let b = null, wired = null;
      try { b = JSON.parse(readFileSync(repoPath('.claude', 'claude-code-baseline.json'), 'utf8')); } catch { /* chưa rà lần nào */ }
      try { wired = Object.keys(JSON.parse(readFileSync(repoPath('.claude', 'settings.json'), 'utf8'))?.hooks ?? {}); } catch { /* ⇒ null, không phải [] */ }
      return {
        reviewedClaudeCode: b?.reviewedVersion || null,
        reviewedClaudeCodeAt: b?.reviewedAt || null,
        // Chỉ ĐỌC cache, không quét binary — xem lý do ở `check` của `claude-code-drift`.
        nativeEventsVersion: b?.nativeEvents?.version || null,
        nativeEventsCount: Array.isArray(b?.nativeEvents?.events) ? b.nativeEvents.events.length : null,
        // `wired` là `null` khi không đọc được settings.json, và `nativeSlotState` biến nó
        // thành `null` ⇒ `?`. Phán đoán đó nằm TRONG hàm thuần, cố ý — xem chú thích ở đó.
        nativeSlots: nativeSlotState({ events: b?.nativeEvents?.events, wired, ledger: b?.slotReview }),
      };
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
  // ── Đóng một nghi thức mà nguyên liệu của nó là một SỔ tích luỹ (#105).
  //
  // Không phải nút tắt: dòng đóng ghi vào CHÍNH cái sổ đang audit, lý do là bắt buộc, và mọi
  // occurrence MỚI tự mở lại. Nó chỉ nói *"mọi thứ tới đây đã xử lý"* — thứ mà một bộ đếm
  // tích luỹ suốt đời không có cách nào diễn đạt.
  const CLOSABLE = { 'harness-propose': { kind: 'gate-fails', selector: 'protect-harness' } };
  const ci = process.argv.indexOf('--close');
  if (ci > -1) {
    const id = process.argv[ci + 1];
    const reason = process.argv.slice(ci + 2).filter(a => !a.startsWith('--')).join(' ').trim();
    const spec = CLOSABLE[id];
    if (!spec || !reason) {
      console.error(`Cách dùng: node tooling/rituals.mjs --close <nghi-thức> "<đã làm gì>"`);
      console.error(`  Đóng được: ${Object.keys(CLOSABLE).join(' · ')}`);
      console.error(`  Lý do là BẮT BUỘC — đóng không lý do là tắt đèn, không phải xử lý.`);
      process.exit(1);
    }
    const before = openTelemetryEntries(spec.kind, spec.selector)?.length ?? 0;
    if (!closeTelemetry(spec.kind, spec.selector, reason)) {
      console.error(`Không ghi được vào ${spec.kind}.log — kiểm quyền ghi ở ${telemetryDir()}`);
      process.exit(1);
    }
    console.log(`✓ đã đóng ${before} mục \`${spec.selector}\` trong ${spec.kind}.log`);
    console.log(`  lý do: ${reason}`);
    console.log(`  Mục fixlog/telemetry vẫn GIỮ NGUYÊN làm bằng chứng. Lần chặn MỚI sẽ tự mở lại nghi thức này.\n`);
    process.exit(0);
  }

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
    writeFileSync(p, JSON.stringify(mergeBaseline(prev, { version, at: new Date().toISOString(), found }), null, 2) + '\n', 'utf8');
    console.log(`✓ đã ghi: rà Claude Code ${version}`);
    console.log(`  thấy: ${found}`);
    console.log(`  Nghi thức claude-code-drift sẽ im cho tới lần Claude Code lên version tiếp theo.\n`);
    process.exit(0);
  }

  // ── SỔ Ô MỞ RỘNG NATIVE ────────────────────────────────────────────────────
  //
  // NGƯỜI GHI THỨ BA của `.claude/claude-code-baseline.json`. Hai người kia:
  // `--reviewed-claude-code` (khoá `reviewedVersion`/`reviewedAt`/`history`) và
  // `native-surface.mjs --record` (khoá `nativeEvents`). Cả ba PHẢI đọc-sửa-ghi trên `prev` —
  // #120 là lần một người dựng lại object từ đầu và xoá đo của người kia, IM LẶNG, phụ thuộc
  // đúng thứ tự chạy hai lệnh.
  //
  // DÒNG NÀY TỪNG KHAI SAI (#148). Nó viết *"ca test `mergeBaseline` khoá cả ba khoá đó"*, và
  // tới lúc đó bảng chỉ có ca cho `nativeEvents` — `slotReview`, khoá do chính bản vá này thêm
  // vào, không có ca nào. Một lời khai nằm trong chú thích thì không gì đối chiếu nó với bảng
  // ca, nên nó sống được bao lâu cũng được.
  //
  // Nay bất biến được khoá ở dạng TỔNG QUÁT chứ không theo danh sách tên: bảng có ca cho một
  // khoá của "cơ chế CHƯA TỒN TẠI", nên người ghi thứ TƯ không cần ai nhớ thêm ca cho họ.
  //
  // VÌ SAO Ở ĐÂY chứ không ở `.claude/state/` như đề xuất ban đầu trong `.claude/learnings/`:
  // `.claude/state/` **nằm trong .gitignore**. Một phán đoán kiểu *"WorktreeCreate là
  // provisioner, đừng cắm advisory vào"* là sự thật của ĐỘI — nó phải review được trong PR và
  // phải sống qua một lần đổi máy. Sổ fixlog đã ở đúng chỗ gitignore đó, và cái giá đã đo được:
  // việc treo chỉ nằm trên một máy, người ở máy kia không biết nó tồn tại.
  const SLOT_STATES = ['co-viec', 'khong-co-viec', 'chua-xet'];
  const BASELINE_PATH = repoPath('.claude', 'claude-code-baseline.json');
  const readBaseline = () => readJson(BASELINE_PATH, {}) ?? {};
  // `null` = KHÔNG ĐỌC ĐƯỢC, khác `[]` = đọc được và không cắm hook nào. Xem `collect()`.
  const readWired = () => { try { return Object.keys(JSON.parse(readFileSync(repoPath('.claude', 'settings.json'), 'utf8'))?.hooks ?? {}); } catch { return null; } };

  const si = process.argv.indexOf('--slot');
  if (si > -1) {
    const ev = process.argv[si + 1];
    const st = process.argv[si + 2];
    const why = process.argv.slice(si + 3).filter(a => !a.startsWith('--')).join(' ').trim();
    const usage = () => {
      console.error('Cách dùng: node tooling/rituals.mjs --slot <Event> <co-viec|khong-co-viec|chua-xet> "<vì sao>"');
      console.error(`  Trạng thái: ${SLOT_STATES.join(' · ')}  — \`chua-xet\` XOÁ phán đoán, đưa ô về lại hàng chờ.`);
      console.error('  Xem cả sổ: node tooling/rituals.mjs --slots');
    };
    if (!ev || !SLOT_STATES.includes(st)) { usage(); process.exit(1); }

    const prev = readBaseline();
    const events = prev.nativeEvents?.events;
    if (!Array.isArray(events) || !events.length) {
      console.error('Chưa đo tập sự kiện hook lần nào — không xét được một ô mà không biết nó có tồn tại không.');
      console.error('  `node tooling/native-surface.mjs --record`');
      process.exit(1);
    }
    // `chua-xet` ĐƯỢC PHÉP nói về sự kiện binary không còn có — đó đúng là ca dọn `stale`, và
    // nếu chặn luôn ở đây thì mục `stale` của nghi thức không có đường đóng. Hai trạng thái kia
    // thì không: xét một sự kiện không tồn tại là ghi câu trả lời cho câu hỏi không ai hỏi.
    if (st !== 'chua-xet' && !events.includes(ev)) {
      console.error(`\`${ev}\` KHÔNG có trong ${events.length} sự kiện đo được ở binary ${prev.nativeEvents?.version ?? '?'}.`);
      console.error(`  Có: ${events.join(' · ')}`);
      process.exit(1);
    }
    if (st !== 'chua-xet' && !why) {
      console.error('Lý do là BẮT BUỘC — một ô đánh dấu "đã xét" mà không ghi vì sao thì không phân biệt được với chưa ai xét,');
      console.error('  và lần sau không ai dựng lại được quyết định. Cùng luật với `--reviewed-claude-code` và `fixlog --close`.');
      process.exit(1);
    }
    // `co-viec` ĐÒI số issue, và đó không phải thủ tục: nghi thức này XANH khi mọi ô đã xét, kể
    // cả ô có việc — vì bắt nó đỏ tới lúc ô được cắm là bắt nó đỏ vĩnh viễn. Chỗ duy nhất còn
    // theo dõi phần THI HÀNH là issue tracker. Không có số issue thì việc vừa tìm ra không ai giữ.
    if (st === 'co-viec' && !/#\d+/.test(why)) {
      console.error('`co-viec` phải kèm số issue (ví dụ `#131`) trong lý do.');
      console.error('  Nghi thức này chỉ theo dõi "đã HỎI chưa"; "đã LÀM chưa" thuộc issue tracker.');
      console.error('  Không có số issue thì ô này thành xanh mà việc vừa tìm ra không nằm trong hàng đợi nào.');
      process.exit(1);
    }

    prev.slotReview ??= {};
    if (st === 'chua-xet') {
      const had = prev.slotReview[ev];
      if (!had) { console.error(`\`${ev}\` không có phán đoán nào trong sổ — không có gì để xoá.`); process.exit(1); }
      delete prev.slotReview[ev];
      writeJson(BASELINE_PATH, prev);
      console.log(`✓ đã xoá phán đoán \`${ev}\` (\`${had.state}\` — ${had.why})`);
      console.log('  Ô này trở lại CHƯA XÉT, và nghi thức native-slot-review sẽ hỏi lại.\n');
      process.exit(0);
    }
    prev.slotReview[ev] = { state: st, at: new Date().toISOString(), why };
    writeJson(BASELINE_PATH, prev);
    console.log(`✓ ${ev} → ${st}`);
    console.log(`  ${why}`);
    if (st === 'co-viec') {
      console.log('  Sổ này nói cho RIÊNG repo này. Nếu ô này là việc của MỌI repo áp harness thì nó còn');
      console.log('  phải vào `NATIVE_SLOTS` ở tooling/harness-doctor.mjs + một migration — `settings.json`');
      console.log('  là lớp SEED nên bước copy của upgrade KHÔNG chạm nó.');
    }
    console.log('');
    process.exit(0);
  }

  if (process.argv.includes('--slots')) {
    const prev = readBaseline();
    const wired = readWired();
    const led = prev.slotReview ?? {};
    const n = wired === null ? null : nativeSlotState({ events: prev.nativeEvents?.events, wired, ledger: led });
    const row = (e, tail) => `${e.padEnd(22)}${tail}`;
    report('SỔ Ô MỞ RỘNG NATIVE', n === null ? {
      unknown: [wired === null
        ? 'không đọc được .claude/settings.json — không biết ô nào đang cắm, nên không trừ được tập nào'
        : 'chưa đo tập sự kiện hook lần nào (.claude/claude-code-baseline.json → nativeEvents). `node tooling/native-surface.mjs --record`'],
    } : {
      ok: [`${prev.nativeEvents.events.length} sự kiện (đo ở ${prev.nativeEvents.version ?? '?'}) · ${wired.length} đang cắm · ${n.empty.length} để trống`,
        ...n.wiredJudged.filter(e => led[e]?.state === 'co-viec').map(e => row(e, `việc đã LÀM — ô đang cắm (${led[e].why})`))],
      warn: [
        ...n.hasWork.map(e => row(e, led[e]?.why ?? '')),
        ...n.wiredJudged.filter(e => led[e]?.state === 'khong-co-viec')
          .map(e => row(e, 'sổ ghi `khong-co-viec` nhưng ô này ĐANG CẮM — một trong hai sai')),
        ...n.stale.map(e => row(e, `phán đoán \`${led[e]?.state}\` về sự kiện binary KHÔNG còn có — \`--slot ${e} chua-xet\``)),
      ],
      na: n.noWork.map(e => row(e, led[e]?.why ?? '')),
      unknown: n.unexamined.map(e => row(e, 'chưa ai hỏi ô này có việc cho harness không')),
    });
    console.log('  Xét một ô: `node tooling/rituals.mjs --slot <Event> khong-co-viec "<vì sao không>"`\n');
    process.exit(0);
  }

  const results = evaluate(collect());

  if (JSONOUT) { console.log(JSON.stringify(results, null, 2)); process.exit(0); }

  const due = results.filter(r => r.state === 'due');
  const unknown = results.filter(r => r.state === '?');
  const na = results.filter(r => r.state === 'n/a');

  if (!ALL) {
    // Bản NGẮN cho SessionStart: chỉ việc tới hạn. Không có gì tới hạn thì IM LẶNG —
    // một dòng "không có gì cần làm" mỗi phiên là chính loại nhiễu file này thay thế.
    //
    // `n/a` KHÔNG in ở đây, cố ý. Nó là câu trả lời đã có ("không áp dụng"), không phải một
    // việc — và bản ngắn này chỉ được dùng cho thứ đòi hành động. Nó vẫn hiện đầy đủ ở `--all`.
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
    na: na.map(r => `${r.cmd.padEnd(20)} ${r.why}`),
    ok: results.filter(r => r.state === 'ok').map(r => `${r.cmd.padEnd(20)} ${r.why}`),
  });
  console.log('  Mọi năng lực của harness đều nằm ở bảng trên — không có cái nào chỉ tồn tại');
  console.log('  trong tài liệu. Mục ĐỎ là việc đang tới hạn, kèm số đo để bạn tự kiểm.\n');
  process.exit(0);
}
