---
name: handoff
description: Kết thúc session sạch và để lại trạng thái cho người/session tiếp theo.
  Dùng khi hết session, hết giờ, trước khi /clear, hoặc khi chuyển sang task khác.
allowed-tools: [Bash, Read, Write, Edit, Glob, Grep]
disable-model-invocation: true
---

# Handoff

Chữa bệnh "session sau không biết session trước làm gì" — và bệnh nguy hiểm hơn:
"session sau thấy có tiến độ rồi nên tự kết luận xong việc".

## 1. Verify

Chạy lệnh verify của repo. **KHÔNG handoff khi đang đỏ mà không ghi rõ đỏ ở đâu.**

## 2. Commit mọi thứ

Repo phải ở trạng thái **merge được vào main**, hoặc nói rõ là chưa và tại sao.
Đây là điều kiện bất biến quan trọng nhất của long-running work: nó biến
"8 giờ chạy" thành "40 lần chạy 12 phút, dừng được bất cứ lúc nào".

## 3. Cập nhật `features/<id>.json`

Chỉ `passes` và `evidence`. Evidence phải trỏ tới output **THẬT**:
đường dẫn file, CI job URL, screenshot. **"Tôi đã kiểm tra" không phải bằng chứng.**

Platform ngoài scope ghi `"n/a"`, **không ghi `true`**.

## 4. Append vào `docs/progress/<issue>.md`

Append-only. **Không bao giờ sửa mục cũ** — nhật ký bị viết lại thì mất giá trị.

```markdown
## <ngày giờ> (session N, <tên>)
- ĐÃ LÀM: gạch đầu dòng, kèm số PR/commit
- TIẾP THEO: câu lệnh/bước CỤ THỂ, không phải "hoàn thiện tiếp"
- ĐANG VƯỚNG: (nếu có) + đã thử gì rồi
- QUYẾT ĐỊNH đã chốt: (nếu có → cân nhắc viết ADR)
```

Mục `TIẾP THEO` là mục quan trọng nhất. Test chất lượng: người khác đọc xong
có gõ được lệnh tiếp theo không, hay phải đoán?

## 5. Dọn

- Reservation không còn cần → xoá file trong `reservations/`.
- `node tooling/wt-clean.mjs` nếu đã merge xong worktree khác.

## 6. Ghi lại nếu bạn phải sửa tay việc agent làm

```
node tooling/fixlog.mjs "mô tả ngắn"
```

3 giây. Đây là nguyên liệu của vòng học — không có nó, `/harness-retro` không có gì để đọc.

## 7. Mở PR nếu đã có thể

Điền đầy đủ template, bật auto-merge. Chạy `/pre-merge` trước.

## 8. In 3 dòng tóm tắt cho người đọc

Không phải 30 dòng. Ba dòng: đã xong gì, còn gì, bước tiếp theo là lệnh nào.
