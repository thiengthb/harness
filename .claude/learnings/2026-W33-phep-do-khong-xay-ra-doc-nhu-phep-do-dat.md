# Learnings — W33, thi3n (+ Claude): phép đo KHÔNG XẢY RA đọc y hệt phép đo ĐẠT

Nguồn: hai phiên 2026-08-10/11 (PR #162 #164 #165 #166 #167, v2.53.0 → v2.58.0), auto-memory
3 mục mới, và `docs/progress/144.md`.

**Đây là ĐỀ XUẤT, chưa phải harness.** Promote → `/knowledge-promote`, và cần DRI duyệt.

---

## Một lớp lỗi, SÁU lần, trong hai phiên

Không phải sáu lỗi khác nhau. Một lớp: **tôi tuyên bố một kết quả mà phép đo sinh ra nó chưa
từng chạy** — và mỗi lần, thứ che nó là một lệnh *phụ* trong đường ống, không phải lệnh chính.

| # | tôi làm gì | cái gì nuốt phép đo | tôi kết luận sai điều gì |
|---|---|---|---|
| ① | `node test-hooks.mjs 2>&1 \| tail -4` | `tail` cắt mất dòng `FAIL`; **pipe nuốt luôn exit code** | viết *"test-hooks xanh"* vào commit + PR #162; exit thật là **1** |
| ② | `git clone --single-branch <url>` | clone lấy **nhánh mặc định**, không lấy nhánh đang sửa | *"bản vá không có tác dụng"* — tôi đang đo **code cũ** |
| ③ | `grep -c X f && for … strip …` | `grep -c` trả **exit 1 khi đếm 0** ⇒ `&&` dừng ⇒ vòng strip **không chạy** | *"cây trần xanh hết"* — cây đó chưa bao giờ bị gỡ |
| ④ | dựng cây trần bằng tay để tái hiện | thiếu **commit mốc** mà `evalTree()` có | *"`test-evals` xanh trên cây trần"*, trong khi runner thấy nó đỏ |
| ⑤ | đọc bảng mẫu số rồi viết câu tóm tắt | con số **gõ tay** từ một bảng do máy in | *"6/7 task lệch"* — đếm lại chính bảng đó: **5** |
| ⑥ | `node -e "…"` với backtick / `*"…"*` | shell nuốt ký tự trước khi Node thấy | script chạy "thành công" mà sửa sai nội dung (lần thứ **9** của riêng ca này) |

Bốn trong sáu (①②③④) có **cùng một triệu chứng**: *kết quả đẹp hơn tôi chờ đợi*. Đó là tín hiệu
chẩn đoán mạnh nhất trong bảng này, và tôi đã bỏ qua nó ba lần liên tiếp trước khi gọi tên.

### Vì sao lớp này nguy hơn một phép đo SAI

Một phép đo sai còn mâu thuẫn với thứ khác — sớm muộn có gì đó không khớp. Một phép đo **không
xảy ra** thì không mâu thuẫn với gì cả: nó im lặng, và mọi thứ quanh nó vẫn nhất quán.

Nó cũng đi ngược `AGENTS.md §Verification` ở đúng chỗ đau nhất: *"`evidence` bắt buộc khi
`passes: true` … 'Tôi đã kiểm tra' KHÔNG phải bằng chứng"*. Bốn dòng cuối của một suite **trông
giống bằng chứng hơn** một câu "tôi đã kiểm tra" — nên nó qua được cửa dễ hơn.

---

## Nhóm theo NGUYÊN NHÂN

### Nhóm A — lời khai không neo vào output của máy (①⑤)

Lớp lỗi: **Verification**. Con số đi vào commit/PR/issue được **gõ lại bằng tay** từ một thứ máy
đã in, hoặc được **suy ra từ ấn tượng** thay vì từ exit code.

**Đề xuất — MỘT thay đổi:** một helper trong `tooling/lib/harness.mjs`:

```js
export function green(label, cmd, args) { /* spawnSync, trả {ok, code}, IN ra `label → exit N` */ }
```

…và luật: mọi câu *"X xanh"* trong commit/PR phải kèm dòng `X → exit N` do helper in. Không phải
để đẹp — để **câu khẳng định và phép đo là cùng một chuỗi ký tự**.

- **Tầng độ trễ:** không phải hook, không phải gate. Đây là **thói quen có dụng cụ**, và dụng cụ
  phải rẻ hơn thói quen cũ (`| tail`) thì nó mới thắng.
- **Chi phí bảo trì:** ~20 dòng, không có trạng thái.
- **Điều kiện thoát:** khi `report()` của repo in exit code ở cuối mọi suite và không ai còn lý
  do gõ tay — helper này thành thừa, xoá.

### Nhóm B — fixture dựng hỏng, phép đo vẫn "chạy" (②③④)

Lớp lỗi: **Verification** (và một nửa **State**). Cây/nhánh/tiền đề của phép đo dựng không thành,
nhưng phép đo vẫn chạy tới cùng và in ra một con số về **thứ khác**.

**Đề xuất — MỘT thay đổi: MỐC DƯƠNG bắt buộc.** Mọi phép đo dựng fixture phải in **bằng chứng
fixture tồn tại** trước khi đo, và bằng chứng đó phải là thứ **chỉ đúng khi dựng thành công**:

```
MỐC DƯƠNG: gỡ 6 mục · có xác .bare-disabled · 2 commit · sha abc1234
```

Đã dùng thử trong PR #167 và nó **bắt được ca ④ ngay lượt đầu** — khác biệt "cây tôi dựng tay
thiếu commit mốc" chỉ lộ ra vì tôi in số commit.

- **Tầng độ trễ:** trong chính script đo (`evals/run.mjs --denominators` đã in một phần).
- **Chi phí:** một dòng `console.log` mỗi chỗ dựng cây.
- **Điều kiện thoát:** khi mọi cây eval do **một hàm duy nhất** dựng (`evalTree`) và không ai
  dựng tay nữa — mốc dương chuyển vào hàm đó, các chỗ gọi bỏ.

### Nhóm C — shell nuốt ký tự trước khi Node thấy (⑥)

Lớp lỗi: **Constraint**. Đã là lần **9**. Ba nhóm A/B ở trên là bài học mới; nhóm này thì không
— nó chỉ chưa có cơ chế.

**Đề xuất — MỘT thay đổi:** không dùng `node -e` cho bất cứ chuỗi nào chứa backtick, `${`, `$1`,
hay `*"…"*`. Viết `.mjs` vào scratchpad rồi `node <file>`. Cưỡng chế được bằng một dòng trong
`dcg.mjs` (`node -e` + backtick ⇒ chặn kèm gợi ý) — **nhưng đó là vùng cấm, cần DRI.**

---

## ĐỀ XUẤT CẮT BỎ (bắt buộc, tối thiểu 1)

**Cắt: ratchet `SKEW_RATCHET` sẽ thành trang trí nếu mốc `1` là vĩnh viễn.**

`harness-size.mjs` tự khai luật này: *"một ratchet không thể về 0 thì không phải ratchet, nó là
một dòng trang trí vĩnh viễn"*. `SKEW_RATCHET` hiện ở mốc **1**, và tôi đã ghi rằng task còn lại
(`0007`) lệch **do cấu trúc** — tức mốc này có thể không bao giờ về 0.

Ba lối, phải chọn một chứ không để lửng:

1. `0007` bỏ hai dòng `node tooling/test-*.mjs`, giữ khối `node -e` nhỏ vốn đã có → mốc về 0
   **thật**. *Rủi ro:* mất phép kiểm "ca agent viết có chạy được không" ở chiều đầy đủ.
2. Thêm rổ *"lệch DO CẤU TRÚC"* tách khỏi *"lệch do công cụ báo oan"* → mốc về 0, và con số 1 kia
   chuyển sang một dòng `n/a` có lý do. *Giá:* thêm một khái niệm vào hợp đồng task.
3. Giữ mốc 1 và **khai `exit-condition` cho chính ratchet** — nếu không nó vi phạm luật nó dựa vào.

Nghiêng về **(2)**: nó giữ nguyên sức đo, và nó nói đúng sự thật (*"một task không so được vì
bản chất của nó"*) thay vì giấu sự thật đó sau một con số.

---

## Ba con số

| chỉ số | trước hai phiên | sau | ghi chú |
|---|---|---|---|
| task so được giữa hai chiều eval | **1**/6 | **5**/6 | thứ #144 cần để tồn tại |
| assertion sống ở chiều trần | 13/24 (54%) | 23/24 (**96%**) | |
| kích thước harness | — | **↑** | `harness-size` vẫn WARN "đang PHÌNH" so với baseline 2026-08-05 (hooks +181 dòng, lessons +4); đề xuất cắt ở trên là mục duy nhất chống lại |
| sửa tay (fixlog) | 11 tổng | 11 | **1** mục mới trong hai phiên (08-10, ca `dcg`); ngưỡng `≥10/tuần` vẫn đang kêu |
| PR revert 7 ngày | — | **0** | |

> **Cách đo cột revert, vì nó suýt thành ca ⑦ của bảng trên.** `git log --grep="revert" -i` cho
> **4** — cả bốn là tài liệu *nhắc tới* chữ "revert" (ba file retro + một changelog), không có
> revert nào. Số đúng lấy bằng `--grep="^Revert \""`, tức neo vào **định dạng git tự sinh**, và
> nó cho **0**. Tôi suýt viết `0` từ trí nhớ và tình cờ đúng — đó không phải phép đo.

---

## Auto-memory (đọc như ĐẦU VÀO, không như thẩm quyền)

Ba mục mới, cùng máy — **chưa** đạt ngưỡng "≥2 máy độc lập" nên **chưa** phải ứng viên promote:

- `doc-suite-bang-exit-code-khong-bang-tail`
- `con-so-go-tay-tu-mot-bang`
- `ket-qua-dep-bat-ngo-la-phep-do-chua-xay-ra`

Không mục nào mâu thuẫn với `knowledge/lessons/`. Cả ba là biến thể của **cùng một** lớp, nên nếu
promote thì promote **một** bài học, không phải ba.

Ứng viên bài học: **L0008 — "Phép đo không xảy ra đọc y hệt phép đo đạt"**, scope `universal`
(không phụ thuộc stack: đúng với mọi CI, mọi suite, mọi fixture). `occurrences: 6`, có số PR.

---

# Bổ sung 2026-08-11 — rào thứ sáu, và một mutant sống sót vì CA TEST

Hai phiên sau bản retro trên. Hai con số ở bảng *"Ba con số"* đã đổi: **task so được 6/6**
(v2.59.0, #163 đóng) và **assertion sống ở chiều trần 23/23**.

## Quan sát 1 — câu hỏi đắt nhất được trả lời bằng phép đo RẺ NHẤT, hai phiên liền

Rào thứ sáu (#144) tôi đã gọi tên là *"trần lượt hiệu chỉnh sai chiều"*, và tôi ghi là **cần
quota**. Vào việc, tôi đọc code trước khi tiêu quota. Lỗ nằm chỗ khác, và nó **miễn phí**:

```js
const absent = mine.size - common.length - skew.length - unknownDen.length;
```

`mine` chỉ chứa task ĐO ĐƯỢC ⇒ task chạm trần **ở chính lần chạy này** không nằm trong bất kỳ
số hạng nào ⇒ biến mất khỏi kế toán, **không để lại một con số**.

Đây là lần thứ **hai liên tiếp** một rào của #144 hoá ra không cần quota (lần trước: rào thứ
năm, tìm bằng phép dò mẫu số). Nhãn *"cần quota"* tôi tự gán đang **hệ thống hoá việc trì hoãn**:
nó mô tả bước CUỐI (chạy agent) chứ không mô tả bước tôi đang đứng.

**Đề xuất (rẻ, không thêm cơ chế):** trước khi ghi *"chờ quota"* vào bất cứ đâu, viết ra câu
*"phần nào của việc này KHÔNG cần agent chạy?"* và trả lời nó. Hai lần liên tiếp câu trả lời là
*"phần lớn"*.

## Quan sát 2 — mutant sống sót có BA nguyên nhân, và ③ nằm trong CA TEST

Lượt mutation đầu của v2.60.0: mutant *"bỏ nhánh `infra`"* **sống**. Bản vá không sai. Ca `⑲k`
sai — nó quét `/hạ tầng/` trên **cả output**, và dòng `KHÔNG ĐO ĐƯỢC` ở khối trên kết thúc bằng
*"Chạy lại khi **hạ tầng** ổn"*. Ca xanh kể cả khi dòng nó khoá phân loại sai.

**Đo, không suy** — dump `r.out` dưới cả bản gốc lẫn mutant:

```
GỐC:  ?  9042 — ra khỏi phép trừ: trần: hạ tầng (chạm trần phiên/quota)
      WARN … KHÔNG ĐO ĐƯỢC — agent hỏng vì HẠ TẦNG (…). … Chạy lại khi hạ tầng ổn
M2:   ?  9042 — ra khỏi phép trừ: trần: không assertion nào so được chạy
      WARN … (y nguyên)                                    ← ca cũ vẫn thấy đủ chữ để xanh
```

Nhãn in **HOA**, lời khuyên in **thường** — nên một regex chữ thường bắt nhầm sang câu khuyên.
Tôi suýt để nguyên phỏng đoán *"nhãn HẠ TẦNG viết hoa nên không thể khớp"*; nó đúng về nhãn và
**sai về kết luận**, vì chữ thường nằm ở clause cuối cùng của cùng dòng.

Ba nguyên nhân, đã gặp đủ cả ba trong repo này:

| # | nguyên nhân | việc phải làm |
|---|---|---|
| ① | độ phủ hở thật | thêm ca |
| ② | mutant **tương đương** (ràng buộc do ≥2 lớp giữ) | ghi tại chỗ, **đừng** thêm ca trang trí |
| ③ | **ca test neo rộng hơn thứ nó khoá** | sửa **CA**, không sửa bản vá |

③ tệ hơn ①: ① trông như một lỗ, ③ trông như đã được canh.

## Quan sát 3 — ĐO trước khi thêm cơ chế, và lần này phép đo nói ĐỪNG

Phản xạ sau quan sát 2 là thêm một cơ chế (helper mutation dùng chung, hoặc một lint bắt regex
neo rộng). Trước khi thêm, tôi đếm: **47 assertion `.test(r.out)` trong `test-evals.mjs`**, xét
từng cái xem chuỗi nó tìm có in ở nhiều chỗ không.

**Kết quả: đúng MỘT cái có tật đó — chính `⑲k`.** Mọi cái còn lại neo vào cụm chỉ in ở một chỗ,
hoặc neo vào id task (`\b9017\b`, `9040 — …`). Tật này **cá biệt, không hệ thống**.

Và cơ chế tôi định thêm **đã có sẵn**: `mutate()` trong `test-hooks.mjs` (dòng 74–95) khai đủ hai
bẫy đầu — *"neo sai chuỗi ⇒ lỗi của TEST"* và *"mutant chỉ crash ⇒ không chứng minh gì"* — cộng
đúng câu cho ③: *"khi mutant sống sót, nhìn PHẠM VI của check TRƯỚC khi nhìn logic"*. Tôi
tự viết lại script mutation trong scratchpad **bốn lần** mà không đọc nó.

**Nên KHÔNG thêm gì.** Vấn đề không phải thiếu cơ chế mà là cơ chế nằm chỗ không ai đi qua —
và một cơ chế thứ hai làm điều đó tệ hơn, không tốt hơn. `harness-size` vẫn kêu **PHÌNH**.

**Đề xuất CẮT (bắt buộc, mục của bổ sung này):** `mutate()` đang là hàm nội bộ của
`test-hooks.mjs` nhưng nội dung header của nó là kiến thức **chung**. Chuyển header đó thành
**một mục trong `knowledge/lessons/`** (hoặc gộp vào L0008) và để lại con trỏ một dòng — **không
nhân bản code**. Việc này gộp ba nơi đang giữ cùng một kiến thức (`mutate()` header, ratchet
`hooks-without-mutant`, các chú thích mutation rải rác) về một chỗ, tức **giảm** chứ không tăng.

## Ứng viên bài học — cập nhật

`L0008` giữ nguyên (`occurrences: 6` → **7** với `⑲k`: một ca XANH từ lúc sinh ra là *"phép đo
không xảy ra đọc y hệt phép đo đạt"* ở dạng thuần nhất — không có gì đỏ, không có gì sai, và
không có gì được kiểm).

Auto-memory mới, **cùng máy** (chưa đạt ngưỡng ≥2 máy): `mutant-song-sot-co-ba-nguyen-nhan`.
