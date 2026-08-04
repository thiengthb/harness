---
name: ship-feature
description: Đưa một feature đi hết vòng đời, qua mọi platform trong scope. Dùng khi
  implement một feature mới đã có spec và đã claim issue.
allowed-tools: [Bash, Read, Write, Edit, Glob, Grep]
---

# Ship một feature

**Một feature một session.** Đây là thứ chữa được bệnh "ôm hết một lần rồi vỡ giữa chừng".

Mỗi bước có một **GATE**. Chưa qua gate thì chưa được đi tiếp.

## Bước 0 — Research (nếu capability > ~200 dòng)

`/research-first`. Bỏ qua nếu chỉ là wiring.

Vừa thêm >150 dòng ở bước 5 hoặc 6? → `/dedupe-scan` trước khi mở PR.

## Bước 1 — CONTRACT (tầng 1)

Viết/sửa schema ở tầng nguồn sự thật (contracts/schema/proto/openapi), rồi chạy `gen`.

**GATE:** `typecheck` **toàn repo** pass. Chưa pass thì chưa được đi tiếp.

Đây là lúc bạn phát hiện conflict ngữ nghĩa — sớm nhất có thể, ở chi phí rẻ nhất.

## Bước 2 — CORE + TEST (tầng 2) — TDD ở đây, CHỈ ở đây

Viết test fail trước. Hiện thực logic thuần, **chỉ dùng interface (ports)**, không chạm platform.

**GATE:** test của core xanh. **Không cần browser/simulator.**

> Chi tiết dễ bỏ sót nhưng là lợi ích lớn nhất của kiến trúc này với agent:
> vòng lặp verify ở tầng core mất ~2 giây; trên simulator mất ~60 giây.
> Agent làm 30 vòng ở core rẻ hơn 3 vòng trên simulator — và tìm ra bug logic sớm hơn.

→ `features/<id>.json`: `platforms.core.passes = true`, evidence = đường dẫn output test.

## Bước 3 — PORT mới (nếu cần)

Cần một capability chưa có (storage, auth, notification, clock, http)?

1. Thêm **interface** vào tầng ports **TRƯỚC**
2. Hiện thực ở **mọi** adapter trong scope (web / native / node)
3. Bỏ một adapter → ghi rõ `"n/a"`, không lặng lẽ bỏ

**KHÔNG** import trực tiếp thư viện platform vào core. Một dòng là hết platform-agnostic.

**GATE:** `depcruise` pass (core vẫn thuần).

## Bước 4 — API (nếu feature cần server)

Route **mỏng**: parse (theo contract) → gọi core → serialize. Không logic ở route.

**GATE:** contract test.

## Bước 5 — UI (tầng 3)

- Primitive: **dùng lại** từ design system
- Composite mới: thêm vào **design system**, không viết trong app

**GATE:** 0 màu cứng, 0 spacing cứng ngoài token — rồi `/verify-ui` (bước XEM: 2 viewport,
ảnh vào `docs/evidence/<issue>/`, `design-evaluator` chấm). Không có bước đó thì vòng UI
làm việc mà không có mắt, và `features/<id>.json → web.evidence` không có gì thật để trỏ tới.

## Bước 6 — WIRING (tầng 5), lặp cho từng app

Mỗi app có **đúng một** điểm wiring (DI): nơi duy nhất platform gặp business logic.
Một file, dễ review, dễ giải thích cho agent.

## Bước 7 — VERIFY THEO PLATFORM — bước KHÔNG được cắt

| Platform | Công cụ | Đi qua đúng các `steps` trong feature file |
|---|---|---|
| web | browser automation | như người dùng thật |
| ios + android | flow YAML dùng chung | cùng một flow, 2 platform |
| desktop | webview + smoke native | |
| api | contract test | |
| a11y | audit ở viewport mobile VÀ desktop | |
| perf | budget theo route | |

→ Cập nhật `features/<id>.json` từng platform + **evidence CỤ THỂ**.

Không được: mark `passes: true` cho platform bạn chưa chạy. Không có ma trận này,
agent làm xong web, ghi `passes: true`, và bạn phát hiện mobile hỏng ba tuần sau.

## Bước 8 — REVIEW

- Code review với **context mới** (không thấy quá trình build)
- Security review nếu chạm auth / payment / dữ liệu người dùng
- Design review nếu chạm UI

> Reviewer được yêu cầu "tìm gap" thì **luôn** tìm ra gap, kể cả khi code ổn —
> vì đó là việc nó được giao. Chạy theo mọi finding dẫn tới over-engineering:
> abstraction thừa, code phòng thủ vô ích, test cho case không thể xảy ra.
> **Nói rõ với reviewer: chỉ flag gap ảnh hưởng correctness hoặc requirement đã nêu.**

## Bước 9 — SHIP

`/pre-merge` → PR → CI gate → review → merge queue → staging → **người bấm nút prod**.

## Bước 10 — POST

- Xoá nhánh + worktree
- `/handoff`
- Phải sửa tay việc agent làm? → `node tooling/fixlog.mjs "..."`
