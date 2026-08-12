# fixlog: một CỜ không phải là NỘI DUNG (v2.72.0)

issue: **KHÔNG CÓ** — bug được tìm bằng cách tái hiện một mục fixlog cũ, không qua issue.
owner: @thiengthb · branch: `fix/fixlog-co-la-noi-dung` · worktree: gốc repo · platforms: n/a

<!--
  Neo chống trôi cho file này là ba lệnh, không phải văn xuôi bên dưới:
    node tooling/test-hooks.mjs        → 272/272, sàn 272
    node tooling/fixlog.mjs --top      → 17 mục · 1 chưa xử
    node tooling/rituals.mjs --all     → /harness-retro OK
-->

## 2026-08-13 — phiên bắt đầu bằng một lần pull

Máy này đứng ở `8c51191` (v2.12.0) từ 2026-08-05. `origin/main` đã đi tiếp **100 commit**
tới `98ffbf3` (v2.71.0). Nhánh `chore/vong-hoc-2026-W32` đã được hấp thụ hết vào main từ máy
khác — kiểm bằng `git diff origin/main HEAD` trên cả 8 file: 3 file giống hệt, 5 file khác vì
**upstream đi xa hơn**, không phải vì local có gì riêng.

| file | local (2026-08-05) | origin/main |
|---|---|---|
| `evals/tasks/0005` | `maxTurns: 6` — số ĐOÁN | `maxTurns: 45` — số ĐO, lượt chạy 08-10 (#144) |
| `claude-code-baseline` | rà 2.1.222 | rà 2.1.228 (#189) |
| `knowledge/index.json` | 4 bài học | 8 bài học |

Nên nhánh cũ bị bỏ, không rebase. Nó không mang gì cả.

## ĐÃ LÀM

### 1. Bug: `fixlog.mjs --help` ghi một dòng rác vào sổ

Ghi sổ **2026-08-05** (mục 12/16). Tái hiện **y nguyên 2026-08-13** trên v2.71.0 — 59 minor
version ở giữa. Tôi tái hiện nó **không cố ý**: gõ `--help` để đọc cách dùng, và nhận
`✓ đã ghi (tổng 17)`.

Sửa (v2.72.0, `tooling/fixlog.mjs`): chặn theo **HÌNH DẠNG** — `args[0]` mở đầu bằng `-` mà
không khớp cờ nào thì KÊU ở stderr và exit 1. Thêm `--help`/`-h` (exit 0, im). Cửa thoát
POSIX `--` cho nội dung thật sự mở đầu bằng dấu gạch.

Chặn theo hình dạng chứ không theo tên cờ, vì thứ làm bẩn sổ là **nhánh mặc định**, không
phải chữ `help`: `--to` (gõ hụt `--top`), `--lst`, `--closs` đều hạ cánh vào đúng chỗ đó.

Cửa thoát `--` không phải cho đủ lệ: sổ này đầy dòng nói về `--force` / `--auto-approve`, và
mục mô tả chính bug này mở đầu bằng `--help`. Guard không có đường thoả là guard bắn nhầm
(`L0002`).

**Bằng chứng.** `test-hooks` ⑩, bốn chiều. Sàn **271 → 272**. Suite: `272/272 pass, exit 0`.
Và ca test đã bị **mutation-test**: đặt bản vá sau một cờ `MUTANT`, chạy lại ⇒ **6/6 khẳng
định đỏ, suite exit 1**. Nó không phải một ca trang trí chưa từng đỏ.

### 1b. Bug thứ hai, tìm được vì bug thứ nhất bắt tôi nhìn kỹ sổ

Sau khi rà xong, `rituals` nói **2/17 mục chưa xử** còn `fixlog --top` hiện **1**. Hai công cụ
hai con số cho cùng câu hỏi — đúng lớp lỗi tôi vừa đóng ở mục #9 vài phút trước.

Gốc: `fixlog.mjs:91` `sorted.slice(0, 15)`. Trần 15 nhóm, sắp theo tần suất, **vứt phần dư
không nói gì**. Sổ có 17 nhóm mà 14 đã đóng; mọi nhóm đều `1×` nên thứ tự rơi về thứ tự chèn,
và hai nhóm bị đánh rơi là hai nhóm **mới nhất** — tức đúng hai mục chưa ai xử. Trần cắt đúng
cái đang là việc và giữ lại cái đã xong.

Sửa: nhóm CHƯA XỬ sắp trước nhóm đã xử; phần bị trần cắt tự khai kèm số chưa xử. `test-hooks`
⑪, sàn **272 → 273**, mutation-test cho ra đúng câu *"trần của --top GIẤU 4/4 nhóm CHƯA XỬ"*.

Ghi lại một chi tiết vì nó tốn của tôi một lượt: ca ⑪ đỏ lần đầu vì **test sai, không phải
code sai** — needle `nhomdadong1` khớp cả `nhomdadong10..15` nên `--close` từ chối vì mơ hồ và
fixture dựng ra không phải hình dạng cần đo. Ca test giờ **khẳng định fixture** trước khi đo.

### 2. Rà 16 mục fixlog của máy này với code upstream — 15 đóng

Sổ fixlog **không đi theo repo** (`.claude/telemetry/` bị gitignore, cố ý). Nên sổ ở máy này
đóng băng ở v2.12.0 trong khi upstream đã sửa gần hết. `/harness-retro` đỏ vì một lý do
không còn thật.

Mỗi mục đóng kèm **đường dẫn tới đoạn code xử nó**, không kèm câu "đã kiểm tra":

| mục | bằng chứng |
|---|---|
| sự kiện hook không tới consumer | `harness-migrations/008` + `011` |
| doctor đo `!manifest.profile` | `harness-doctor.mjs:74` `repoRole()` · `:123` `declaredCommands()` |
| `git add -A` cuốn file phiên khác | `precommit-scan.mjs:117-135` (nêu đúng ca 08-05) |
| mẫu số test-hooks trôi 75/72 | `test-hooks.mjs:5189` `ran + skipped + naCount` |
| sàn không cộng ca bỏ qua | rổ thứ ba `naEntries`/`declareNa` (`:372`) |
| byte NUL trong file nguồn | `precommit-scan.mjs:67-72` (nêu đúng ca 08-05) |
| `MECHANISM_PATHS` neo lệch | `upgrade.mjs:140` import từ lib — một neo |
| quét import neo vào comment | `codeOnly()` `lib:717` + `codeScanDesync` |
| ba công cụ ba con số về pack | cả ba nói 0, neo `knowledge/DECISIONS.log` |
| dcg khớp văn bản thô | `dcg.mjs:18-40` — `program:` + cắt theo `[|;&]` + bóc heredoc |
| session-start không hỏi `repoRole()` | `session-start.mjs:261` — **chạy lại hook, không in nữa** |
| `evals/run.mjs` chỉ hai trạng thái | `run.mjs:79` ba trạng thái + `infraFailure`/`budgetExhausted` |
| doctor tố bia mộ `/whats-new` | sổ quyết định `harness-doctor.mjs:929` |
| `/handoff` đo dấu proxy | `rituals.mjs:770` đo số file cây làm việc bẩn |

`/harness-retro`: **FAIL → OK** (1/16 chưa xử).

Và cơ chế vừa đóng tự chứng minh ngay trong phiên: `/handoff` **đỏ đúng lúc** tôi có 4 file
chưa commit — nó đo trạng thái cây, không suy từ tên nhánh nữa.

## CÒN MỞ — 1 mục, có lý do

**`/harness-retro` và `/knowledge-promote` vẫn không thể cùng xanh.** `rituals.mjs:244` vẫn
đo `learningsNewerThanLessons > 0`. Retro *bắt buộc* ghi file vào `.claude/learnings/`, nên
chạy đúng hai nghi thức theo đúng thứ tự vẫn kết thúc bằng đèn đỏ. Phép đo gộp *"có bài học
tồn tại"* với *"có bài học SẴN SÀNG promote"* — mà retro còn ghi cả những mục **cố ý KHÔNG
promote** (kết quả xét cắt).

Không sửa trong PR này: một PR một mục đích, và đây là thay đổi ngữ nghĩa của nghi thức, thuộc
`/harness-propose`.

## PHÁT HIỆN MỚI của phiên (đã vào sổ, chưa sửa)

`rituals.mjs:475` in `Claude Code đã đổi 2.1.228 → 2.1.222: đọc changelog bản mới`. Hai con
số đều đúng — nhưng **2.1.222 cũ hơn** bản đã rà, nên không có changelog nào để đọc và việc
đúng là KHÔNG LÀM GÌ.

Gốc rễ: `reviewedVersion` là sự thật **của repo** (máy khác ghi, được commit), còn version
đang chạy là sự thật **của máy này**. Hai số lệch được theo **cả hai chiều**, mà thông báo chỉ
viết cho một chiều.

Cùng lớp lỗi với `#194` (*check tag chỉ hỏi một chiều*) ⇒ **lần thứ 2**, tức đã quá ngưỡng
`≥2` của AGENTS.md ⇒ `/harness-propose`, không sửa tay.

## KHÔNG PHẢI BUG — đừng đi tìm lại

- **`CLAUDE_CODE_EXECPATH` trỏ 2.1.222 trong khi `claude --version` nói 2.1.229.** Cả hai
  đúng. Symlink `~/.local/bin/claude` được cập nhật lúc `2026-08-13 06:02` (đầu phiên này);
  tiến trình đang chạy vẫn là bản cũ, bản mới có hiệu lực lần khởi động sau. Harness đo đúng
  cái nó nói nó đo. Tôi đã nghi đây là bug và **đo lại thì sai** — ghi ra đây để người sau
  không mất lượt nữa.
- **`test-hooks.mjs` làm bẩn `gate-fails.log`.** Cũng sai. Đo: 67 dòng trước, 67 dòng sau.
  Dòng mới lúc 06:05 đến từ `ConfigChange` khi `git merge` viết lại `.claude/settings.json`.
- **Gate `preMerge` toàn `WARN … BỎ QUA`.** Placeholder ĐÚNG ở repo template — quyết định đã
  chốt ở W32, `ci.yml` mang `HARNESS_ALLOW_SKIPPED_GATES` kèm lý do.
