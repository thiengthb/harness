# Runbooks

Quy trình vận hành cho lúc **có sự cố** — viết khi bình tĩnh, đọc khi đang cháy.

## Vì sao runbook quan trọng gấp đôi khi có agent

Agent **đọc được** runbook và thực thi phần lớn nó. Một runbook tốt biến "gọi người
biết việc" thành "chạy skill". Nhưng chỉ khi nó **cụ thể**: runbook nói "kiểm tra
database" thì vô dụng; runbook nói lệnh gì, đọc cột nào, ngưỡng bao nhiêu thì dùng được.

## Khuôn

```markdown
---
last-verified: YYYY-MM-DD
severity: sev1 | sev2 | sev3
owner: "@___"
---

# <Triệu chứng người dùng nhìn thấy>

<!-- Đặt tên theo TRIỆU CHỨNG, không theo nguyên nhân.
     Lúc 3h sáng bạn biết triệu chứng, chưa biết nguyên nhân. -->

## Xác nhận đúng sự cố này
<lệnh cụ thể + output mong đợi>

## Giảm thiểu NGAY (trước khi tìm nguyên nhân)
<lệnh cụ thể. Rollback/feature flag/scale trước, điều tra sau.>

## Chẩn đoán
| Kiểm | Lệnh | Nghĩa là |
|---|---|---|

## Khắc phục
<từng bước, có lệnh>

## Leo thang
Ai, khi nào, qua kênh nào.

## Agent được phép làm gì
- [ ] chạy chẩn đoán (read-only)     ← thường CÓ
- [ ] áp dụng giảm thiểu              ← chỉ trên staging
- [ ] chạm production                 ← KHÔNG. Người bấm nút.
```

## Nên có

- Deploy hỏng / cần rollback
- Database chậm hoặc hết kết nối
- Rate limit / quota cạn (kể cả quota của agent)
- Secret bị lộ — quy trình xoay vòng
- Khôi phục từ backup (**test định kỳ**, đừng chỉ viết)
- Main bị vỡ (merge queue phải làm điều này thành 0 — nếu xảy ra, đó là sự cố của harness)

## Luật

**`last-verified` quá `limits.docStaleDays` ngày → verify TRƯỚC khi tin.**
Runbook sai trong lúc sự cố tệ hơn không có runbook: nó làm bạn tự tin sai chỗ.

Sau mỗi sự cố thật: cập nhật runbook **trong cùng tuần**, và cho agent viết bản
nháp post-mortem từ timeline.
