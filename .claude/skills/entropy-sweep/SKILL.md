---
name: entropy-sweep
description: Quét tài liệu và harness tìm thứ đã lỗi thời. Dùng 2 tuần một lần,
  sau refactor lớn, hoặc khi đổi model.
allowed-tools: [Read, Grep, Glob, Bash]
disallowed-tools: Write Edit
disable-model-invocation: true
---

# Entropy sweep

Harness **không tự tốt lên** theo thời gian — nó **tự xấu đi**, vì codebase đổi và
model đổi mà tài liệu thì không. Không ai gửi thông báo khi một mảnh harness hết hạn.

Với agent, **mọi text trong repo có thẩm quyền như nhau**. Nó không có trực giác
"ghi chú này 3 tháng trước, giờ sai rồi". Tài liệu cũ **độc hại hơn** không có tài liệu.

## 1. AGENTS.md — GIAO CHO `/doctor` NATIVE, đừng làm tay

```
/doctor
```

Lệnh native của Claude Code làm đúng việc này: nó đề xuất cắt gọn CLAUDE.md/AGENTS.md,
do vendor bảo trì, và **nó biết nội dung nào suy ra được từ codebase** — thứ mà một
skill viết tay chỉ đoán. Chạy nó trước, rồi mới đọc phần dưới.

(Không lẫn với `node tooling/harness-doctor.mjs` — cái đó kiểm **lớp harness**:
gate, hook, telemetry, bài học. Hai nghề khác nhau, và tên có tiền tố để không nhầm.)

Sau khi `/doctor` chạy, với mỗi mục CÒN LẠI hỏi hai câu:

- Claude có suy ra được từ repo/file tree không? → **XOÁ**
- Nó có xung đột/trùng với skill hoặc rule nào không? → **XOÁ ở một chỗ**

Rồi:

- Xoá mọi negative constraint không thuộc 3 nhóm nguy hiểm (production, secret, migration đã merge)
- Xoá mọi "persona" ("bạn là senior engineer 12 năm kinh nghiệm")
- Xoá mọi ví dụ dùng tool — ví dụ **giới hạn không gian khám phá** của model đời mới.
  Nếu tool cần ví dụ mới dùng được thì **interface tool sai**, không phải thiếu ví dụ
- Giữ lại: gotcha, quyết định có ranh giới, tên integration cụ thể, ngưỡng số thật,
  bước build không hiển nhiên

## 2. Rules — kiểm frontmatter (native KHÔNG biết gì về mấy thứ này)

```
node tooling/harness-size.mjs
```

- Rule nào **không có `paths`**? → thuế context cho mọi người ở mọi request. Thêm `paths` hoặc xoá.
- Rule nào **không có `owner` + `expires-review`**? → không ai chịu trách nhiệm, không bao giờ bị xét lại.
- Có hai file cùng nói về một chủ đề? → **một chủ đề, một file.**
  Chỉ thị xung đột làm model tốn năng lực dàn hoà **trước khi** làm việc thật.

## 3. Skill

- Đường dẫn/lệnh trong skill còn tồn tại không?
- Skill nào không được dùng 2 tuần qua? → đề xuất bỏ — **nhưng KHÔNG theo bộ đếm một mình.**
  `harness-doctor` in `skill NGƯỜI GÕ … lần`, và cái tên đó là cả một cảnh báo: ô
  `UserPromptExpansion` **không thấy skill do model tự gọi** (đo trực tiếp 2026-08-13 —
  gọi qua công cụ `Skill` không tạo mục nào). Nên `0 lần` không phân biệt được *"chết"* với
  *"chỉ model gọi"*, và 3/12 skill ở repo này model gọi được.
  Trước khi đề xuất bỏ, cần **một bằng chứng thứ hai**: `disable-model-invocation: true` trong
  frontmatter của nó (⇒ bộ đếm THẤY được nó, nên `0` mới có nghĩa), hoặc `rg` không ra tham
  chiếu nào còn sống.
- Skill nào dài > 1 trang? → chẻ thành mục lục + file con (progressive disclosure)
- Tổng số skill > 12? → bằng chứng cộng đồng: ≤12 cho kết quả tốt hơn skill tràn lan

## 4. Bài học

```
node tooling/knowledge/lint.mjs
```

- Bài học nào quá hạn `expires-review`?
- **Điều kiện thoát của nó đã xảy ra chưa?** → `status: retired`
- Bài học nào `representation: rule` mà giờ có thể hạ xuống test/hook? → hạ xuống

## 5. ADR

Có ADR nào bị quyết định sau đó thay thế? → đánh `Superseded by NNNN`.
**Không xoá.** Agent cần thấy con đường đã bị loại, nếu không nó sẽ đề xuất lại.

## 6. MCP và tool

```
/mcp        # token cost từng server
/plugin     # tab Installed → mục "Not used recently"
```

MCP không được gọi trong 2 tuần → gỡ. Không tranh luận, cài lại mất 30 giây.

## 7. Dấu ngày kiểm

Mọi tài liệu nên có `last-verified: YYYY-MM-DD` ở đầu. Sweep cập nhật dòng này.
Tài liệu quá `limits.docStaleDays` ngày → agent được dạy **verify trước khi tin**.

## 8. Báo cáo — KHÔNG TỰ XOÁ

Bảng: `mục | còn đúng? | bằng chứng | đề xuất (giữ/sửa/xoá)`.

**Người quyết định.** Bạn đề xuất.
