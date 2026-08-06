# Learnings — tuần W32, claude (agent)

## SessionStart in "việc số 1 cần làm" ở MỌI phiên của repo template — về một việc repo template KHÔNG ĐƯỢC LÀM

`.claude/hooks/session-start.mjs:203`

```js
if (!c.commands?.verify && !c.commands?.test) {
  lines.push(`   ⚠️  harness.config.json chưa khai báo lệnh verify/test — gate đang rỗng. Đây là việc số 1 cần làm.`);
}
```

Điều kiện này **đúng vĩnh viễn trong chính repo này**, và đúng *theo thiết kế*:
`harness.config.json` của template khai mọi lệnh là `""`, `project.id` là
`CHANGEME-project-id`, `AGENTS.md` ghi `| Verify toàn bộ | CHANGEME |`. Trạng thái
"chưa khai lệnh" **là trạng thái đúng** của một template. Và `harness.config.json`
nằm trong `paths.harness` — agent đọc dòng nhắc này **không có quyền** làm theo nó.

Nên nó không phải một cảnh báo. Nó là một dòng chữ đỏ nói sai sự thật, đứng ngay
dưới khối `▶️ N việc ĐANG TỚI HẠN` — khối duy nhất trong bản tin đầu phiên có
tín hiệu thật.

**Lần xuất hiện** — không phải "≥2 lần ngẫu nhiên", mà **7/7 lần đo được**:

| bằng chứng | số đo |
|---|---|
| `.claude/telemetry/hook-runs.log` | **7/7** lần `session-start` chạy đều thoả điều kiện (2026-08-05T22:18 → 2026-08-06T13:58) |
| `git log -S "việc số 1 cần làm"` | có từ `a78234c` (2026-08-03) — **commit đầu tiên của repo** |
| `grep -c repoRole .claude/hooks/session-start.mjs` | **0** — hook không hề biết khái niệm template |

Tức tỉ lệ dương-tính-giả của mục này trong repo template là **100%, từ ngày đầu**.

**Lớp lỗi:** verification

Cùng lớp với `knowledge/lessons/0003` (*"self-test của template giả định repo của
chính nó"*) và cùng lớp với bốn ca đã sửa tuần này: **một phép kiểm không phân biệt
được hai trạng thái, và đổ về phía dễ chịu.** Ở đây hai trạng thái là
`template` và `consumer`; phép kiểm chỉ nhìn `commands`, nên nó đọc "template chưa
được áp dụng" thành "project bị bỏ bê".

Chi phí thật không phải một dòng thừa. Là **thói quen bỏ qua**: khối cảnh báo đầu
phiên dạy người đọc rằng nó luôn có một dòng đỏ không cần làm gì. `tooling/rituals.mjs`
đã ghi chính xác cơ chế hỏng này ở header — *"một nhắc nhở nói mọi thứ ở mọi lúc thì
không nói gì ở lúc nào"* — và đó là lý do `/claim` với `/handoff` chưa chạy lần nào.

**Dạng biểu diễn đề xuất:** `3` (computational control — sửa điều kiện sẵn có) **+** `1` (test khoá lại)

```js
if (repoRole() !== 'template' && !c.commands?.verify && !c.commands?.test) {
```

`repoRole()` đã có sẵn trong `tooling/lib/harness.mjs` và đã được dùng đúng kiểu này
ở `test-hooks.mjs` (bài học 0003). Đây là **một mệnh đề**, không phải cơ chế mới.

Vì sao không dùng dạng rẻ hơn: dạng `5` (gotcha) và `6` (skill) là *thêm chữ cho
người đọc* — mà khuyết tật nằm ở **chữ do máy in ra**. Thêm một dòng tài liệu nói
"đừng tin dòng cảnh báo kia" là làm harness to ra để bù cho một chỗ nói sai, đúng
thứ `/entropy-sweep` tồn tại để cắt.

Vì sao kèm `1`: nếu chỉ sửa mệnh đề, không gì ngăn nó quay lại. Test đọc nguồn
`session-start.mjs`, khẳng định mọi nhánh `lines.push` mang mức `⚠️` phải hoặc có
điều kiện phụ thuộc `repoRole()`, hoặc đúng ở cả hai vai. Đặt ở `tooling/test-hooks.mjs`
(**vùng làm được**, không khoá).

**Tầng:** project · **Scope:** `universal`

Xoá repo này thì mục này còn giá trị: mọi harness phân phối theo mô hình
template→consumer đều có lớp lỗi "phép kiểm viết cho consumer chạy trong template".

**Thang độ trễ:** `SessionStart`. Không đặt được ở tầng nhanh hơn — khuyết tật *là*
output của tầng này.

**Chi phí bảo trì:** ~0. Một mệnh đề và một test đọc nguồn.

**ĐIỀU KIỆN THOÁT:** khi `repoRole()` bị bỏ khỏi harness (không còn phân biệt
template/consumer), toàn bộ mục này vô nghĩa và **phải cắt cùng lúc** — cả mệnh đề
lẫn test. Ghi ra để lần sau không ai phải đoán.

**Vùng khoá:** `.claude/hooks/session-start.mjs` ∈ `paths.harness`. **Chưa tự áp dụng**
(bước 5 `/harness-propose`). Cùng file với issue #51 → nên sửa trong **một** lần mở
cửa thoát, không hai.

---

## Đề xuất CẮT BỎ

- [x] **Chính dòng này** — đây là một mục cắt, không phải mục thêm: bản vá đúng làm
      bản tin đầu phiên **ngắn đi một dòng** trong repo template, và giữ nguyên trong
      repo tiêu thụ (nơi nó đúng). Số cơ chế không tăng.
- [ ] Chưa rà lại `expires-review` của bài học nào trong `knowledge/lessons/` tuần này.
