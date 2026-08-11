---
id: L0006
title: Một phép đo KHÔNG TRẢ LỜI ĐƯỢC bị ghi thành một KẾT LUẬN — phủ định hay khẳng định, tuỳ mặc định của code xung quanh
scope: universal
class: state
representation: test
status: active
owner: "@ai"
added: 2026-08-08
expires-review: 2026-11-08
occurrences: 8
evidence:
  - "#97 — `wt-clean.mjs:31` hỏi `git branch --merged`; squash-merge tạo commit MỚI nên nhánh ĐÃ merge đọc y hệt nhánh chưa từng có PR. Đo 2026-08-07: PR #89 merge lúc 13:10:45Z, worktree sạch, `--apply` in *giữ (chưa merge)* và không xoá gì. Repo squash 100% số PR ⇒ bộ dò chưa từng đúng một lần nào."
  - "#92 — `budgetStatus` không nhận `role`, nên nó in *chưa khai trần chi tiêu, KHÔNG phải ổn* ở repo template, nơi `setup.mjs:55` TỪ CHỐI ghi cấu hình. Harness đòi một thứ chính harness cấm cung cấp; không đường nào làm mục đó xanh."
  - "#105 — `rituals.mjs:478` đếm MỌI dòng từng có trong `gate-fails.log`, nên `/harness-propose` đỏ VĨNH VIỄN sau hai lần bị chặn. Ba lần chặn ngày 2026-08-07 đã xử lý xong qua PR #79-#101, và không lệnh nào làm mục đó xanh lại được. `fixlog` có `--close` từ v2.11.0; sổ CÙNG FILE cách 380 dòng thì không."
  - "#97 (phụ) — `git log @{u}..HEAD` khi upstream đã bị xoá thì git LỖI, `stdout` rỗng, và code cũ đọc thành *không có commit chưa push*. Cùng gốc rễ, khác cơ chế."
  - "CHIỀU KHẲNG ĐỊNH · #144/PR #162 — đọc kết quả suite bằng `| tail -4` thay vì exit code. Suite exit **1** (`harness.version` lệch changelog); dòng FAIL không nằm ở cuối nên `tail` không thấy nó. Tôi viết *\"test-hooks xanh\"* vào PR. CI bắt được, vá ở `98bc3f5`. Phép đo KHÔNG XẢY RA (exit code chưa từng được đọc) đọc y hệt phép đo ĐẠT."
  - "CHIỀU KHẲNG ĐỊNH · #173/PR #174 — ca `⑲k` khẳng định `/hạ tầng/` trên TOÀN BỘ output, mà dòng `KHÔNG ĐO ĐƯỢC` ở khối trên kết thúc bằng *\"Chạy lại khi hạ tầng ổn\"*. Ca XANH TỪ LÚC SINH RA, kể cả khi phân loại sai. Chỉ mutation lộ ra; đo lại bằng cách dump `r.out` dưới cả bản gốc lẫn mutant."
  - "CHIỀU KHẲNG ĐỊNH · PR #174 — ca không chạy tới nhánh phép chia (`0 merge` trong cửa sổ ở CI) sẽ báo **PASS** nếu không có `declareNa`. Một ca không chạy tới mà báo xanh đọc y hệt một ca chạy tới và đạt."
  - "CHIỀU KHẲNG ĐỊNH · #163/PR #169 — task đánh dấu `full-arm-only` cho MỌI assertion ⇒ giao rỗng. Nếu phép trừ vẫn in một hiệu số thì `100%` đó không nói về cái gì cả. Bắt buộc ra `?`, không ra số."
artifacts:
  - "tooling/lib/harness.mjs"
  - "tooling/wt-clean.mjs"
  - "tooling/harness-doctor.mjs"
  - "tooling/rituals.mjs"
  - "tooling/test-hooks.mjs"
  - "tooling/capo-report.mjs"
  - "evals/run.mjs"
  - "tooling/test-evals.mjs"
evals:
  - "evals/tasks/0006-chua-do-khong-phai-on.md"
  - "evals/tasks/0007-va-hai-chieu-thieu-mot-chieu.md"
exit-condition: "Khi mọi phép đo trong repo trả về một kiểu tổng có nhánh KHÔNG-BIẾT tường minh (thay vì boolean), VÀ mọi bên BÁO CÁO có nhánh `n/a` tường minh tách khỏi `pass` (một ca không chạy tới không được đếm là đạt), và test hợp đồng hai đầu đòi mọi bên đọc phải phân nhánh cho cả hai. Lúc ấy lỗi này không biểu diễn được nữa và bài học thành thừa. Kiểm lại khi `report()` đổi tập bucket."
---

## Triệu chứng

Ba lần, ba cơ chế khác nhau, một hình dạng:

| | phép đo | khi KHÔNG trả lời được | nó in ra |
|---|---|---|---|
| #97 | `git branch --merged` | squash-merge làm commit gốc không thành tổ tiên | **"giữ (chưa merge)"** |
| #92 | `budgetStatus` | template không được phép khai trần | **"chưa khai trần — KHÔNG phải ổn"** |
| #97b | `git log @{u}..HEAD` | upstream đã bị xoá ⇒ git lỗi | **"không có commit chưa push"** |

Cả ba câu in ra đều là **khẳng định phủ định**, và cả ba đều **sai** — phép đo không biết.

## Chiều thứ hai — và nó là chiều IM LẶNG

Bốn ca đầu đều lệch về phía **phủ định**, nên bài học này ra đời với chữ *"phủ định"* trong tiêu
đề. Đó là một mô tả **một chiều** của một trục **hai chiều**, và `L0007` — bài học của chính
repo này — nói đúng chuyện gì xảy ra với một bản vá một chiều:

```
CHIỀU A (ồn ào)   `?` → viết thành PHỦ ĐỊNH    "chưa merge" · "chưa khai trần"
                                               → người đọc đi kiểm thừa, ai cũng thấy

CHIỀU B (im lặng) `?` → viết thành KHẲNG ĐỊNH  "xanh" · "PASS" · "đã phủ"
                                               → không ai đi kiểm, vì nó nghe như đã kiểm rồi
```

| | phép đo | khi KHÔNG xảy ra | nó in ra |
|---|---|---|---|
| PR #162 | exit code của suite | đọc bằng `\| tail -4`, dòng FAIL không ở cuối | **"test-hooks xanh"** (thật ra exit 1) |
| PR #174 | ca `⑲k` | regex quét CẢ output, bắt trúng một dòng khác | **PASS** (xanh từ lúc sinh ra) |
| PR #174 | phép chia `hits/accepted` | CI có 0 merge ⇒ nhánh đó không chạy tới | **PASS**, nếu không có `declareNa` |
| PR #169 | phép trừ eval | mọi assertion bị đánh dấu ⇒ giao rỗng | một **hiệu số** không nói về cái gì |

**Chiều B đắt hơn chiều A** đúng vì nó rẻ hơn để sống chung: chiều A tạo ra một việc thừa, nên
có người phàn nàn và có người sửa. Chiều B **xoá việc** — và không ai phàn nàn về một việc đã
biến mất.

Đây KHÔNG phải `L0005`. `L0005` nói về bộ đếm gộp hai trạng thái **đã đo được** rồi đổ về phía
dễ chịu. Cái này hẹp hơn và độc hơn: trạng thái **thứ ba** — *không đo được / không xảy ra* —
bị viết thành **một kết luận**. Một `?` trung thực khiến người đọc đi kiểm; một câu *"chưa
merge"* hay một chữ *"PASS"* khiến họ **thôi kiểm**, vì nó nghe như đã kiểm rồi.

## Nguyên nhân

`class: state`. Ba nguồn đều là **mô hình về thực tại đã cũ** đội lốt một phép đo:

- `--merged` giả định merge commit; repo squash thì giả định đó sai từ commit đầu tiên.
- `budgetStatus` giả định mọi repo được phép khai cấu hình; template thì không.
- `@{u}` giả định upstream còn sống; `gh pr merge --delete-branch` xoá đúng nó.

Điểm chung ở tầng code: **`stdout` rỗng và `status != 0` bị đối xử như nhau**, và **giá trị
thiếu bị đối xử như giá trị bằng không**.

Hướng lệch làm nó sống lâu: cả ba đều lệch về phía **an toàn** (giữ worktree, đòi khai trần).
Không ai mất dữ liệu, nên không ai đi điều tra. Nhưng hệ quả là cảnh báo **không bao giờ bật**
— và một cảnh báo không bao giờ bật thì không phân biệt được với một cảnh báo không tồn tại.

## Cơ chế

**Không phải một lời nhắc.** Bài học này đã tồn tại dưới dạng comment ở
`tooling/overlap-scan.mjs:41` — nói đúng chuyện squash-merge, ở một file **không xoá gì cả** —
trong khi `wt-clean.mjs`, file **thật sự xoá worktree**, không được áp. Dạng biểu diễn `5`
(gotcha) đã thử và **thất bại có bằng chứng**. Nên cơ chế là code + test:

1. **Kiểu tổng có nhánh KHÔNG-BIẾT.** `mergeState()` trong `tooling/lib/harness.mjs` trả
   `merged | open | unknown`, kèm `why` bắt buộc. `budgetStatus()` trả thêm `template-na` /
   `template-cap`. Cả hai **thuần** — dependency tiêm vào — nên test lái được nhánh `unknown`
   mà không cần dựng repo git hay có `gh` trên máy CI.

2. **Hợp đồng HAI ĐẦU.** Mọi bên ĐỌC phải phân nhánh cho **mọi** trạng thái. Thiếu một nhánh
   thì nó rơi vào `else` cuối và in nhãn của trạng thái khác — tức bug cũ với một cái tên mới.
   Đây là ca mà test trên hàm thuần **không** bắt được, vì lỗi nằm ở phía hiển thị.

3. **`codeOnly()` — neo vào CODE, không vào comment.** Assertion đầu tiên của (2) **không giết
   được mutant của chính nó**: gỡ sạch lời gọi `mergeState` khỏi `wt-clean.mjs` mà test vẫn
   xanh, vì chữ `mergeState` còn nằm trong comment giải thích. Lần thứ **tư** repo này vấp
   đúng chỗ đó (v2.10.2 · `governanceDrift` · và lần này), nên nó thôi là giai thoại và thành
   một hàm.

**Một assertion không giết được mutant của chính nó là một assertion chưa tồn tại — nó chỉ
trông như đã tồn tại.** Đó là lý do mọi assertion ở đây được xác minh ĐỎ trước khi được tin.

4. **Nhánh `n/a` ở phía BÁO CÁO, tách khỏi `pass`.** (1)–(3) lo phía ĐO; chiều B sống ở phía
   KHAI BÁO. `declareNa(n, lý_do)` trong `tooling/test-hooks.mjs` và `asserts.na` trong
   `evals/run.mjs` tồn tại cho đúng việc này: một ca **không chạy tới** phải in ra là `n/a` kèm
   *vì sao*, không được rơi vào `ok`. Cùng lý do, tỉ lệ pass của lớp eval chỉ nhận task
   `measured`, và số task `?` được **in ra** thay vì bị trừ khỏi mẫu số trong im lặng.

5. **Đọc suite bằng EXIT CODE.** `| tail`, `| head`, `| grep` đều nuốt exit code của lệnh
   trước trong pipeline, và dòng FAIL không nhất thiết nằm ở cuối. Đây là chiều B ở dạng thuần
   nhất: phép đo chưa từng xảy ra, và kết quả đọc thành ĐẠT.

### Ba cách một MUTANT SỐNG SÓT — và hai trong ba KHÔNG nằm ở bản vá

Phản xạ khi mutant sống là đi sửa bản vá. Hai trong ba nguyên nhân không ở đó:

| # | nguyên nhân | dấu nhận | việc phải làm |
|---|---|---|---|
| ① | độ phủ hở thật | không ca nào nói về hành vi đó | thêm ca |
| ② | mutant **TƯƠNG ĐƯƠNG** | ràng buộc do ≥2 lớp cùng giữ; phá một lớp không đổi hành vi | ghi tại chỗ, **đừng** thêm ca trang trí |
| ③ | ca test **NEO RỘNG HƠN** thứ nó khoá | ca có tồn tại, và nó **xanh cả khi code sai** | sửa **CA**, không sửa bản vá |

③ là chiều B áp lên chính lưới an toàn: một ca chưa bao giờ có răng trông y hệt một ca đang
canh. Nên khi mutant sống, hỏi theo thứ tự: *"ca nào ĐÁNG LẼ phải đỏ?"* → *"chạy tay xem nó
thấy gì"* → chỉ khi ca đó thật sự nói đúng thứ cần nói mới kết luận ① hoặc ②.

Hai hệ quả thực hành, cả hai đã trả giá để có:

- **Script mutation phải in `exit status` và SỐ CA CHẠY.** *"Suite crash"* và *"mutant sống"*
  trông y hệt nếu chỉ đọc dòng `FAIL`. Cùng lý do `mutate()` trả `ran` chứ không chỉ `killed`:
  một mutant CHỈ CRASH chứng minh suite nhận ra file hỏng, **không** nói gì về hành vi mà
  mutant tuyên bố đã gỡ. Vá an toàn: `[].push(...)` thay vì `if (false)`.
- **Mutant ĐẦU TIÊN hãy tiêu vào PHẠM VI, không vào logic.** Logic là thứ tác giả đang nghĩ tới
  lúc viết test nên nó được phủ; phạm vi — áp cho file nào, dòng nào, quét cả output hay một
  dòng — được khai một lần rồi không ai khẳng định lại. Thay bộ lọc bằng `() => true`; suite
  vẫn xanh ⇒ dòng khai phạm vi đó là trang trí.

## Chuyển đi được không

`universal`. Ba tiền đề đều không phụ thuộc stack:

- **Squash-merge là mặc định của GitHub/GitLab**, nên `--merged` sai ở đa số repo hiện đại,
  không riêng repo này.
- **Mọi công cụ CLI đều có chế độ hỏng** (không cài, chưa auth, không mạng), nên "không hỏi
  được" là một trạng thái thật ở mọi nơi.
- **Mọi repo template/seed** đều có vùng cấu hình mà bản thân nó không được phép điền.

Xoá repo này thì cả ba vẫn đúng. Cơ chế đi kèm cũng mang được: `mergeState` và `codeOnly`
không đọc đĩa và không biết gì về harness.

Liên quan: `0005-bo-dem-do-ve-phia-de-chiu.md` — cùng họ, nhưng `L0005` nói về **gộp hai
trạng thái đã đo được**, còn bài này nói về **trạng thái thứ ba: chưa đo được**.
