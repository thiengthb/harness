# ADR 0001 — Harness baseline

- **Trạng thái**: Accepted
- **Ngày**: 2026-08-03
- **last-verified**: 2026-08-03

## Context

Nhiều người + nhiều session agent song song trên một repo, trên nhiều hệ điều hành.
Cần một lớp harness: (a) không để agent lan man khi codebase phình to, (b) cho phép
session liên thông và song song, (c) chạy được trên mọi máy của team, (d) tích luỹ
trí tuệ mang được sang project khác.

## Decision

### 1. Harness là một SẢN PHẨM CÓ NGƯỜI DÙNG

Nó cần chủ (DRI), version, test, thông báo khi đổi, và phải chạy được trên máy của
mọi người — kể cả người dùng Windows mà bạn quên mất.

### 2. Stack-agnostic qua `harness.config.json`

Mọi thứ đặc thù stack khai ở **một file**. Hook và tooling đọc từ đó. Lệnh chưa
khai → bị bỏ qua, không fail. Cho phép áp template lên bất kỳ codebase nào mà
không sửa một dòng hook.

### 3. Mọi script harness viết bằng Node `.mjs` — Parity Contract

Hook bash chỉ chạy trên macOS/Linux/WSL. Trong team trộn OS, đó là canh bạc:
DRI thường dùng macOS, viết hook bằng bash, và harness của team **thực chất không
tồn tại** với người dùng Windows. Người đó lặng lẽ tắt hook, và từ đó team có hai chuẩn.

Ngoại lệ duy nhất: `.githooks/pre-commit` phải là `sh` vì git chạy hook qua sh
trên mọi nền tảng — nhưng toàn bộ logic nằm trong `.mjs` mà nó gọi.

### 4. Mọi file nhiều người cùng ghi phải được chẻ theo người hoặc theo issue

`claude-progress.txt` và `feature_list.json` một-file-cho-cả-repo là thiết kế
**single-writer**: hoàn hảo khi làm một mình, là máy sinh conflict khi có 4 người.
→ `docs/progress/<issue>.md`, `features/<id>.json`, `.claude/learnings/<tuần>-<tên>.md`.

### 5. Cưỡng chế bằng máy, không bằng thoả thuận

CODEOWNERS · branch protection · DCG · `protect-harness` · CI matrix 3 OS ·
`test-hooks.mjs`. Trong team, mọi thứ chỉ tồn tại dưới dạng lời nhắc sẽ bị bỏ qua
bởi người đang gấp — và người đang gấp luôn tồn tại.

### 6. Agent ĐỀ XUẤT, người PROMOTE

Agent không sửa được cấu hình harness của chính nó. Nó ghi vào `.claude/learnings/`.
DRI promote. Hai lý do: bảo mật (tự leo thang quyền) và lòng tin trong đội.

### 7. Trí tuệ có scope và mang đi được

Mỗi bài học có `scope: universal | stack:* | project` và `exit-condition` bắt buộc.
`export`/`import` mang `universal` + `stack:*` sang repo khác. Import **không bao giờ**
tự ghi vào `.claude/` — nó là supply-chain vào chính lớp kiểm soát.

## Consequences

**Được:**
- Áp lên project mới bằng cách sửa một file config
- Conflict môi trường gần như biến mất (Parity Contract + CI matrix)
- Trí tuệ tích luỹ chuyển được sang model mới, tool khác, project khác
- Harness có thể **co lại** (điều kiện thoát bắt buộc + `harness-size.mjs`)

**Mất:**
- Node `.mjs` khởi động ~50–80ms/hook. Chấp nhận được cho hook không chạy quá dày.
- Một lớp gián tiếp (`harness.config.json`) giữa hook và stack.
- Đòi hỏi một DRI thật. Harness không có chủ sẽ mục trong ~6 tuần.

## Alternatives rejected

| Phương án | Vì sao loại |
|---|---|
| Hook bằng bash + PowerShell song song | hai bản hiện thực = hai chỗ để bug |
| Hardcode `pnpm`/`turbo` vào hook | không áp được lên project khác stack |
| Cho agent tự sửa harness (self-improving loop) | tự leo thang quyền; cần eval + gate + ngân sách trước |
| Single-branch + guards (thay worktree) | giả định agent "fungible"; team người thật vốn đã chuyên biệt |
| Một `feature_list.json` chung | single-writer, conflict mỗi PR |

## Điều kiện xét lại

Xét lại ADR này khi: đổi model chính, team vượt 10 người, hoặc khi
`node tooling/harness-size.mjs` cho thấy harness phình 2 quý liên tiếp.
