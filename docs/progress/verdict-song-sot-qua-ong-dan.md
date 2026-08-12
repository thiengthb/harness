# Một lần kiểm hỏng mà không để lại dấu nào sống sót qua ống dẫn

không có issue — ra từ mục `fixlog` 2026-08-11 · branch: `fix/verdict-song-sot-qua-ong-dan` · platforms trong scope: n/a

## Phát hiện

Mục cuối trong sổ `fixlog` tự gọi tên lớp lỗi của nó:

> *"doc ket qua harness-doctor qua ong dan grep nen nuot mat exit code 1: hai check ĐỎ
> (entropy-scan, apply-to --audit) di qua ma khong ai thay — **dung lop loi da co trong bo nho**"*

Đo lại 2026-08-12, và nó không phải chuyện đọc ẩu:

```
node -e '…; process.exit(3)' | tail -1     →   pipeline_exit=0
```

Ống dẫn trả mã của tiến trình **CUỐI**. Nên `| tail` / `| grep` nuốt exit code, và nuốt luôn
mọi dòng stdout không lọt bộ lọc. Rồi quét mã nguồn:

| file | verdict exit | `console.error` |
|---|---|---|
| `test-hooks.mjs:4800` | `exit(fail.length ? 1 : 0)` | **0** |
| `harness-doctor.mjs:1016` | `exit(blockers…? 1 : 0)` | **0** |

Một lần chạy `test-hooks` HỎNG ghi ra stderr **đúng không dòng nào**. Mọi dòng `FAIL` đi ra
stdout. Nên đây không phải "tôi đọc cẩu thả": công cụ không hề có một kênh nào sống sót qua
một bộ lọc đặt lên stdout. Đọc qua ống dẫn là chế độ dùng bình thường, và ở chế độ đó công cụ
**không phân biệt được với một lần chạy sạch**.

## Vì sao stderr, chứ không phải "in FAIL ở cuối cho dễ thấy"

stderr không đi qua ống dẫn — nó ra thẳng terminal. Đo cả bốn cách gọi:

```
$ node probe.mjs | grep "OK"
✗ PROBE ỐNG DẪN — 1 FAIL      ← stderr, KHÔNG lọc được
  OK   một mục đạt             ← thứ trước đây đọc được, và nó đọc như XANH
pipeline_exit=0                ← vẫn bị nuốt, và sẽ LUÔN bị nuốt
```

Ca `| grep "OK"` là ca 2026-08-11 nguyên vẹn. Exit code thì không cứu được từ trong tiến trình
— nhưng lần hỏng thì không còn im lặng được nữa.

Mọi cách khác đều thua ở đúng chỗ này: in đậm hơn, in ở cuối, in bảng tổng kết — tất cả đều là
stdout, tất cả đều bị `| head -40` hoặc `| grep X` xoá.

## Đã làm

| # | Thay đổi | File |
|---|---|---|
| 1 | `verdictLine()` THUẦN + `emitVerdict()` (ghi stderr, tiêm được hàm ghi) | `lib/harness.mjs` |
| 2 | `report()` gọi `emitVerdict` — **4 script thừa hưởng, không sửa dòng nào** | `lib/harness.mjs` |
| 3 | 3 entrypoint không đi qua `report()` gọi thẳng | `test-hooks` · `test-evals` · `harness-doctor` |
| 4 | 23 khẳng định + hai hợp đồng quét toàn `tooling/**` và `.claude/hooks/**` | `test-hooks.mjs` |
| 5 | `report(…, { verdict: false })` cho bảng nghi thức | `lib/harness.mjs` · `rituals.mjs` |

Quét được 27 file có `process.exit` khác 0; **7 file không có đường ra stderr nào**. 4/7 chỉ
cần sửa `report()` (`check-feature-integrity`, `init`, `knowledge/lint`, `test-migrations`).

### `code` là sự thật, KHÔNG phải `fail`

`harness-doctor` **cố ý** exit 0 khi chỉ có mục ĐỎ không chí tử. Nếu `verdictLine` kêu theo
`fail.length` thì nó kêu ✗ trên một lần chạy đạt — guard bắn nhầm, `L0002`. Nên khi bên gọi
đưa `code`, `code` quyết định; `fail`/`unknown` chỉ là nội dung câu.

### `unknown` nêu RIÊNG

`1 FAIL · 2 CHƯA ĐO ĐƯỢC`, không phải `3`. Gộp hai cái là đúng phép gộp `AGENTS.md` cấm, và
`report()` đã có sẵn ba trạng thái đó.

### Chiều B: một dấu ✗ GIẢ còn tệ hơn không có dấu nào

Suýt ship. `rituals.mjs --all` đổ nghi thức **tới hạn** vào rổ `fail` rồi `process.exit(0)` có
chủ ý — rổ đó ở đó nghĩa là *"việc đang tới hạn"*, không phải *"lần chạy này hỏng"*. Với
`report()` tự kêu, **mỗi phiên có việc tới hạn sẽ in một dấu ✗ trên một lần chạy ĐẠT**. Một
dấu ✗ thường trực bị học cách bỏ qua trong một tuần, và nó kéo theo cả những dòng ✗ thật — tức
lô này sẽ tự phá đúng thứ nó dựng lên. Chiều B của `L0007`, và nó chỉ lộ ra khi đi đếm xem
những ai gọi `report()` nhiều hơn một lần.

Chữa bằng `report(…, { verdict: false })` tại đúng một chỗ, cộng **hai khẳng định mới** (probe
`verdict:false` phải im hẳn; `rituals.mjs` phải THẬT SỰ truyền cửa đó) bên cạnh probe mặc định
đã có sẵn. Vế thứ hai là vế chịu lực: không có nó, hai vế kia chỉ chứng minh một tính năng
không ai gọi.

### Chỉ in khi HỎNG

Một dòng "xanh" mỗi lần chạy sẽ được học cách bỏ qua trong một tuần, và lúc đó dòng ĐỎ chìm
theo. Đây là lý do duy nhất khiến `emitVerdict` trả `null` thay vì in `✓`.

## Rồi hợp đồng đó tự tìm ra lỗ thứ hai, lớn hơn

Hợp đồng phải hỏi *"file này có `process.exit` khác 0 thật không"*, nên nó chạy trên
`codeOnly(src, { blankStrings: true })`. Và nó **không thấy `harness-doctor.mjs`** — đúng cái
file vừa vá. Đo:

```
lastIndexOf('process.exit') trong bản đã blank của harness-doctor.mjs  =  -1
```

Câu cuối của file biến mất. Docstring của `codeOnly` có tự khai một chỗ hở — *"regex literal
chứa `//` hoặc `/*`"* — kèm câu **"chưa gặp trong repo này; gặp thì thêm ca test trước, đừng
thêm nhánh trước."** Đo ra **ba** biến thể, cả ba đều đang ở trong repo:

| | chỗ | cái xảy ra |
|---|---|---|
| ① | `harness-doctor.mjs:703` `/['"]\.claude\/hooks(['"\/])/` | `'` mở một chuỗi không bao giờ đóng ⇒ **70% file bị xoá** dưới `blankStrings`; `native-surface.mjs:92` mất **86%** |
| ② | `apply-to.mjs` · `init.mjs` · `check-feature-integrity.mjs` | regex kết thúc `\//` đọc thành `//` ⇒ máy quét **xoá nốt phần còn lại của DÒNG** |
| ③ | `knowledge/export.mjs:126` | template LỒNG trong `${…}`: backtick MỞ của template trong bị đọc là backtick ĐÓNG của template ngoài ⇒ mọi cặp nháy sau đó lệch một nhịp |

Một hậu quả chung: bên gọi hỏi *"có khớp không"*, nhận KHÔNG-KHỚP, và **không-khớp đọc y hệt
không-có**. `codeOnly` là cửa duy nhất của mọi phép kiểm *"file X có GỌI Y không"*, nên đây là
lỗ nằm dưới nhiều check cùng lúc, trên `main`, từ trước lô này.

### Sửa: một máy trạng thái, không phải một nhánh nữa

Nhánh regex literal (có phân biệt regex với phép chia bằng token ngay trước, và xuống dòng ⇒
phép chia), cộng xử lý `${…}` bằng ngăn xếp — ruột `${…}` là **code**, nên nó được GIỮ cả khi
`blankStrings`: `${repoPath('x')}` là một lời gọi thật, không phải một câu văn.

Và `codeScanDesync()`: một file JS hợp lệ không bao giờ kết thúc giữa một chuỗi, nên
"kết thúc trong chuỗi" là **bằng chứng** lệch, không phải suy đoán. Mọi bên gọi `blankStrings`
đều nên hỏi câu đó, vì ở chế độ ấy một lần lệch không làm sai kết quả — nó xoá phần còn lại
của file.

### Đối chiếu từng byte trước khi tin

```
50 file · 37 GIỐNG HỆT · 13 khác
```

13 file khác đều là bản CŨ sai, theo cả hai chiều: ② xoá mất code thật, ①/③ giữ lại comment
thật như thể là code. Bản đầu của tôi còn bỏ luôn dòng `#!/usr/bin/env node` — **đã rút lại**:
`/usr/` đi qua nhánh regex và nhả ra nguyên văn nên vô hại, còn bỏ nó thì đổi output của 40+
file mà không sửa được gì. Trong một hàm dùng chung, thay đổi không cần thiết là rủi ro không
cần thiết.

## Hợp đồng, chứ không phải quy ước

Test quét **mọi** `tooling/**/*.mjs`: file nào exit khác 0 được thì phải có đường ra stderr
(`console.error` · `process.stderr.write` · `emitVerdict` · gọi `report`). Một script mới hỏng
im lặng làm suite ĐỎ, thay vì chờ ai đó nhớ quy ước.

Hai chi tiết giữ cho hợp đồng không tự bắn mình:

- Quét trên `codeOnly(src, { blankStrings: true })`. `test-evals.mjs` nhét hàng chục
  `process.exit(1)` vào **chuỗi** (lệnh của task giả); một phép quét đọc cả ruột chuỗi sẽ đòi
  stderr từ file chỉ *nhắc tới* exit. Hàm này đã có sẵn, và chú thích của nó ghi đúng ca hỏng
  từng xảy ra khi ai đó tự viết bản strip bằng regex (nuốt 89% `rituals.mjs`).
- **Sàn neo vào FILE PHẢI CÓ, không vào một CON SỐ.** Một phép quét đọc nhầm thư mục trả 0 file
  và báo XANH — đúng lớp lỗi đang sửa, nên nó phải có sàn. Nhưng sàn kiểu `seen >= 40` là ca
  `L0003` kinh điển: số file `tooling/` ở repo con KHÁC template (`apply-to` cố ý không ship
  `cli.mjs`), nên một con số đo ở template sẽ đỏ ở nơi khác — chính chế độ hỏng mà chú thích
  `RATCHET` kể (v2.8.0, đỏ ở CẢ BA repo tiêu thụ ngay lần phát hành).
  Mỏ neo đắt nhất là **`harness-doctor.mjs`**: nó chính là file máy quét cũ giấu đi. Máy quét
  lệch lại ⇒ nó rơi khỏi danh sách ⇒ dòng kiểm ĐỎ đúng tên nó. Neo này đã được chứng minh có
  cắn, bằng chính phép đo bản cũ: dưới `blankStrings`, `harness-doctor.mjs` cho **0** lời gọi
  `process.exit` khác 0 — đúng điều kiện `lost`.

## Bằng chứng

```
node tooling/test-hooks.mjs   → exit 0 · 258 khẳng định · 0 FAIL   (sàn 206 → 258)
  PASS  verdictLine        `code` là SỰ THẬT chứ không phải `fail` (doctor cố ý exit 0)
  PASS  report()           một dòng ✗ ra stderr khi FAIL — sống sót qua `| tail` / `| grep`
  PASS  codeOnly           ①/②/③ ba biến thể lệch · phép CHIA không bị đọc thành regex
  PASS  codeScanDesync     50 file, 0 lệch
  PASS  hợp đồng verdict   27 entrypoint exit≠0, tất cả có đường ra stderr

node probe.mjs | grep "OK"    → ✗ PROBE ỐNG DẪN — 1 FAIL  (stderr, giữa output đã lọc)
node probe.mjs > /dev/null    → ✗ PROBE ỐNG DẪN — 1 FAIL  ·  exit=1
```

## Tiện thể: sàn của suite đã tụt lại 29 ca từ TRƯỚC lô này

`main` chạy 235 khẳng định với `RATCHET = 206`. Sàn tồn tại để thấy một ca **ngừng chạy**; tụt
29 nghĩa là 29 ca có thể biến mất mà không ai thấy. Chú thích ngay trên nó đã ghi đúng chế độ
hỏng này (2026-08-08, đo `195/195` với sàn 185) — và nó lặp lại. Sàn giờ là **258**, khớp tổng
thật. Cùng họ với mọi thứ trong lô này: một phép đo còn chạy, nhưng thôi đo cái nó sinh ra để đo.

## Không bump version — quyết định, không phải quên

`2.68.0`–`2.71.0` đang bị bốn PR mở giữ chỗ (#190–#193). Bump ở đây tạo hai `2.68.0`, hoặc làm
`harness.version` trên main **đi lùi** khi stack merge sau. Lô này đi kèm lần bump kế tiếp —
cùng lý do và cùng cách xử lý với #194.

## Ứng viên promote (chưa đủ điều kiện, ghi ra để không mất)

Lớp lỗi *"phép đo chưa xảy ra nhưng trả về giá trị dễ chịu"* đã có mặt ở: `| grep` nuốt exit
code (2026-08-11, sổ `fixlog`), `| tail` che dòng FAIL, `clone --single-branch` lấy nhầm nhánh,
`grep -c` cắt chuỗi ở `&&`, **`codeOnly` lệch im lặng (3 biến thể, lô này)**, và **sàn
`RATCHET` tụt lại 29 ca**. Sáu lần, một hình dạng.

Ngưỡng promote đòi **≥2 lần độc lập có số PR/commit**, và cổng `evals/run.mjs` cần quota — nên
chưa mở `knowledge/lessons/`. Ghi ở đây để lần sau không phải tìm lại. Bản vá trong lô này là
**cơ chế**, và cơ chế đứng được một mình mà không cần bài học đi kèm.

## Xét cắt bỏ (bắt buộc mỗi lô)

Xét bỏ dòng `→ n mục CHƯA ĐO ĐƯỢC` trong `report()` vì `verdictLine` đã nêu `unknown` —
**KHÔNG**. Dòng cũ nói với người đọc báo cáo đầy đủ; dòng mới chỉ xuất hiện khi có `FAIL`. Một
báo cáo `0 FAIL · 3 CHƯA ĐO ĐƯỢC` không in gì ra stderr (đúng), nên bỏ dòng cũ là làm mất chỗ
duy nhất nói ra điều đó.
