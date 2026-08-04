---
name: whats-new
description: Xem hoặc cập nhật thông báo thay đổi harness cho team. Dùng sau khi
  merge một thay đổi vào .claude/, hoặc khi muốn biết harness vừa đổi gì.
allowed-tools: [Read, Bash]
disable-model-invocation: true
---

# What's new

## Xem

```
cat .claude/whats-new.md
cat .claude/state/whats-new-seen.json    # version bạn đã xem
```

SessionStart hook tự nhắc **một lần** khi `version` mới hơn thứ bạn đã xem.

## Cập nhật (khi merge thay đổi harness)

> Agent không sửa được `.claude/whats-new.md`? Có — file này **không** nằm trong
> `paths.harness`, cố ý: thông báo thay đổi phải rẻ, nếu không sẽ không ai làm.
> Nhưng nội dung phải khớp với một PR harness đã được duyệt.

1. Đổi dòng `<!-- version: YYYY-MM-DD-x -->` ở đầu file
2. Thêm mục mới **lên trên cùng**, tối đa ~5 dòng:

```markdown
## <ngày> — <tên thay đổi>
<Cái gì đổi, một câu.>
<Người dùng phải làm gì khác đi, một câu.>
Nếu bị chặn sai → nhắn @dri, ĐỪNG tự tắt hook.
```

3. Xoá mục cũ hơn 1 tháng. File này phải **ngắn** để người ta thật sự đọc.

## Quy trình canary cho thay đổi harness

Đừng bao giờ merge thay đổi hook vào main rồi mới biết nó chậm 4 giây trên máy Windows.

```
Đổi hook/settings.json
  → 1 người dùng thử 2 ngày (qua settings.local.json)
  → chạy eval set:  node evals/run.mjs
  → CI parity 3 OS xanh
  → PR + cập nhật whats-new
  → merge
```

## Vì sao bước này tồn tại

Harness đổi mà không thông báo = nửa team hành xử theo rule cũ, nửa theo rule mới,
và **không ai biết tại sao agent hôm nay lạ**. Đây là loại conflict tệ nhất vì
không công cụ nào báo.
