---
id: L0005
title: Một bộ đếm không phân biệt được hai trạng thái sẽ đổ về phía DỄ CHỊU — và mẫu số bằng 0 làm mọi tỉ lệ thành 100%
scope: universal
class: verification
representation: computational-control
status: active
owner: "@ai"
added: 2026-08-07
expires-review: 2026-11-07
occurrences: 6
evidence:
  - "PR #33 (v2.16.0) — `fixlogKey` gom fixlog theo TỪ VỰNG (từ đầu dòng), nên 3 mục cùng một cái gác nằm ở 3 nhóm rời; ngưỡng promote `≥2 lần` không bao giờ đạt, và `/harness-retro` đọc ra là 'chưa có gì lặp lại'"
  - "PR #49 (v2.22.0) — `harness.version` lệch changelog: repo con bị đóng dấu một version, nhận code một version khác, và `consumers.mjs` báo độ lệch NHỎ HƠN sự thật"
  - "PR #64 (v2.24.0) — `evals/run.mjs` báo 40% trên một harness không hỏng: cả ba FAIL đều là *chưa đo được* (placeholder `CHANGEME` đem chạy như lệnh, assertion chấm output của agent mà không agent nào chạy, `> /dev/null` không tồn tại trên cmd.exe). 'Chưa đo' đổ về FAIL"
  - "PR #69 (v2.26.0) — `sakubun-single-user` ship thật với `features/` RỖNG; `check-feature-integrity`, gate `preMerge` và `/verify-ui` đều lặp qua `features/*.json` ⇒ tập rỗng ⇒ XANH. Mẫu số 0 làm mọi tỉ lệ xác minh thành 100%"
  - "PR #70 (v2.27.0) — BA công cụ đếm 'pack chờ quyết' theo ba định nghĩa; pack `lessons: []` làm `harness-doctor` nói '3 pack, quyết đi' trong khi `accept.mjs --list` nói 'Không có gì'. Người tin cái nói không-có-gì, và 20 mục fixlog nằm đó mãi"
  - "PR #71 (v2.28.0) — `budget.monthlyUsdCap` là field ma: nơi duy nhất đọc nó chỉ nói '= 0'. Nối vào số đo mà không tách trạng thái 'khai trần nhưng CHƯA ĐO' thì bản vá còn TỆ HƠN field ma — nó biến một con số không làm gì thành một dấu tick xanh"
artifacts:
  - "tooling/lib/harness.mjs — `verificationCoverage()` 5 trạng thái, `coordinationLayer()` 4, `budgetStatus()` 6, `packPending()`/`packMaterial()`, `readPacks()` trả `null` ≠ `[]`. Mọi phán đoán là hàm THUẦN, tách khỏi phần đọc đĩa, để test khẳng định thẳng vào nó"
  - "tooling/rituals.mjs — hợp đồng BA GIÁ TRỊ `due`/`ok`/`?`; bản ngắn NÊU TÊN mục `?` chứ không chỉ đếm"
  - "tooling/gates.mjs — `n/a KHÔNG có lệnh → gate này không tồn tại, dù nó nằm trong config`; `subagent: KHÔNG đo được độ trễ — 0ms ở đây là 'không có gì chạy', không phải 'nhanh'`"
  - "evals/run.mjs — cờ `measured`: task `n/a` ra khỏi MẪU SỐ thay vì tính 0 điểm; in `naCount` riêng"
  - "tooling/test-hooks.mjs — bảng ca cho từng hàm phán đoán, mỗi bảng bắt buộc có ít nhất một ca 'không đo được' và một ca miễn trừ theo vai"
evals:
  - "evals/tasks/0006-chua-do-khong-phai-on.md"
exit-condition: "Khi mọi hàm phán đoán trong `tooling/lib/harness.mjs` được sinh ra từ một kiểu tổng có sẵn trạng thái `unknown` bắt buộc — tức khi *quên* trạng thái thứ ba trở thành lỗi biên dịch chứ không phải một dòng xanh. Lúc đó bảng ca trong `test-hooks.mjs` thành thừa và bài học này retire."
---

## Triệu chứng

Một phép đo trả về hai giá trị cho ba trạng thái. Trạng thái thứ ba — **chưa đo được** —
không có chỗ đứng, nên nó bị nhét vào một trong hai cái kia. Nó **luôn** bị nhét vào phía
dễ chịu hơn cho người viết phép đo:

| công cụ | ba trạng thái thật | bị gộp thành |
|---|---|---|
| `evals/run.mjs` | pass · fail · **chưa đo** | fail (40% trên harness không hỏng) |
| `check-feature-integrity` | đủ · thiếu · **không có feature nào** | đủ (100%, mẫu số 0) |
| `harness-doctor` pack | chờ · xong · **thư mục rỗng** | chờ, còn `accept.mjs` gộp thành xong |
| `budget` | dưới trần · vượt trần · **chưa từng đo** | (chưa có mục nào — field không ai đọc) |
| `fixlogKey` | cùng nhóm · khác nhóm · **không so được** | khác nhóm ⇒ không nhóm nào đạt ngưỡng |

Hai chiều gộp đều hỏng, nhưng **không đối xứng**. Gộp về FAIL sinh ra tiếng ồn, và tiếng ồn
được điều tra. Gộp về PASS sinh ra một dấu tick xanh, và **không ai đi điều tra một dấu tick
xanh**. Chiều nguy hiểm là chiều im lặng.

Biến thể riêng, đáng gọi tên vì nó không trông giống lỗi: **mẫu số bằng 0**. Mọi cơ chế lặp
qua một tập rỗng đều trả về "không có vấn đề". Một repo ship thật với `features/` rỗng đọc ra
giống hệt một repo có mọi feature đã xác minh.

## Nguyên nhân

`class: verification`. Người viết phép đo biết rõ cả ba trạng thái tồn tại — bằng chứng là
comment ngay tại chỗ thường đã nói ra điều đó. Nhưng **kiểu dữ liệu** chỉ có hai chỗ ngồi
(boolean, hoặc một con số mà `0` mang hai nghĩa), nên trạng thái thứ ba không có nơi để đi.

Nó không tự lộ ra vì đúng cái phép đo đó là thứ đáng lẽ phải phát hiện nó. Công cụ đo tự
làm nhiễu số của mình, rồi báo cáo con số đã nhiễu như một kết luận.

## Cơ chế

**Trạng thái thứ ba phải là một giá trị, không phải một sự vắng mặt.**

1. **Ba giá trị tối thiểu, thường là bốn hoặc năm.** `due` / `ok` / `?`, cộng `n/a` (không áp
   dụng theo cấu trúc) và `skip`. `n/a` khác `?`: một cái nói *"câu hỏi này không có nghĩa ở
   đây"*, cái kia nói *"tôi chưa nhìn"*. Gộp chúng làm mất chính xác thông tin đắt nhất.

2. **Phán đoán là hàm THUẦN, tách khỏi phần đọc đĩa.** `collect()` đọc, `evaluate()` quyết.
   Nếu không tách, test phải dựng một repo giả cho mỗi ca — và ở repo đích trạng thái git là
   của HỌ, nên suite sẽ đỏ theo cách không ai sửa được (xem [[0003-self-test-gia-dinh-repo-cua-no]]).

3. **Mỗi hàm phán đoán có một BẢNG CA trong test suite**, và bảng bắt buộc chứa:
   - một ca "không đo được" ⇒ phải ra `?`, **không** ra `ok`;
   - một ca miễn trừ theo VAI (`role === 'template'`) — thiếu vế này thì cảnh báo đỏ vĩnh
     viễn trong repo template về một việc template không được làm;
   - một ca vai LẠ (`role === 'unknown'`) ⇒ **không** được miễn. Miễn trừ theo vai mà nhận
     cả vai không nhận diện được là một cửa thoát mở im lặng.

4. **`null` ≠ `[]`.** Hàm đọc thư mục trả `null` khi không đọc được và `[]` khi rỗng. Gộp
   chúng là cách một mục tới hạn thật biến thành một dòng xanh.

5. **Mọi dòng `ok` phải mang SỐ ĐO.** Một dòng xanh không kiểm được thì bị bỏ qua, và khi nó
   sai không ai biết.

Vì sao không dùng dạng rẻ hơn: đây là tính chất của **giá trị trả về**, không phải của văn
bản. Một dòng tài liệu *"nhớ xử lý ca chưa-đo"* là đúng thứ đã thất bại sáu lần — trong ít
nhất ba lần, comment cạnh đó đã nói ra vấn đề rồi mà code vẫn gộp hai trạng thái.

## Chuyển đi được không

`universal`. Nó không nói gì về ngôn ngữ, stack, hay lĩnh vực — nó nói về **hình dạng của một
phép đo**. Mọi repo có dashboard, gate, hay báo cáo tỉ lệ đều có chỗ cho nó, và mọi repo mới
bắt đầu với mẫu số bằng 0 ở mọi thứ.

Xoá repo này đi thì mục này vẫn còn giá trị — đó là phép thử của `knowledge/README.md`, và
nó qua.

Liên quan: [[0002-guard-ban-nham]] (guard bắn nhầm là cùng họ: một phép phân loại không phân
biệt được hai ca), [[0004-gac-hong-thi-phai-chan]] (một cái gác crash đọc GIỐNG HỆT một cái
gác đang làm việc — đó chính là bài học này ở tầng hook).
