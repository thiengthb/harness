---
id: L0000
title: Một câu, mô tả HÀNH VI SAI đã quan sát được (không phải giải pháp)
scope: project            # universal | stack:<tên> | project
class: verification       # context | tools | orchestration | state | verification | recovery | economics | learning
representation: test      # test | generator | computational-control | verification-skill | gotcha | skill | rule
status: active            # active | candidate | superseded | retired
                          # candidate = nhận từ repo khác, repo NÀY chưa gặp lần nào
owner: "@ai"
added: 2026-08-03
expires-review: 2026-11-03
occurrences: 2
evidence:
  - "PR #000 — mô tả ngắn chuyện đã xảy ra"
  - "PR #000 — lần thứ hai"
artifacts:
  - "đường/dẫn/tới/file/hiện/thực.mjs"
evals:                    # GATE đi theo bài học. Bắt buộc trên thực tế với dạng
  - "evals/tasks/NNNN-....md"   # test | computational-control | generator —
                          # không có nó, repo nhận có cơ chế mà không kiểm được cơ chế đó.
# seen-in:                # tự sinh bởi accept.mjs --merge: danh sách repo đã gặp
#   - "project-a"         # độc lập. ≥2 repo = bằng chứng mạnh hơn 2 lần cùng repo.
# origin: "project-a@abc123"   # tự sinh khi nhận từ repo khác
exit-condition: "Làm sao biết bài học này HẾT cần thiết. Bắt buộc, không được để trống."
---

## Triệu chứng

Điều bạn quan sát được. Cụ thể, có số PR. Không phải "agent chưa hoàn hảo".

## Nguyên nhân

Tại sao nó xảy ra. Lớp lỗi nào (theo `class` ở trên).

## Cơ chế

Chính xác cái gì đã được thêm/đổi để chặn nó. Trỏ tới `artifacts`.

Nếu `representation` là 6 hoặc 7 (skill / rule cứng): **giải thích vì sao 1–5 không khả thi.**
Đây là câu hỏi bắt buộc trả lời, vì rule cứng là dạng đắt nhất và mục nhanh nhất.

## Chuyển đi được không

- `universal` — vì sao đúng ở mọi repo?
- `stack:<tên>` — stack nào, phiên bản nào?
- `project` — vì sao chỉ đúng ở đây? (Nếu không trả lời được, có thể nó là `stack:*`.)
