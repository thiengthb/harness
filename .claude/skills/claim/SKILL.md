---
name: claim
description: Nhận một issue và dựng môi trường làm việc cách ly. Dùng khi bắt đầu
  một task mới trong repo dùng chung, khi được giao issue, hoặc khi không rõ nên
  làm gì tiếp theo.
allowed-tools: [Bash, Read, Write, Edit, Glob, Grep]
---

# Claim một issue

Mục đích: **phát hiện chồng lấn TRƯỚC khi làm**, không phải sau khi mở PR.

## 1. Định vị

```
pwd
git branch --show-current
git fetch origin && git log --oneline -10 origin/main
```

Đang ở nhánh `main`? → dừng, tạo nhánh trước khi sửa gì.

## 2. Kiểm Definition of Ready

Đọc issue. Đối chiếu `docs/DOR-DOD.md` §DoR. **Chưa Ready → DỪNG, báo lại, đừng đoán.**
Thiếu acceptance criteria verify được bằng máy là lý do đủ để từ chối claim.

## 3. Kiểm chồng lấn — bước không được bỏ

```
gh pr list --state open --json number,files,author,title
ls reservations/
```

Đối chiếu file dự kiến chạm với: (a) file trong các PR đang mở, (b) `paths.hot`
trong `harness.config.json`, (c) reservation còn hiệu lực.

**Nếu CÓ chồng lấn:** báo cáo cụ thể chồng ở file nào với ai, rồi đề xuất một trong ba:

| | Khi nào |
|---|---|
| (a) chọn issue khác | chồng nhiều, PR kia sắp merge |
| (b) đợi PR kia merge | chồng ở vùng nhỏ, PR kia < 1 ngày tuổi |
| (c) đặt chỗ + chỉ chạm phần không chồng | chồng ở một thư mục xác định được |

**KHÔNG tự quyết. Hỏi người.**

## 4. Dựng worktree cách ly

```
claude --worktree      # tên worktree = mã issue
```

Một issue = một nhánh = một worktree. Tên nhánh: `<type>/<issue>-<slug>`
(thêm `--agent` nếu bạn chạy tự trị — reviewer cần biết để hiệu chỉnh độ sâu review).

## 5. Đặt chỗ nếu chạm vùng nóng

Chỉ khi chạm `paths.hot`. Tạo `reservations/<DEV_ID>-<issue>.json`:

```json
{
  "owner": "<DEV_ID>",
  "session": "<tên-session>",
  "files": ["packages/contracts/src/billing.ts", "packages/core/src/features/billing/**"],
  "reason": "thêm InvoiceDraft schema",
  "expires": "<now + limits.reservationTtlHours giờ, ISO 8601 có timezone>"
}
```

TTL là chi tiết quyết định: nếu bạn crash, reservation tự hết hạn và người khác
đi tiếp được. Hard lock từ một agent đã chết thì cần người dọn.

## 6. Tạo nhật ký

`docs/progress/<issue>.md` từ `docs/progress/_TEMPLATE.md`. Điền header
(owner / branch / worktree / scope platform).

## 7. Dựng môi trường và BÁO CÁO TRẠNG THÁI

```
node tooling/init.mjs
```

Báo cáo trạng thái repo **TRƯỚC KHI SỬA GÌ**. Nếu smoke test đã đỏ từ đầu:
nói ra, đừng lặng lẽ sửa — có thể đó là việc của người khác.

## Xong bước này bạn phải có

- [ ] nhánh + worktree riêng, tên theo quy ước
- [ ] biết chắc không (hoặc biết rõ chỗ nào) chồng lấn với ai
- [ ] `docs/progress/<issue>.md` có header
- [ ] verify xanh trước khi bắt đầu
