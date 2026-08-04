# Branch protection & merge queue

> Nếu bạn chỉ làm **một** thứ trong toàn bộ harness này, làm cái này.

## Trạng thái repo TEMPLATE này (áp 2026-08-04, đo bằng API)

Nói ra vì tài liệu này tồn tại từ v1.0 mà `main` **chưa từng được bảo vệ** cho tới
2026-08-04 — `gh api …/branches/main/protection` trả `404 Branch not protected`. Trong
suốt thời gian đó, mọi thứ trong harness (8 CI check, ngưỡng kích cỡ PR, parity 3 OS)
là **tư vấn**: một `git push origin main` bỏ qua sạch. Một tài liệu mô tả cấu hình
không phải một cấu hình.

```bash
# Cấu hình ĐANG áp — tái lập được, không phải mô tả
gh api -X PUT repos/<owner>/<repo>/branches/main/protection --input - <<'JSON'
{ "required_status_checks": { "strict": true,
    "contexts": ["guards","verify","security","no-bash-in-harness",
                 "parity (ubuntu-latest)","parity (macos-latest)","parity (windows-latest)"] },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true }
JSON
```

**`enforce_admins: true` là dòng quan trọng nhất, và nó dễ bị bỏ.** Repo một người thì
collaborator duy nhất **là admin**; để `false` nghĩa là luật miễn trừ đúng người duy
nhất push được — bảo vệ **không ai**. Bật lên **không** khoá bạn: vì
`required_pull_request_reviews: null`, bạn vẫn tự merge PR của mình được, chỉ là mọi
thứ buộc đi qua PR có check xanh. Cần khẩn cấp thì tắt protection — một hành động
tường minh và có log, không phải một lần lách im lặng.

`required_approvals` và merge queue **chưa bật ở đây**: repo đang có một người, và
"bắt buộc 1 approve" khi chỉ có một người nghĩa là mỗi lần merge đều phải dùng quyền
admin để bỏ qua — tức là dạy chính mình rằng gate là thứ để lách. **Bật cả hai ngay
khi có người thứ hai** (khối cấu hình bên dưới).

> ⚠️ **`--dry-run` KHÔNG kiểm được luật này.** `git push --dry-run` không chạy
> pre-receive hook của GitHub, nên nó báo "thành công" cho một push mà server sẽ từ
> chối. Kiểm bằng API (`gh api …/branches/main/protection`), đừng kiểm bằng dry-run.

## Vì sao merge queue là cơ chế quan trọng nhất

```
KHÔNG có merge queue:
  PR A xanh (CI chạy trên main@100)  ┐
  PR B xanh (CI chạy trên main@100)  ┴→ merge cả hai → main@102 VỠ

CÓ merge queue:
  PR A vào queue → rebuild trên main@100 → xanh → merge → main@101
  PR B vào queue → rebuild trên main@101 → ĐỎ  → bị đẩy ra, tác giả sửa
                                                 → main KHÔNG BAO GIỜ vỡ
```

Đây là **cơ chế duy nhất bắt được conflict ngữ nghĩa một cách hệ thống** —
loại conflict mà git merge sạch nhưng build vỡ. Nó tự động hoá đúng cái mà con
người không làm nổi khi có 20 PR mở.

## Cấu hình cho `main`

```
☑ Require a pull request before merging
☑ Require approvals: 1        (2 cho path CODEOWNERS nặng: harness, contracts)
☑ Require review from Code Owners
☑ Dismiss stale approvals when new commits are pushed
☑ Require status checks to pass:
      guards          (hook tests, migration tests, feature integrity, PR size, lockfile)
      verify          (MỘT lệnh: node tooling/gates.mjs --stage preMerge
                       → gen-clean · typecheck TOÀN REPO · lint · test · build · depcruise · e2e)
      security        (quét secret toàn bộ file được track + SCA)
      harness-parity  (khi PR chạm .claude/ hoặc tooling/)
☑ Require branches to be up to date before merging
☑ Require merge queue          ← ★
☑ Require linear history
☐ Allow force pushes           ← LUÔN TẮT
☐ Allow deletions
```

## Bốn tinh chỉnh cho team dùng agent

**1. Merge method: SQUASH.**
Agent tạo nhiều commit lộn xộn ("fix", "wip", "fix lint"). Squash làm `main` đọc được.
Đánh đổi: mất lịch sử chi tiết trong nhánh — chấp nhận được.

**2. Auto-merge BẬT, nhưng chỉ sau khi có approve.**
Agent mở PR → CI xanh → có approve → tự vào queue → tự merge.
Người chỉ làm **một** việc: approve. Đây là chỗ tiết kiệm thời gian lớn nhất.

**3. Queue concurrency phải khớp CI capacity.**
Queue rebuild mỗi PR → 20 PR trong queue = 20 lần chạy CI.
Đo trước: `(thời gian CI) × (PR/ngày) ≤ capacity`? Nếu CI chậm, queue thành cổ chai mới.

**4. "Ai đang giữ queue" phải nhìn thấy được.**
Dán link queue vào channel team. **Một PR đỏ chặn queue là sự cố của cả team**,
không phải chuyện riêng của tác giả.

## Quy ước đặt tên nhánh

```
<type>/<issue>-<slug>            người làm chính
<type>/<issue>-<slug>--agent     agent chạy tự trị
auto/<mô-tả>                     agent tự trị theo lịch (cron/CI)
```

Đánh dấu `--agent` vì reviewer cần biết PR này **không có người đọc từng dòng
trước khi mở**. Đây là thông tin để hiệu chỉnh độ sâu review.

Nhánh `auto/*`: agent tự trị **chỉ** được làm ở đây, **không bao giờ** push lên
nhánh người khác, và kết quả **ra PR, không ra commit trực tiếp**.

## Attribution — vấn đề mới

```
feat(billing): thêm invoice draft và persist qua SecureStorage port

Refs: ABC-142
Co-Authored-By: Claude <noreply@anthropic.com>
Reviewed-By: lan <lan@example.com>
```

Sáu tháng sau, khi bạn muốn biết *"code do agent viết có tỉ lệ bug cao hơn không"*,
bạn cần dữ liệu này. Không có trailer thì không có phân tích. Tốn 0 công
(đặt vào `.gitmessage`) và mở ra một câu hỏi bạn **sẽ** muốn trả lời.

Commit do CI/agent tạo phải có **danh tính riêng** (bot account hoặc key riêng).
Nếu commit của bot mang tên bạn, mọi phân tích "code agent vs code người" sau này
đều vô nghĩa.
