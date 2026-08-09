# Learnings — tuần W32, thien

<!-- Chép file này vào .claude/learnings/2026-W32-cau-hoi-cong-va-may-do-config.md
     TRÊN MỘT NHÁNH (protect-integration-branch chặn ghi trên main).
     Đây là ĐỀ XUẤT, chưa phải harness. -->

## Sửa CA ba lần, không dựng MÁY DÒ: field cấu hình không ai đọc

**Lần xuất hiện** (3 lần, đều có bia mộ trong chính config):

- `2.0.0` — `budget.modelTiering` bị cắt. Lý do ghi trong `harness.config.json`:
  *"không script nào đọc nó, nên nó là một niềm tin được đóng gói thành cấu hình"*.
- `2.28.0` — `budget.monthlyUsdCap` được ghi nhận là **field ma** (`lib/harness.mjs:243`:
  *"nơi DUY NHẤT đọc nó là một dòng advice"*), rồi mới có `budgetStatus()` đọc thật.
- `2.35.0` — `budget.maxToolCallsPerRun` bị cắt, bia mộ ở `harness.config.json:111`.

**Và ba field nữa sống sót** vì không ai đi tìm (đo 2026-08-08, grep `*.mjs` + `*.yml`
toàn repo, dùng `codeOnly(raw,{blankStrings:true})`):

| Field | Tình trạng |
|---|---|
| `limits.prWarnFiles` | **0 nơi đọc.** `ci.yml` chỉ đọc `prWarnLines`/`prFailLines`. Trớ trêu: nó mang đoạn biện minh dài nhất file (đo 6 release: 19·15·21·10·25·35) |
| `limits.reservationTtlHours` | **0 nơi đọc** — trong khi `reservations/` được mô tả là *"advisory lock CÓ TTL"* |
| `mcp.maxTools` | **0 nơi đọc** (`maxServers` thì có) |
| `limits.sessionPresenceMinutes` | **CHIỀU NGƯỢC**: `session-start.mjs:156` gọi `limit('sessionPresenceMinutes', 240)` mà `harness.config.json` **không khai** ⇒ TTL 240 phút là hằng số cứng, và người đọc config để hiệu chỉnh **không thấy nó tồn tại** |

**Lớp lỗi:** verification (bộ đo không có bộ đo)

**Dạng biểu diễn:** `3` — computational control.
Vì sao không dùng được dạng rẻ hơn: `1` (test) chỉ bắt được field đã biết tên, tức là
đúng cái đã sửa rồi. `2` (generator) không áp dụng. Đây phải là một phép **quét**, và
nó phải chạy trên **cả hai chiều**, nếu không nó bỏ lỡ ca `sessionPresenceMinutes`.

**Tầng:** project (đi vào `harness-doctor.mjs`, không phải file mới)

**Scope:** `universal` — mọi repo áp template đều có `harness.config.json`.

**Thang độ trễ:** `harness-doctor` (người gõ / `Setup:maintenance`). Không đặt được
nhanh hơn: phép quét đọc toàn bộ `tooling/` + `.claude/` + `.github/`; ở `Stop` nó ăn
vào ngân sách 30 giây cho một thứ chỉ đổi khi có người sửa config.

**Chi phí bảo trì:** thấp — nó tự cập nhật theo config, không có danh sách viết tay.
Rủi ro thật là **dương tính giả** khi một field được đọc qua destructuring hoặc qua
biến trung gian. Bắt buộc: dùng `codeOnly(raw, { blankStrings: true })` từ
`lib/harness.mjs`, **KHÔNG tự viết `strip()`** — bản tự viết đã nuốt 89% `rituals.mjs`
và báo XANH (#125).

**ĐIỀU KIỆN THOÁT:** khi `harness.config.json` có schema (JSON Schema / zod) mà cả
config lẫn code cùng dẫn xuất từ đó — lúc đó "field không ai đọc" không viết ra được.

---

## Nghi thức chạm bề mặt vendor chỉ hỏi câu TRỪ, chưa bao giờ hỏi câu CỘNG

**Đây KHÔNG phải một tái diễn — nó là một chỗ trống.** Ghi ra để không tick nhầm ô
`occurrences ≥ 2`: mục này phải được lập luận, không được đếm.

Ba mảnh, mỗi mảnh làm đúng việc của nó, và không mảnh nào hỏi câu còn lại:

```
native-surface.mjs   ĐO từ binary → "31 sự kiện · 9 đang cắm · 22 để trống"
claude-code-drift    HỎI          → "vendor vừa ra sẵn thứ nào harness đang tự làm?"   ← TRỪ
harness-doctor       LỌC          → NATIVE_SLOTS = 5 sự kiện, cả 5 đã cắm
```

`harness-doctor.mjs:875` lọc `emptySlots` trên một danh sách **5 phần tử đã đầy cả 5**.
Nó **không thể đỏ**, về mặt cấu trúc. `HARNESS-CHANGELOG:1324` ghi quyết định giữ mẫu
số 5, lý do đúng: *"không liệt kê cả 31, đó sẽ là nhiễu"*.

Lý do đó đúng và **giải sai bài toán**. Con số 22 được **in ra** như một số đo; không
ai **xét** nó. Nên câu hỏi cộng — *"có ô trống nào đang làm harness phải tự làm tay,
hoặc không làm được?"* — chưa từng được hỏi.

**Đo hôm nay: 5 trong 22 ô trống có sẵn việc.**

| Sự kiện | Việc đang không ai làm |
|---|---|
| `PreCompact` · `SessionEnd` | **0 byte** được ghi trước khi context bị xoá. `/handoff` thủ công, và `rituals.mjs` đo được nó **chưa chạy lần nào**. `PreCompact` **chặn được** |
| `TaskCompleted` | *"agent tự khen, mark done sớm"* — `README` liệt kê là vấn đề trung tâm; hiện bắt ở Stop/CI, tức là SAU khi agent đã tin nó xong. Sự kiện này **chặn được** |
| `PostToolUseFailure` | tín hiệu CAPTURE miễn phí, đứng cạnh `fixlog` (người) — hiện `fixlog` là "3 giây người phải nhớ gõ" |
| `Notification` (`idle_prompt`) | đo *"agent đợi người bao lâu"* — chỉ số ma sát người↔agent chưa ai có |

Kèm một mục **đã ghi mà chưa thành việc**: baseline `2.1.224` chép lại rằng vendor
**bỏ trần 200 subagent/phiên**, nên hệ số nhân của ngân sách 5 giây ở `SubagentStop`
không còn trần vendor che chở — trong khi `gates --list --timing` báo
*"subagent: KHÔNG đo được"*. Nhận xét đó nằm trong baseline, không nằm trong hàng đợi.

**Lớp lỗi:** verification

**Dạng biểu diễn:** `4` — verification skill / nghi thức.
Vì sao không dùng được `3` (computational): máy **đo được** ô nào trống (đã làm rồi),
nhưng *"ô này có việc cho harness không"* là một **phán đoán**, không phải phép kiểm.
Cưỡng chế nó bằng gate sẽ sinh ra một cái gác đỏ vì 22 ô mà không ô nào sai — đúng
định nghĩa cái gác sẽ bị tắt.

Vì sao không dùng được `5` (gotcha 1 dòng): nó phải chạy **theo lịch** và ra được ba
trạng thái mỗi ô. Một dòng trong `AGENTS.md` không có trạng thái.

**Tầng:** project — `rituals.mjs`, nghi thức thứ 14.

**Scope:** `universal`.

**Thang độ trễ:** nghi thức, cùng nhịp `claude-code-drift`. Đặt nhanh hơn là vô nghĩa:
tập sự kiện chỉ đổi khi vendor phát hành.

**Chi phí bảo trì:** một sổ `.claude/state/native-slots-reviewed.json` — mỗi ô một
trong ba giá trị `co-viec` / `khong-co-viec` / `chua-xet`, kèm ngày và một câu lý do.
Ô mới xuất hiện trong binary ⇒ tự vào `chua-xet` ⇒ nghi thức `due`. Không có danh
sách viết tay nào phải cập nhật.

**ĐIỀU KIỆN THOÁT:** khi 2 quý liên tiếp nghi thức này không đổi được ô nào từ
`chua-xet`/`khong-co-viec` sang một việc thật — lúc đó nó là nghi thức, hạ xuống
chạy theo quý hoặc bỏ.

---

## Đề xuất CẮT BỎ (bắt buộc tối thiểu 1 mục)

- [x] **`mcp.maxTools`** — 0 nơi đọc, và tiền đề đã hết hạn: MCP tool definition nay
      nạp theo yêu cầu (tool search), nên "tổng tool phơi ra" không còn là con số
      trả tiền ở mọi request. Cắt field, giữ nguyên lý trong `$comment_mcp`.
- [ ] Xét: `limits.reservationTtlHours` — hoặc cho `check-reservations.mjs` đọc, hoặc
      cắt cùng lúc với quyết định `teamSize` của repo này.
