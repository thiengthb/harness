---
name: verify-ui
description: Chụp ảnh giao diện thật ở 2 viewport, lưu làm bằng chứng, rồi giao cho
  design-evaluator chấm. Dùng trước khi đặt `platforms.web.passes = true`, hoặc khi diff
  chạm UI.
allowed-tools: [Bash, Read, Glob, Grep]
disallowed-tools: Write Edit
disable-model-invocation: true
---

# Verify UI — bước THẤY

Ba tài liệu của repo này **bắt buộc** một ảnh chụp, và trước 2.2.0 **không cơ chế nào tạo
ra nó**:

| Chỗ đòi | Câu |
|---|---|
| `docs/DESIGN.md` | *"implement → chụp screenshot → so với thiết kế → LIỆT KÊ khác biệt → sửa"* |
| `AGENTS.md` | `evidence` hợp lệ là *"output test / CI job / **screenshot thật**"* |
| `docs/rubrics/_TEMPLATE.md` | *"Mỗi điểm phải kèm `file:dòng` hoặc screenshot. Điểm không có bằng chứng = không hợp lệ."* |

Hệ quả: `design-evaluator` đang chấm **mã nguồn**, không chấm **giao diện**. Và đó là lý do
**cài thêm một skill thẩm mỹ không giải quyết gì** — nó thêm ý kiến vào một vòng lặp không
có mắt. `docs/DESIGN.md §Vòng lặp verify quan trọng hơn cả skill thẩm mỹ` đã kết luận đúng
trước cả câu hỏi.

Skill này là **TRÌNH TỰ**, không phải tri thức. Gate không thay được vì đây là một chuỗi
hành động, không phải một phép kiểm; agent không tự nhớ được vì nó không có triệu chứng
khi bỏ qua.

## 1. Chạy app thật

```
node -e "console.log(require('./harness.config.json').commands.build || 'CHƯA KHAI commands.build')"
```

App chưa chạy được thì **DỪNG**. Chụp ảnh một app không chạy là chụp một trang lỗi.

## 2. Chụp ở HAI viewport — mobile VÀ desktop

**Một ảnh không phải bằng chứng.** Phần lớn lỗi layout chỉ hiện ở một trong hai, và một
ảnh desktop đẹp là cách một breakpoint hỏng đi qua review.

| Bối cảnh | Cách chụp |
|---|---|
| Phiên **có người** (mặc định) | Claude in Chrome: `navigate` → `resize_window` 390×844 rồi 1440×900 → `computer` screenshot |
| Project **đã có** công cụ visual | chạy qua `commands.e2e` (Playwright/Cypress/Maestro) — dùng cái đã có |
| **CI** | Bắt buộc là công cụ của project. Claude in Chrome **không** chạy ở phiên headless |

**Template KHÔNG ship công cụ chụp, và đó là cố ý.** Playwright/Maestro là tri thức stack;
`harness.config.json` là chỗ duy nhất được biết stack. Ship một runner browser vào template
là ship một thứ hết hạn nhanh hơn template.

## 3. Lưu vào `docs/evidence/<issue>/`

```
docs/evidence/ABC-123/
├── web-mobile-390x844.png
├── web-desktop-1440x900.png
└── notes.md          ← khác biệt so với thiết kế, viết thành câu
```

Tên file **mang kích thước** vì `features/<id>.json → evidence` trỏ tới đây, và một reviewer
phải biết ảnh đó chụp ở đâu mà không cần mở. Đường dẫn tương đối, POSIX, kể cả trên Windows.

## 4. Giao cho `design-evaluator`, đừng tự chấm

Tự chấm là **self-scoring vòng kín**: cùng một context vừa tạo ra UI vừa nói UI đó tốt.
Gọi subagent `design-evaluator` với **đường dẫn ảnh** + rubric ở `docs/rubrics/`.

Nó không có quyền sửa code — cố ý. Người sửa là bạn, sau khi đọc điểm.

## 5. Chỉ khi đó mới đổi `features/<id>.json`

```json
"web": { "passes": true, "evidence": "docs/evidence/ABC-123/web-desktop-1440x900.png" }
```

`evidence` trỏ tới file **tồn tại**. `"đã kiểm bằng mắt"` không phải bằng chứng, và
`passes: true` không có `evidence` là ca `check-feature-integrity.mjs` tồn tại để bắt.

## Xong bước này bạn phải có

- [ ] 2 ảnh, 2 viewport, ở `docs/evidence/<issue>/`
- [ ] `notes.md` liệt kê khác biệt so với thiết kế — **kể cả khi không có khác biệt**, ghi "không có"
- [ ] điểm của `design-evaluator`, không phải điểm của chính bạn
- [ ] `features/<id>.json` trỏ tới file thật

## Điều kiện thoát

Khi `commands.e2e` của project so ảnh với baseline **tự động ở CI**, bước 2–3 của skill này
thành thừa: gate làm việc đó mỗi PR, không cần nghi thức. Lúc đó skill co lại còn bước 4–5.
**Kiểm lại mỗi lần `commands.e2e` đổi.**

(Bản 2.3.0 khoá điều kiện thoát này vào một field tên **visual** — field mà
`harness.config.json` nói thẳng là KHÔNG được thêm. Một điều kiện thoát trỏ vào thứ không
bao giờ tồn tại là điều kiện thoát không bao giờ đến; `entropy-scan` bắt được nó ở 2.5.0.)
