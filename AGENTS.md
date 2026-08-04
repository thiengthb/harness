# AGENTS.md

> Hợp đồng làm việc trong repo này, cho **cả người và agent**.
> Đây là file duy nhất bạn phải đọc ngày đầu. Mọi thứ khác tự kích hoạt khi cần.
> Đổi file này = PR + 1 approve. Chủ: xem `.github/CODEOWNERS`.
>
> **Giữ dưới ~150 dòng.** Dài hơn nghĩa là có thứ thuộc về `.claude/rules/` (theo path),
> một skill (kiến thức thỉnh thoảng cần), hoặc một hook (luật bắt buộc).

## Project

<!-- 2–3 câu. Sản phẩm làm gì, cho ai. Không mô tả cây thư mục — agent tự thấy. -->
CHANGEME.

Cấu hình harness: `harness.config.json` — mọi lệnh, ngưỡng, vùng nóng khai ở đó.

## Lệnh

<!-- Đặt LỆNH TRƯỚC VĂN XUÔI. Đây là thứ agent dùng nhiều nhất. -->

| Việc | Lệnh |
|---|---|
| Dựng môi trường (chạy được mọi OS) | `node tooling/init.mjs` |
| Verify toàn bộ | CHANGEME |
| Sinh code từ schema | CHANGEME |
| Test một file | CHANGEME |
| Chạy app | CHANGEME |
| Chạy gate (stop / subagent / preMerge) | `node tooling/gates.mjs --stage <stage>` |
| Xem gate nào ĐANG THẬT SỰ chạy + độ trễ | `node tooling/gates.mjs --list --timing` |
| Kiểm sức khoẻ lớp harness | `node tooling/harness-doctor.mjs` |

## Gotchas

<!--
  PHẦN GIÁ TRỊ NHẤT CỦA FILE NÀY. Chỉ giữ thứ Claude KHÔNG suy ra được từ repo.
  Xoá mọi dòng mà agent tự đọc code là biết. Xoá mọi "persona".
  Xoá mọi negative constraint không thuộc 3 nhóm nguy hiểm (production, secret,
  migration đã merge) — chỉ thị xung đột làm model tốn năng lực dàn hoà trước
  khi làm việc thật.
-->

- CHANGEME — ví dụ: `pnpm dev` không chạy được nếu chưa `pnpm db:up`; lỗi hiện ra là ECONNREFUSED ở port 5432, không phải lỗi code.
- CHANGEME — ví dụ: số tiền là integer cents ở mọi nơi. Float ở boundary API là bug, không phải style.

## Làm việc trong repo dùng chung (bắt buộc)

- Bắt đầu mọi session: `pwd`, `git branch --show-current`, `git log --oneline -10 origin/main`.
  SessionStart hook in sẵn — **đọc nó**.
- **Một issue = một nhánh = một worktree.** Không làm 2 issue trong một worktree.
- Trước khi sửa file trong **vùng nóng** (xem `harness.config.json → paths.hot`):
  kiểm `gh pr list --state open`. Có chồng lấn → **báo người, đừng tự quyết**.
  (Reservation thì KHÔNG cần nhớ: SessionStart in ra, pre-commit chặn.)
- **KHÔNG sửa**: `.claude/settings.json`, `.claude/hooks/**`, `.mcp.json`, `AGENTS.md`, `harness.config.json`.
  Dùng `/harness-propose`. (Hook sẽ chặn — đó là cố ý.)
- **KHÔNG sửa** file feature của issue khác. **KHÔNG sửa** `features/_index.json`.
- **KHÔNG** push lên nhánh người khác. **KHÔNG** force push. **KHÔNG** rebase nhánh chung.
- Nhật ký vào `docs/progress/<issue>.md`, **không** vào một file chung.
- Bài học vào `.claude/learnings/<năm>-W<tuần>-<tên>.md` — một file của riêng bạn, không bao giờ conflict.
- Số session song song tối đa mỗi người: xem `harness.config.json → limits.maxSessionsPerPerson`.

## Verification (không thương lượng)

- **Default-FAIL.** Mọi tiêu chí bắt đầu là `false`. Agent không đổi được nếu chưa có bằng chứng.
- `evidence` bắt buộc khi `passes: true`: đường dẫn tới output test / CI job / screenshot thật.
  **"Tôi đã kiểm tra" KHÔNG phải bằng chứng.**
- Bắt buộc E2E thật (browser/device), không chỉ unit test + curl.
- Một feature chỉ DONE khi **mọi platform trong scope** pass. Ngoài scope ghi `"n/a"`, không ghi `true`.
- Ưu tiên **computational control** (typecheck, lint, test, grep rule) trước **inferential control** (LLM chấm).
  Mỗi lần định nhờ LLM chấm, hỏi trước: có biến thành check tất định được không?
- **Gate ở `Stop` phải chạy dưới 30 giây. Gate ở `SubagentStop` phải dưới 5 giây.**
  Đắt hơn thì đẩy xuống CI. Mỗi gate ở `SubagentStop` nhân với tối đa 16 agent song
  song. Đo: `node tooling/gates.mjs --list --timing`. Đây là chỉ số **"harness đang
  cản"** duy nhất đo trực tiếp được.

## Hai bộ nhớ, hai vai — một sự thật ở cả hai chỗ là một LỖI

- **Auto-memory** (`~/.claude/projects/*/memory/`): quan sát THÔ, máy-cục-bộ, được
  phép sai, **không bao giờ** là sự thật của đội, **không bao giờ** commit.
  Nó nạp 200 dòng đầu `MEMORY.md` MỖI phiên — đó là **chỉ thị thật**. Nếu nó mâu thuẫn
  với `knowledge/lessons/`, Claude được phép chọn tuỳ ý, và không gì báo cho bạn.
- **`knowledge/lessons/`**: quyết định ĐÃ QUA GATE (`occurrences ≥ 2` + `evals:`),
  mang đi được sang repo khác, review trong PR.
- Auto-memory là tầng **CAPTURE miễn phí** của vòng học: `/harness-retro` bước 1 đọc
  `MEMORY.md` như một **đầu vào**, không như thẩm quyền. Mục nào xuất hiện ở ≥2 máy
  → ứng viên promote.

## Git & PR

- Nhánh từ `origin/main` mới nhất. Tên: `<type>/<issue>-<slug>`, thêm `--agent` nếu agent chạy tự trị.
- **Một PR một mục đích.** Vượt ngưỡng ở `limits.prWarnLines` → chẻ hoặc nêu lý do trong PR.
- **Tuổi nhánh < 1 ngày.** Cửa sổ chồng lấn tỉ lệ với tuổi nhánh.
- Conventional Commits, kèm `Refs:` và `Co-Authored-By:` nếu agent viết phần lớn.
- Trước khi mở PR: chạy `/pre-merge`. Điền đầy đủ PR template, **đặc biệt mục Bằng chứng**.
- Đổi public surface (`paths.publicSurface`): liệt kê consumer + gắn label `breaking` + **sửa cùng PR**.
  Không bao giờ để consumer "sửa sau trong PR khác".
- Lockfile conflict: checkout một bên rồi chạy lại install. **Không merge tay.**
- Sau khi merge: xoá nhánh + worktree tương ứng.

## Đa hệ điều hành — Parity Contract

Mọi thứ trong harness của team **phải** chạy trên Ubuntu 22+, macOS 14+, Windows 11.

- Cơ chế không chạy được cả ba → **không được vào `.claude/`**. Nó thuộc `settings.local.json`.
- Mọi script harness viết bằng **Node (`.mjs`)**, không bash/PowerShell.
- `os.homedir()` · `os.tmpdir()` · `path.join()` — không bao giờ `$HOME`, `/tmp`, nối chuỗi `/`.
- CI test hook trên cả 3 OS. Hook fail trên một OS = hook bị revert.
- Thành viên Windows: **WSL2 là khuyến nghị mặc định**, repo để trong `~/dev/` (KHÔNG `/mnt/c`, KHÔNG OneDrive).

## Trước khi viết code mới

- Tìm trong repo trước (`rg`). Không tạo helper trùng chức năng đã có.
- Capability > ~200 dòng → chạy `/research-first` trước khi implement.
- **KHÔNG tự viết**: crypto, auth/session/OAuth, payment, date-time math, parser, rate limiter phân tán, i18n plural.
- Trước khi tin một tài liệu cũ hơn `limits.docStaleDays` ngày: **verify với code hiện tại**.

## Đọc thêm (chỉ khi cần, đừng đọc hôm nay)

| Bạn cần | Đọc |
|---|---|
| Áp harness lên project mới | `README.md` · `docs/ROADMAP-30D.md` |
| Hiểu vì sao có conflict lạ | `docs/CONFLICTS.md` |
| Quyết số session song song | `docs/WIP.md` |
| Cấu trúc code / ranh giới module | `docs/ARCHITECTURE.md` |
| Ngân sách, cap, CAPO | `docs/ECONOMICS.md` |
| Agent hỏng giữa chừng | `docs/RECOVERY.md` |
| Vai trò DRI, nhịp team | `docs/TEAM.md` |
| Nhiều repo cùng lúc | `docs/MULTI-PROJECT.md` |
| Có gì đó sai mà chưa gọi tên được | `docs/ANTI-PATTERNS.md` |
| Mang trí tuệ sang project khác | `knowledge/README.md` |

## Khi bạn học được điều gì

Agent lỗi cùng một kiểu **≥2 lần** → `/harness-propose`, không sửa tay lần nữa.
Bài học được promote sẽ vào `knowledge/lessons/` và **đi theo bạn sang project khác**.
Xem `knowledge/README.md`.
