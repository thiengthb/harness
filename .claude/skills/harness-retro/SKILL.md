---
name: harness-retro
description: Đọc telemetry tuần qua và đề xuất thay đổi harness. Dùng cuối tuần
  (thứ Sáu), sau một sự cố, hoặc sau khi đổi model.
allowed-tools: [Read, Grep, Glob, Bash]
disallowed-tools: Write Edit
disable-model-invocation: true
---

# Harness retrospective — 30 phút, thứ Sáu

Bước DISTILL của vòng học. **Ra ĐỀ XUẤT, không ra thay đổi.**

Trong team: làm với **2 người** — một đề xuất, một phản biện. Lý do: đề xuất
harness của một người rất dễ là sở thích cá nhân được đóng gói thành "best practice".

## Bước 1 — Đọc dữ liệu

```
node tooling/fixlog.mjs --top
node tooling/fixlog.mjs --list
cat .claude/telemetry/gate-fails.log | tail -100
git log --oneline -50
gh pr list --state merged --limit 30 --json number,title,additions,deletions
node tooling/harness-size.mjs
node tooling/knowledge/lint.mjs
```

Thêm: feature nào từng `passes: true` rồi bị đổi lại `false` (đó là verification failure thật).

## Bước 2 — Nhóm theo NGUYÊN NHÂN, không theo triệu chứng

Với mỗi nhóm ≥2 lần, gán một lớp lỗi:

| Triệu chứng | Lớp | Sửa ở đâu |
|---|---|---|
| Bịa API, dùng version cũ | Context | docs reference, LSP |
| Quên instruction giữa session dài | Context | chuyển rule → hook |
| Làm thứ bị cấm | Constraint | hook PreToolUse, deny rule |
| Tự khen, mark done sớm | Verification | default-FAIL + grader context mới |
| Test pass nhưng feature không chạy | Verification | bắt buộc E2E thật |
| Sửa test cho pass thay vì sửa code | Control | hook chặn edit test trong turn fix |
| Làm nửa chừng rồi đi hướng khác | Planning | 1 feature/session, ready queue |
| Lặp vô hạn cùng một sửa đổi | Loop | step limit, `/clear` |
| Session mới không biết session cũ | State | progress file + git log |
| Tin thông tin đã cũ | State | verify just-in-time, TTL |
| Hỏng ở bước 40/50, mất hết | Recovery | commit từng bước |
| Hoá đơn nhảy vọt | Economics | loop limit, wall-clock, budget cap |
| Chất lượng tụt SAU khi bạn "cải thiện" harness | Learning | eval gate trước khi promote |

## Bước 3 — Với mỗi nhóm, đề xuất ĐÚNG MỘT thay đổi

Nói rõ:

- Lớp lỗi nào
- Cơ chế cụ thể (hook? rule? skill? generator? test? contract?)
- Đặt ở **tầng nào của thang độ trễ** — và **vì sao không đặt được ở tầng nhanh hơn**

  ```
  PostToolUse hook  ~ms      formatter, lint file vừa sửa, cấm pattern
  pre-commit        ~s       secret scan, typecheck incremental, case collision
  Stop hook         ~10s–1p  full typecheck + test + build
  CI                ~phút    E2E, a11y, perf, security
  Human review      ~giờ     chỉ thứ máy không chấm được
  ```

  Cùng một ESLint: ở PostToolUse agent tự sửa trong 200ms và không bao giờ commit
  lỗi đó; ở CI thì agent đã đi tiếp 40 phút, context đã trôi, sửa lại tốn 10×.
  **Cùng công cụ, giá trị khác 10 lần, chỉ vì vị trí.**

- Chi phí bảo trì dự kiến
- **Điều kiện thoát** — BẮT BUỘC

## Bước 4 — Đề xuất CẮT BỎ (bắt buộc, tối thiểu 1 mục)

Mỗi thay đổi promote phải kèm một đề xuất cắt bỏ. Không nhất thiết cắt, nhưng **phải xét**.

- Skill / rule / MCP / hook nào không được dùng tuần qua?
- Mục nào trong AGENTS.md không còn đúng với code hiện tại?
- Bài học nào quá hạn `expires-review`?

Không có bước này, mọi retro chỉ thêm, và harness thành nghĩa địa của những
giả định đã hết hạn.

## Bước 5 — Ghi ra file

`.claude/learnings/<năm>-W<tuần>-<tên>.md`. **KHÔNG tự sửa harness.**
Người quyết định promote → `/knowledge-promote`.

## Bước 6 — Nhìn ba con số

| Chỉ số | Xu hướng tốt |
|---|---|
| số lần sửa tay / tuần | ↓ |
| kích thước harness | **phẳng hoặc ↓** ← ngược trực giác |
| số PR bị revert trong 7 ngày | ↓ |

Sửa tay cao **và** harness lớn = harness đang phình mà không giải quyết vấn đề thật.
