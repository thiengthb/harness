# Learnings — tuần W33, thiengthb (retro 2026-08-12)

<!-- ĐỀ XUẤT, chưa phải harness. DRI quyết định promote → /knowledge-promote. -->

Retro này có **một** phát hiện chính, và giá trị của nó không nằm ở chỗ nó mới — nó **không
mới**. `2026-W32-so-khong-bao-gio-dong-duoc.md` §1 đã mô tả đúng bệnh này năm ngày trước, đề
xuất cơ chế hai nửa, và **một nửa đã được xây**. Tuần này bệnh tái phát **ba lần**, và nửa còn
thiếu chỉ bắt được **một** trong ba.

---

## 1. Một tín hiệu "TỚI HẠN" phải được lái bởi đại lượng mà HÀNH ĐỘNG NÓ ĐỀ NGHỊ làm thay đổi

**Lần xuất hiện** (3 lần độc lập tuần này, cùng một hàm hoặc cách nhau 40 dòng):

- **v2.61.0 / PR #174** — `flat-ok` treo vào `b.measured`, một cờ chỉ có nghĩa với gói
  metered. Người dùng gói phẳng **không bao giờ gõ `--usd`** (v2.61.0 sinh ra để họ khỏi
  cần), nên sổ USD mãi rỗng, nên mục đỏ vĩnh viễn dù họ làm đúng mọi thứ.
- **#180 / PR #181 (v2.63.0)** — `flat-limited` bật khi `rateLimitHits > 0`. Đo:
  **19 lần chạm** trong cửa sổ trượt 30 ngày ⇒ đỏ mỗi SessionStart suốt 30 ngày, và **hành
  động mà chính nó yêu cầu** (`chạy capo-report`) không đổi con số đó.
- **#182 / PR #183 (v2.64.0)** — `fixlogTotal >= 10` là ngưỡng đặt trên một con số **chỉ
  tăng**; sổ chỉ biết ghi thêm. Qua mục thứ 10 là đỏ vĩnh viễn. Cách `flat-limited`
  **40 dòng** trong cùng file.

Cộng tổ tiên W32 §1 (`/harness-propose` đỏ vì đếm mọi dòng từng có) thì đây là **lần thứ tư**
trong hai tuần.

**Lớp lỗi:** `verification` — không phải `state`. W32 xếp nó vào `state` ("sổ giữ sự thật đã
cũ"), và **chính chỗ xếp loại đó làm bản vá đi lệch**: nếu bệnh là sổ cũ thì thuốc là TTL và
nút đóng. Hai thứ đó đã xây. Bệnh vẫn tái phát ba lần.

### Vì sao nửa cơ chế đã xây KHÔNG cứu được

W32 §1 đề xuất hai nửa:

| nửa | trạng thái hôm nay |
|---|---|
| `telemetry --close` + `openTelemetryEntries()` một cửa cho mọi bên đọc | **ĐÃ XÂY** — `lib/harness.mjs:2281+`, `rituals --close`, có ca test |
| **Hợp đồng**: mọi bộ đếm lái tín hiệu tới hạn phải khai `window: <ngày>` hoặc `closable: true` | **CHƯA XÂY** — `grep -rn closable tooling/ .claude/` ⇒ **2 kết quả, cả hai nằm trong chính file W32 đó** |

Và đây là phần đáng đọc nhất của retro này: **kể cả nếu nửa hợp đồng đã được xây, nó chỉ bắt
được 1 trong 3 ca tuần này.**

- `#182` (`fixlogTotal`) — bộ đếm đời, không window, không closable ⇒ **hợp đồng BẮT được**.
- `#180` (`rateLimitHits`) — **có** `window: 30` ⇒ hợp đồng cho qua. Nhưng nó vẫn đỏ vĩnh
  viễn, vì cửa sổ trượt trên một tín hiệu bạn còn tiếp tục sinh ra thì **không bao giờ cạn**.
- `v2.61.0` (`b.measured`) — là một cờ boolean, không phải bộ đếm ⇒ **ngoài phạm vi hợp đồng**.

Nói cách khác: `window` và `closable` là **hai cách đạt tới** tính chất cần có, không phải
tính chất đó. Tính chất thật:

> **Tồn tại một trạng thái mà check này trả `ok`, và trạng thái đó tới được bằng một hành
> động nằm trong tay người đọc — cụ thể là hành động ghi ở `cmd`.**

Bản vá #180 không phải thêm window hay nút đóng. Nó **đổi thứ được đo**: từ *"bạn đã chạm
trần bao nhiêu lần"* (quá khứ, không hành động được) sang *"bạn đã đo tỉ lệ chưa"* (hiện tại,
hành động được). Con số 19 vẫn ở đó và vẫn được in — nó chỉ thôi lái màu.

**Dạng biểu diễn đề xuất:** `3` (computational control), và **đo THAY VÌ khai**.

Bắt một khai báo (`clearedBy:`) là dạng `7` trá hình: người viết ritual mới sẽ điền một câu
nghe hợp lý, và không gì kiểm được câu đó. Thứ kiểm được là **lịch sử**:

1. `rituals.mjs` ghi một dòng telemetry mỗi lần chạy: `ts | ritual-id | state`. Nó **đã chạy
   mỗi SessionStart**, nên nguyên liệu là miễn phí — đây là tầng CAPTURE, không phải cơ chế mới.
2. `harness-doctor.mjs` (chứ **không** phải `rituals`) thêm một dòng: *"N nghi thức `due` liên
   tục ≥14 ngày với **0** lần `ok`"* + tên chúng.

**Vì sao đặt ở doctor, không đặt ở `rituals`:** một nghi thức canh các nghi thức khác sẽ tự
rơi vào chính cái bẫy nó canh — nó đỏ khi có mục đỏ lâu, và mục đỏ lâu thường là mục **không
tắt được**, nên nó cũng không tắt được. Doctor chạy **theo yêu cầu**, không in mỗi phiên, nên
nó không có bề mặt để gây nhiễu. Đây là cùng lý do W32 §3 bắt buộc canary trước khi cắm hook.

**Câu chữ phải là câu HỎI, không phải kết luận.** *"14 ngày liên tục đỏ, 0 lần xanh"* là một
số đo; *"nghi thức này hỏng"* là một suy diễn — và nó sai với người vừa nghỉ phép hai tuần.
`knowledge/lessons/0002` áp thẳng vào đây.

**Vì sao không dùng dạng rẻ hơn:**

- Dạng `5` (gotcha một dòng) và `6` (skill) **đã thử và đã thất bại có bằng chứng**: W32 §1
  viết ra đúng bài học này, `rituals.mjs:99-102` viết ra đúng bài học này, và cả hai nằm
  **trong file bị vi phạm**, cách chỗ vi phạm 40–380 dòng.
- Dạng `1` (test tất định) không biểu diễn được: *"tồn tại trạng thái cho `ok`"* trên một
  hàm nhận snapshot tuỳ ý là bài toán không quyết định được. Nên phải đo THẬT.

**Tầng:** project → `universal` sau ~30 ngày có dữ liệu.
**Scope:** `universal`. Xoá repo này thì *"một cảnh báo luôn bật không phân biệt được với một
cảnh báo không tồn tại"* vẫn đúng ở mọi nơi có bảng tín hiệu.

**Thang độ trễ:** ghi ở SessionStart (~ms, một dòng append); đọc ở `harness-doctor` (~phút,
chạy theo yêu cầu). **Không** đặt ở `Stop`: nó không nói gì về lượt vừa rồi.

**Chi phí bảo trì:** thấp. Một sổ append-only nữa trong `telemetryDir()`. Rủi ro chính là
**sổ này cũng thành bộ đếm không đóng được** — nên nó phải có cửa sổ đọc (14 ngày) ngay từ
đầu, không thêm sau.

**ĐIỀU KIỆN THOÁT:** 30 ngày liên tục không nghi thức nào chạm ngưỡng ⇒ hoặc bệnh đã hết,
hoặc ngưỡng sai; xét lại lúc đó. Và nếu `rituals` có ngày chuyển sang máy trạng thái khai báo
(mỗi mục khai rõ điều kiện chuyển trạng thái) thì phép đo hậu nghiệm này thành thừa.

---

## 2. Mutant sống sót: hỏi "fixture có ĐI TỚI nhánh đó không" TRƯỚC khi nghi ngờ neo

**Lần xuất hiện** (2 lần, hai nguyên nhân KHÁC nhau — và đó là điểm):

- **PR #170 (2026-08-11)** — mutant sống vì **neo rộng hơn thứ nó khoá** (nguyên nhân ③):
  `/hạ tầng/` quét cả `r.out`, trong khi dòng cần khoá là một dòng cụ thể.
- **PR #183 (2026-08-12)** — mutant M5 sống vì **fixture không tới được nhánh** (nguyên nhân
  ①): ca test neo đúng, nhưng fixture có 3 mục còn nhánh bị đột biến là `>= 10`. Nó **chưa
  bao giờ chạy**.

Sau lần ③ tuần trước, phản xạ mới của tôi là *"chắc lại neo rộng"* — và lần này sai. Câu hỏi
tách hai nguyên nhân trong một bước, rẻ hơn mọi cách khác: **"fixture có đi tới nhánh bị đột
biến không?"** Nhánh có ngưỡng/điều kiện hiếm thì mặc định là **không**.

**Lớp lỗi:** `verification`.
**Dạng biểu diễn:** `5` — một dòng trong header `mutate()` ở `tooling/test-hooks.mjs`, ngay
cạnh ba bẫy đã khai ở đó. **Không** đề xuất cơ chế: đã ĐẾM trước khi đề xuất (W32 dạy đúng
điều này) — 2 lần, hai nguyên nhân khác nhau, chưa thành hình dạng lặp lại.
**Scope:** `universal`.
**ĐIỀU KIỆN THOÁT:** nếu suite có báo cáo độ phủ theo nhánh, câu hỏi này trả lời được bằng
máy và dòng nhắc thành thừa.

---

## Đề xuất CẮT BỎ (bắt buộc)

**CẮT: ngưỡng `≥10 lần/tuần` trong `fixlog --list`** — hoặc chính xác hơn, **cắt mẫu số của
nó**. Nó đếm **mọi** mục trong 7 ngày, kể cả mục đã `--close` và (từ v2.64.0) đã `--track`.

Đo hôm nay: `⚠️ ≥10 lần/tuần` bật với **11 mục**, trong đó **5 mục thuộc nhóm đã đóng từ
2026-08-07** (`dcg` khớp chuỗi, sửa tận gốc ở v2.36.0) và **4 mục thuộc hai nhóm đã có địa
chỉ** (#177, #160). Số mục thật sự chưa xử: **2**.

Đây là **đúng bệnh của §1, trong chính công cụ mà §1 đi sửa** — và tôi đã sửa nó ở `rituals`
(#182, `fixlogOpen`) mà **không sửa ở `fixlog --list`**, tức lặp lại y hệt lỗi W32 §1: vá một
chỗ, để lại chỗ bên cạnh. Ghi ra đây thay vì vá ngay là cố ý — nó thuộc lô của §1, không phải
một lô riêng.

**XÉT rồi GIỮ** (ghi lại để lần sau khỏi xét lại):

- `--close` sau khi có `--track` — **giữ**. Hai lệnh khai hai điều khác nhau; gộp là quay về
  điểm xuất phát của #182.
- `flat-limited` sau khi có `flat-capo` — **giữ**. Nó là trạng thái *"chạm trần mà chưa ai
  soi"*, mặc định của mọi repo mới.
- 7 bài học trong `knowledge/lessons/` — **giữ cả 7**, không cái nào quá `expires-review`.
  Tuần trước đã chứng minh cách rẻ hơn: L0006 được **mở rộng thành hai chiều** thay vì thêm
  L0008. Số bài học phẳng trong khi độ phủ tăng.

---

## Ba con số (bước 6)

| Chỉ số | Số | Xu hướng |
|---|---|---|
| sửa tay / tuần (`fixlog`, 7 ngày) | **11 ghi nhận — nhưng chỉ 2 chưa xử** | xem ghi chú |
| kích thước harness (vs baseline 2026-08-05) | AGENTS.md −7 · rules +20 · skills +35 · hooks +1 (+181 dòng) · lessons +4 | **PHÌNH** ✗ |
| PR revert trong 7 ngày | **0** / 120 commit | ✓ |

**Con số thứ nhất vẫn không đáng tin, và lần này theo chiều NGƯỢC với W32.** Tuần trước nó
thấp giả vì **quên ghi**; tuần này nó cao giả vì **đếm cả việc đã xong**. Cùng một con số, hai
chế độ hỏng đối nghịch, trong hai tuần liên tiếp — đó là dấu hiệu con số này cần một mẫu số
được định nghĩa, không phải một ngưỡng được chỉnh.

**Con số thứ hai là con số đáng lo.** Harness PHÌNH trong khi tuần này không thêm hook, không
thêm rule — phần tăng là `skills +35` (bước 5 của `/harness-retro`, +11 dòng) và tồn dư từ
tuần trước. `knowledge/README.md` nói xu hướng tốt là **phẳng hoặc giảm**; hai tuần liên tiếp
tăng thì lần promote tới **bắt buộc** kèm một mục cắt thật, không phải một mục "xét rồi giữ".

---

## Nguồn thứ hai: auto-memory (bước 1)

Không có mâu thuẫn mới với `knowledge/lessons/`. Một mục được **cập nhật tại chỗ** thay vì
thêm mới: `mutant-song-sot-co-ba-nguyen-nhan` nay có mẫu vật của nguyên nhân ① (§2 trên) và
câu hỏi tách ①/③. Đó là cách đúng — thêm một memory thứ hai về cùng chủ đề là tạo hai chỉ thị
cho một sự thật, đúng thứ `AGENTS.md` gọi là LỖI.
