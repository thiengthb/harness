---
id: L0008
title: Một tín hiệu "TỚI HẠN" được lái bởi đại lượng mà hành động nó đề nghị KHÔNG đổi được — nên nó đỏ vĩnh viễn và thôi là tín hiệu
scope: universal
class: verification
representation: computational-control
status: active
owner: "@ai"
added: 2026-08-12
expires-review: 2026-11-12
occurrences: 4
evidence:
  - "PR #105 (learnings tuần W32 §1 — file trong `.claude/learnings/` không ship, số PR mới là neo) — `/harness-propose` đỏ vì đếm MỌI dòng từng có trong `gate-fails.log`. Ba lần chặn ngày 2026-08-07 đều đã xử lý xong; không lệnh nào làm nó xanh lại. Sửa bằng `TELEMETRY_CLOSED` + `openTelemetryEntries()`"
  - "PR #174 (v2.61.0) — `flat-ok` treo vào `b.measured`, một cờ chỉ có nghĩa với gói metered. Người dùng gói PHẲNG không bao giờ gõ `--usd` (v2.61.0 sinh ra để họ khỏi cần), nên sổ USD mãi rỗng và mục đỏ vĩnh viễn dù họ làm đúng mọi thứ"
  - "PR #181 (v2.63.0) / issue #180 — `flat-limited` bật khi `rateLimitHits > 0`. Đo: 19 lần chạm trong cửa sổ TRƯỢT 30 ngày ⇒ đỏ mỗi SessionStart suốt 30 ngày, và hành động mà chính nó yêu cầu (`capo-report`) không đổi con số đó. Cửa sổ trượt trên tín hiệu bạn còn tiếp tục sinh ra thì không bao giờ cạn"
  - "PR #183 (v2.64.0) / issue #182 — `fixlogTotal >= 10`, ngưỡng đặt trên một con số CHỈ TĂNG. Cách `flat-limited` 40 dòng trong cùng file, hai ngày sau"
  - "PR #185 (v2.65.0) — lần thứ năm, tìm thấy bằng chính phép trừ của #182: `fixlog --list` vẫn cảnh báo `≥10 lần/tuần` trên 11 mục trong khi 9 mục thuộc nhóm đã `--close` hoặc đã `--track`. Thật sự chưa xử: 2"
artifacts:
  - "tooling/lib/harness.mjs — `mergeRitualStates()` (hợp nhất một lượt đo, `since` chỉ nhảy khi trạng thái ĐỔI) · `stuckRituals()` (6 mode, ba mode chưa-trả-lời-được trả `null` chứ không `[]`) · `RITUAL_STATES_FILE`"
  - "tooling/rituals.mjs — `collect()` ghi sổ mỗi lượt. Đặt ở `collect()` chứ không ở `main()`: `session-start` IMPORT `collect()`/`evaluate()` thay vì spawn CLI, nên một lời gọi trong `main()` chỉ lấy mẫu những lượt chạy TAY"
  - "tooling/harness-doctor.mjs — §VÒNG HỌC in *\"N nghi thức `due` liên tục ≥14 ngày với 0 lần `ok`\"*. Ở doctor chứ KHÔNG ở `rituals`: một nghi thức canh các nghi thức khác rơi vào đúng cái bẫy nó canh"
  - "tooling/lib/harness.mjs — `handledGroups()`: phép trừ *\"nhóm nào đã xử\"* dùng chung cho `rituals.fixlogState()` và `fixlog --list`, thay hai bản chép lệch nhau"
  - "tooling/test-hooks.mjs — khối `stuckRituals`: bảng 10 ca mode, ca `dueDays` đo từ lượt ghi CUỐI (ca duy nhất phân biệt hai phép tính), hợp đồng mode ↔ bên đọc hai chiều, và e2e `rituals` có thật sự ghi sổ không"
evals:
  - "evals/tasks/0008-tin-hieu-toi-han-phai-tat-duoc.md"
exit-condition: "Khi `rituals` chuyển sang máy trạng thái KHAI BÁO — mỗi nghi thức khai điều kiện chuyển `due → ok`, và mỗi mục có một ca test DỰNG RA được trạng thái `ok` của nó. Lúc đó tính chất này kiểm được TRƯỚC khi merge và phép đo hậu nghiệm ở doctor thành thừa. Mốc đo: mọi id trong `RITUALS` xuất hiện trong ít nhất một ca test đi tới nhánh `ok`. KHÔNG retire vì *\"cảnh báo chưa nổ lần nào\"* — một cái gác im lặng và một cái gác không cần thiết trông giống hệt nhau (`L0004`)."
---

## Triệu chứng

Một mục trên bảng "việc đang tới hạn" **đỏ vĩnh viễn**. Người đọc chạy đúng lệnh mà mục đó ghi
ở `cmd`, và màu không đổi. Không có lỗi nào, không có gì hỏng — chỉ là không có đường nào từ
trạng thái hiện tại tới `ok`.

Năm lần trong hai tuần, và ba lần cuối nằm **trong cùng một file, cách nhau 40 dòng**:

| lần | đại lượng lái tín hiệu | vì sao hành động không tắt được nó |
|---|---|---|
| W32 §1 | mọi dòng từng có trong `gate-fails.log` | sổ chỉ biết ghi thêm |
| v2.61.0 | `b.measured` (cờ của gói metered) | người gói PHẲNG không bao giờ gõ `--usd` |
| #180 | `rateLimitHits > 0`, cửa sổ 30 ngày | cửa sổ TRƯỢT trên tín hiệu bạn còn sinh ra |
| #182 | `fixlogTotal >= 10` | số ĐỜI, chỉ tăng |
| #185 | `rows.length >= 10` ở `fixlog --list` | đếm cả mục đã `--close` và đã `--track` |

Cái giá không phải sự khó chịu. **Một tín hiệu không bao giờ xanh lại được thì thôi là tín
hiệu**: người đọc học rằng mục đó không đáng phản ứng, và lần nó đỏ THẬT cũng không ai phản
ứng. Đó là `L0002` áp cho bảng điều khiển thay vì cho guard.

## Nguyên nhân

Lớp `verification`, **không phải `state`** — và chỗ xếp loại đó là chỗ bản vá đi lệch.

W32 §1 gọi đây là `state` (*"sổ giữ sự thật đã cũ"*), nên thuốc là TTL + nút đóng. Cả hai đã
được xây (`TELEMETRY_CLOSED`, `openTelemetryEntries()`, `fixlog --close`). Bệnh vẫn tái phát
**ba lần** sau đó. Sổ cũ chỉ là MỘT cách sinh ra bệnh; bệnh là *phép kiểm không có trạng thái
đúng nào để đạt tới*, và đó là câu hỏi về **verification**.

W32 còn đề xuất một hợp đồng: *"mọi bộ đếm lái tín hiệu tới hạn phải khai `window:` hoặc
`closable: true`"*. Nửa đó chưa được xây — nhưng phần đáng đọc hơn là: **kể cả nếu đã xây, nó
chỉ bắt được 1 trong 3 ca tuần W33.**

- `fixlogTotal` — bộ đếm đời, không window, không closable ⇒ **bắt được**
- `rateLimitHits` — **có** `window: 30` ⇒ cho qua, và vẫn đỏ vĩnh viễn
- `b.measured` — cờ boolean, không phải bộ đếm ⇒ ngoài phạm vi

Nên `window` và `closable` là hai **cách đạt tới** tính chất cần có, không phải tính chất đó:

> **Tồn tại một trạng thái mà phép kiểm trả `ok`, và trạng thái đó tới được bằng đúng hành động
> ghi ở `cmd`.**

Bản vá #180 không thêm cửa sổ hay nút đóng. Nó **đổi thứ được đo**: từ *"bạn đã chạm trần bao
nhiêu lần"* (quá khứ, không hành động được) sang *"bạn đã đo tỉ lệ chưa"* (hiện tại, hành động
được). Con số 19 vẫn được in — nó chỉ thôi lái màu.

## Cơ chế

**ĐO, không bắt KHAI.**

Bắt mỗi nghi thức khai `clearedBy:` là dạng `7` trá hình: người viết nghi thức mới sẽ điền một
câu nghe hợp lý và **không gì kiểm được câu đó** — đúng thứ `AGENTS.md` gọi là inferential
control. Thứ kiểm được là **lịch sử**, và nguyên liệu miễn phí vì `rituals` đã chạy ở mọi
SessionStart:

1. `rituals.collect()` ghi một snapshot `{state, since, lastOkAt, okRuns, runs}` cho mỗi nghi
   thức. `since` **chỉ nhảy khi trạng thái đổi** — đó là toàn bộ phép đo.
2. `harness-doctor` (chạy theo yêu cầu) in: *"N nghi thức `due` liên tục ≥14 ngày với **0** lần
   `ok`"* + tên chúng, và câu hỏi kèm theo — *hành động ở `cmd` có đổi được đại lượng đang lái
   mục đó không?*

**Vì sao ở doctor, không ở `rituals`:** một nghi thức canh các nghi thức khác rơi vào chính cái
bẫy nó canh — nó đỏ khi có mục đỏ lâu, mà mục đỏ lâu thường là mục *không tắt được*, nên nó
cũng không tắt được. Doctor không in ở mỗi phiên nên không có bề mặt gây nhiễu.

**Vì sao snapshot, không phải sổ append:** rủi ro lớn nhất của cơ chế này là **chính nó thành
bộ đếm không đóng được**. Một snapshot O(1) không thể: mọi phán quyết đọc `since` (mốc TỰ ĐẶT
LẠI) chứ không đọc một tổng tích luỹ, và nghi thức bị xoá mang theo dòng của nó.

**Hai chi tiết là phần chịu lực, không phải trang trí:**

- `dueDays` đo từ `lastRunAt`, **không** từ `now`. Ngừng chạy `rituals` hai tháng thì con số
  phải đứng yên — nó là số ngày ĐÃ QUAN SÁT thấy đỏ. Cùng lý do `tallyLines()` có `sinceMs`.
- `okRuns === 0` là **điều kiện**. Một mục đỏ 30 ngày mà tháng trước còn xanh là *việc của bạn
  đang tồn*; một mục chưa xanh lần nào trong cả quãng quan sát là *tín hiệu không có trạng thái
  tắt*. Gộp hai thứ đó thì cảnh báo nổ với người vừa nghỉ phép hai tuần, và `L0002` nói chính
  xác chuyện gì xảy ra tiếp theo.

**Vì sao không dùng dạng rẻ hơn (1, 2, 5, 6):**

- Dạng `5` (gotcha một dòng) và `6` (skill) **đã thử và đã thất bại có bằng chứng**: W32 §1
  viết ra đúng bài học này, và `rituals.mjs:99-102` cũng viết ra đúng bài học này — cả hai nằm
  **trong file bị vi phạm**, cách chỗ vi phạm 40–380 dòng.
- Dạng `1` (test tất định) không biểu diễn được mệnh đề *"tồn tại trạng thái cho `ok`"* trên
  một hàm nhận snapshot tuỳ ý: đó là bài toán không quyết định được. Nên phải đo THẬT. Phần
  biểu diễn được bằng test **đã** được viết (`stuckRituals` có bảng ca), nhưng nó khoá phép đo,
  không khoá tính chất.

**Giới hạn đã đo, không phải giả định:** sổ gộp hai môi trường vào một dòng lịch sử —
`claude-code-drift` ra `ok` từ terminal (`CLAUDE_CODE_EXECPATH` có mặt) và `?` từ hook (không
có), nên `since` của nó đảo mỗi lượt và nó không bao giờ tích đủ 14 ngày. Chấp nhận: lớp bệnh
cần bắt ra `due` ở **mọi** môi trường (`flat-limited`, `fixlogTotal` — cả hai đo trên file
trong repo). Hỏng theo chiều **bỏ sót** một cảnh báo, không theo chiều bịa ra một cảnh báo.

## Chuyển đi được không

`universal`. Xoá repo này thì mệnh đề *"một cảnh báo luôn bật không phân biệt được với một cảnh
báo không tồn tại"* vẫn đúng ở mọi nơi có bảng tín hiệu — CI dashboard, lint warning, backlog
tự động, health check. Phép kiểm mang theo được vì nó không giả định gì về nghi thức: nó chỉ
cần một danh sách `{id, state}` và một chỗ ghi.

Cái **không** mang đi được là con số 14 ngày. Nó là nhịp của repo này (SessionStart mỗi ngày
làm việc); repo chạy tuần một lần cần cửa sổ khác. Tham số hoá sẵn ở `stuckRituals(snap, {days})`.
