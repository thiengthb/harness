---
id: L0006
title: Một phép đo KHÔNG TRẢ LỜI ĐƯỢC bị ghi thành câu trả lời phủ định, và câu phủ định đó nghe như một kết luận
scope: universal
class: state
representation: test
status: active
owner: "@ai"
added: 2026-08-08
expires-review: 2026-11-08
occurrences: 3
evidence:
  - "#97 — `wt-clean.mjs:31` hỏi `git branch --merged`; squash-merge tạo commit MỚI nên nhánh ĐÃ merge đọc y hệt nhánh chưa từng có PR. Đo 2026-08-07: PR #89 merge lúc 13:10:45Z, worktree sạch, `--apply` in *giữ (chưa merge)* và không xoá gì. Repo squash 100% số PR ⇒ bộ dò chưa từng đúng một lần nào."
  - "#92 — `budgetStatus` không nhận `role`, nên nó in *chưa khai trần chi tiêu, KHÔNG phải ổn* ở repo template, nơi `setup.mjs:55` TỪ CHỐI ghi cấu hình. Harness đòi một thứ chính harness cấm cung cấp; không đường nào làm mục đó xanh."
  - "#97 (phụ) — `git log @{u}..HEAD` khi upstream đã bị xoá thì git LỖI, `stdout` rỗng, và code cũ đọc thành *không có commit chưa push*. Cùng gốc rễ, khác cơ chế."
artifacts:
  - "tooling/lib/harness.mjs"
  - "tooling/wt-clean.mjs"
  - "tooling/harness-doctor.mjs"
  - "tooling/rituals.mjs"
  - "tooling/test-hooks.mjs"
evals:
  - "evals/tasks/0006-chua-do-khong-phai-on.md"
exit-condition: "Khi mọi phép đo trong repo trả về một kiểu tổng có nhánh KHÔNG-BIẾT tường minh (thay vì boolean), và test hợp đồng hai đầu đòi mọi bên đọc phải phân nhánh cho nhánh đó. Lúc ấy lỗi này không biểu diễn được nữa và bài học thành thừa. Kiểm lại khi `report()` đổi tập bucket."
---

## Triệu chứng

Ba lần, ba cơ chế khác nhau, một hình dạng:

| | phép đo | khi KHÔNG trả lời được | nó in ra |
|---|---|---|---|
| #97 | `git branch --merged` | squash-merge làm commit gốc không thành tổ tiên | **"giữ (chưa merge)"** |
| #92 | `budgetStatus` | template không được phép khai trần | **"chưa khai trần — KHÔNG phải ổn"** |
| #97b | `git log @{u}..HEAD` | upstream đã bị xoá ⇒ git lỗi | **"không có commit chưa push"** |

Cả ba câu in ra đều là **khẳng định phủ định**, và cả ba đều **sai** — phép đo không biết.

Đây KHÔNG phải `L0005`. `L0005` nói về bộ đếm gộp hai trạng thái rồi đổ về phía dễ chịu.
Cái này hẹp hơn và độc hơn: trạng thái **thứ ba** — *không đo được* — bị viết thành **câu trả
lời phủ định**. Một `?` trung thực khiến người đọc đi kiểm; một câu *"chưa merge"* khiến họ
**thôi kiểm**, vì nó nghe như đã kiểm rồi.

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
