# Branch protection & merge queue

> Nếu bạn chỉ làm **một** thứ trong toàn bộ harness này, làm cái này.

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
      guards          (hook tests, feature integrity, PR size, lockfile)
      verify          (gen-clean + typecheck TOÀN REPO + lint + test + build)
      e2e
      security
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
