# vòng-học-2026-W32 — chạy ba nghi thức tới hạn trên nguyên liệu thật

issue: **KHÔNG CÓ** — đây là phiên NGHI THỨC, không phải issue sản phẩm.
owner: @thiengthb · branch: `chore/vong-hoc-2026-W32` · worktree: gốc repo · platforms: n/a

<!--
  `_TEMPLATE.md` đòi `issue:` là URL BẮT BUỘC, và lý do nó đưa ra là đúng: mọi mục trong
  file này là DIỄN GIẢI của agent, nên cần một neo bất biến ở ngoài để đối chiếu, nếu không
  file sẽ tự đóng lại bằng cách so công việc với chính cái đã trôi.

  Ở phiên này không có issue, và bịa một URL còn tệ hơn để trống. Neo chống trôi ở đây là
  thứ khác, và nó KIỂM ĐƯỢC BẰNG MÁY — đó là điều kiện template thật sự muốn:
    · `node tooling/rituals.mjs --all`      ← nghi thức nào đã đóng, nghi thức nào chưa
    · `node tooling/fixlog.mjs --top`       ← 16 mục, đếm được, không phải ký ức
    · `node evals/run.mjs`                  ← +10pp, có baseline để so
  Đối chiếu công việc với BA LỆNH này, đừng đối chiếu với văn xuôi bên dưới.
-->

## Trước mỗi lô công việc

1. **Tiền đề còn đúng không?** File này là ảnh chụp `615f98c`. Chạy ba lệnh ở khối trên trước
   khi tin bất cứ dòng nào bên dưới.
2. **Đã xây rồi chưa?** Có, ba lần trong phiên này — xem "BÀI HỌC ĐẮT NHẤT".
3. **Số liệu là suy ra hay đoán?** Mọi số dưới đây là output lệnh, không suy diễn.
4. **Đo ở cây nào?** Cây gốc `/home/thien/projects/harness`, không worktree.

---

## 2026-08-05 (session 1, thien + Claude Opus 5)

### ĐÃ LÀM

- **`rituals.mjs --reviewed-claude-code` — ĐÓNG.** Rà changelog Claude Code 2.1.222 với đúng
  một câu hỏi. Kết luận: không mục nào làm cơ chế harness thành thừa. Ba mục chạm lớp đang
  gánh việc, ghi ở `.claude/claude-code-baseline.json`.
- **`/knowledge-promote` — ĐÓNG.** `01414b5`: L0004 (gác hỏng thì CHẶN) + gate
  `evals/tasks/0005` + đăng ký SEED trong `apply-to.mjs`. Export: 4 bài học · 17 artifact ·
  4 gate.
- **`/harness-retro` — chạy xong, ghi `615f98c`.** Bốn đề xuất, không cái nào thêm cơ chế:
  (1) kênh đi LÊN gửi fixlog nhưng không có bên nhận — 20 mục từ 3 repo vô hình;
  (2) `repoRole()` có từ v2.7.7 mà công cụ vẫn hỏi câu sai — 4 lần, 3 repo;
  (3) so khớp trên văn bản thô, không phân biệt tầng cú pháp — 4 cơ chế cùng gốc;
  (4) `evals/run.mjs` chỉ có hai trạng thái nên "chưa đo" bị đếm thành FAIL.
  Đề xuất cắt: `AGENTS.md` §"Nghi thức: đừng nhớ, hãy đọc" (~8 dòng → 2).
- **Ghi 6 mục fixlog mới** (10 → 16). Không đóng mục nào: cả 6 mới ở dạng đề xuất, chưa có
  cơ chế. Đóng chúng lúc này là đúng loại tự-khen mà `evals/tasks/0003` tồn tại để bắt.

### TIẾP THEO — lệnh cụ thể, theo thứ tự

```
git fetch && git checkout chore/vong-hoc-2026-W32
node tooling/rituals.mjs --all
node tooling/knowledge/export.mjs          # dựng lại .harness-pack/ (gitignore, không đi theo máy)
/pre-merge                                 # skill khoá model — NGƯỜI gõ
gh pr create                               # 198 dòng, dưới warn 800
```

Rồi `/harness-propose` cho 5 mục, **ưu tiên theo thứ tự này**:

1. **`budget.monthlyUsdCap = 0`** ← làm trước. `budget-alarm.log` ghi 3 lần `rate_limit`
   trong 80 phút sáng 2026-08-05 (03:46 · 04:14 · 05:06). Lớp kinh tế là lớp duy nhất gây
   thiệt hại tài chính trực tiếp và nó đang không có cap.
2. Nhóm "đo bằng DẤU PROXY thay vì bằng KẾT QUẢ" — **5 lần, nhóm lớn nhất, đã quá ngưỡng ≥2**:
   `session-start.mjs:203` (hỏi `commands.*`, không hỏi `repoRole()`) ·
   `harness-doctor` (`!manifest.profile` thay vì `commands.verify`) ·
   `/handoff` (hỏi "có ở trong issue?" thay vì "có state máy này phiên sau không có?") ·
   `session-start.mjs:47` (nhật ký chỉ in khi suy được issue từ tên nhánh ⇒ nhánh `chore/`
   không bao giờ thấy file NÀY) · `harness-doctor` tố bia mộ là tham chiếu chết.
3. Đề xuất (1) của retro — kênh đi lên không có bên nhận.
4. Đề xuất (3) — `dcg` khớp văn bản thô.
5. Cắt `AGENTS.md` §Nghi thức.

### ĐANG VƯỚNG

- **Bước 8 của `/knowledge-promote` không hoàn thành được.** `knowledge.packName` vẫn là
  `CHANGEME-org-harness-pack`, `upstream: ""`, và `.harness-pack/` bị gitignore ở repo này
  (`.gitignore:7`) — trong khi `import.mjs:46` khi nhận git-url tìm `pack.json` ở gốc clone
  hoặc `<repo>/.harness-pack`. Nên L0004 export ra đĩa nhưng **chưa repo nào lấy được qua
  đường git-url**. Đường local (`import.mjs ../repo/.harness-pack`) thì chạy.
  Đã thử: đọc `import.mjs`, `export.mjs`, `.gitignore`. Chưa thử: dựng repo pack trung tâm —
  đó là quyết định của DRI, không phải của agent.
- **`/harness-retro` và `/knowledge-promote` không thể cùng xanh.** Retro *bắt buộc* ghi file
  vào `.claude/learnings/`, mà `/knowledge-promote` đo bằng mtime "có learnings nào mới hơn
  lesson mới nhất". Chạy đúng hai nghi thức theo đúng thứ tự thì kết thúc bằng đèn đỏ y như
  lúc bắt đầu.

### QUYẾT ĐỊNH đã chốt

- **KHÔNG điền `commands.verify/test` vào `harness.config.json`** dù SessionStart gọi đó là
  "việc số 1". Repo này là `template`; file đó là `SEED` của `apply-to.mjs` nên điền vào sẽ
  rò sang mọi consumer tương lai, và `ci.yml` đã mang `HARNESS_ALLOW_SKIPPED_GATES: '1'` kèm
  lý do viết ra giấy. Cảnh báo đó là bug, không phải việc.
- **KHÔNG cắt hai chỗ nhắc `/whats-new`** dù `harness-doctor` gọi là "tham chiếu chết".
  Chúng chính là bia mộ (`TOMBSTONES` ở `lib/harness.mjs:593` + `harness-migrations/010`).
  Bia mộ bắt buộc gọi tên thứ không còn tồn tại — đó là việc của nó.
- **KHÔNG đóng mục fixlog nào** khi chưa có cơ chế. Xem trên.

### BÀI HỌC ĐẮT NHẤT CỦA PHIÊN — đọc mục này nếu chỉ đọc một mục

Ba lần trong một phiên, tôi định "sửa" một thứ mà hoá ra là **placeholder đúng hoặc cơ chế
load-bearing**, và cả ba lần cái đẩy tôi đi là **output của chính harness**:

| harness nói | thực tế |
|---|---|
| `gate đang rỗng — việc số 1 cần làm` | placeholder ĐÚNG ở repo template; sửa là rò sang consumer |
| `tham chiếu chết /whats-new` | bia mộ load-bearing |
| `/handoff OK — không có gì để giao lại` | có 2 commit chưa push + người dùng sắp sang máy khác |

**Luật rút ra:** trong repo này, một cảnh báo của harness là **giả thuyết**, không phải việc.
Kiểm `repoRole()` và đọc comment quanh chỗ bị tố **trước** khi sửa. Repo này viết comment rất
dài ngay tại chỗ nguy hiểm — đó là thiết kế, và bỏ qua nó là cách nhanh nhất để phá một cơ chế
đang làm việc.
