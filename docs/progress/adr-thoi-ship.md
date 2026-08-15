# Sổ quyết định của TEMPLATE thôi ship, và con trỏ chết có phép kiểm (v2.81.0)

issue: **KHÔNG CÓ** — Đợt 3 của kế hoạch cô đặc harness.
owner: @thiengthb · branch: `fix/adr-thoi-ship` · worktree: gốc repo · platforms: n/a

<!--
  Neo chống trôi:
    node tooling/test-hooks.mjs        → 235/235, sàn 235
    node tooling/test-lib.mjs          → 62/62,   sàn 62
    node tooling/apply-to.mjs --audit  → exit 0
    node tooling/entropy-scan.mjs      → exit 0
-->

## Kế hoạch nói "cắt 1 000 dòng tài liệu". Đo trước, cắt sau.

Đợt 3 trong kế hoạch là "⑥ tài liệu, từng đoạn một". Nhưng phương pháp đã ghi từ đầu là
**áp thang của chính repo** (`test > generator > hook > skill > rule`) lên từng đoạn: đoạn nào
đã có phép kiểm cưỡng chế thì thu về một câu + link; đoạn nào chỉ là lời khuyên thì cắt hoặc
chuyển lên chỗ nó được đọc.

Ứng viên đầu: `docs/adr/harness/` — 374 dòng, hai ADR. Đo bán kính:

```
6 tham chiếu trong toàn repo, CẢ 6 LÀ COMMENT.
0 khẳng định đọc nội dung file.
```

Tức nó là **văn bản thuần**, không phải mối nối chịu lực — ngược hẳn với `test-hooks.mjs` ở
đợt 2, nơi bốn eval task đang ship biến nó thành cơ chế.

## Cắt, nhưng cắt cái gì mới đúng

ADR của lớp harness là **sổ quyết định của TEMPLATE**. Nó cùng nhóm với `HARNESS-CHANGELOG.md`
(đã `NOT_FOR_CONSUMER` từ lâu), không cùng nhóm với `docs/adr/_TEMPLATE.md` (khuôn — ship).
Ở repo tiêu thụ nó là 374 dòng nói về những quyết định mà **đội đó không tham gia và không
đảo được**.

Nhưng trong ADR 0002 có chính sách còn SỐNG. Xoá file là xoá luôn chính sách. Nên tách hai:

| | đi đâu |
|---|---|
| lịch sử — vì sao chọn native slot năm 2026 | ở lại ADR, thân bài **không viết lại** (một ADR bị viết lại thì mất giá trị), chỉ thêm blockquote nói nó là lịch sử |
| chính sách — ba bậc cưỡng chế vendor · bài test bốn câu · observer/gate/**provisioner** | **promote lên `/harness-propose` §2**, tức đúng lúc người ta sắp viết một hook mới |

Đó là "biến file md thành skill/rule/tool" theo đúng nghĩa: không phải chép sang chỗ khác, mà
đặt vào **thời điểm quyết định**.

Xoá ở repo đã áp: một mục `REMOVED_PATHS` (`since: 2.81.0`) — có sha-guard, bạn sửa thì
`upgrade` không đụng.

## Cái tìm được khi cắt, và nó đáng giá hơn phép cắt

Bỏ thư mục khỏi `SEED` xong, câu hỏi tự nhiên là: *còn file nào đang ship mà trỏ vào nó
không?* Repo có sẵn **hai** cơ chế đáng lẽ trả lời được. Cả hai đều mù:

**① `entropy-scan` §9b** — quét đường dẫn chết trong `.md`. `HISTORY()` loại **toàn bộ**
`docs/progress/` và `.claude/learnings/` để bỏ qua nhật ký. Nhưng hai file `_`-prefix trong đó
là **những file DUY NHẤT của hai thư mục ấy đi xuống consumer**. Vá: thu hẹp về
`/^(?:docs\/progress|\.claude\/learnings)\/(?!_)/`.

**② `test-hooks` "ship ↔ trích dẫn"** — liệt tay **3 thư mục + 2 mẫu**, và loại
`tooling/test-*` là một file ĐANG ship. Neo hẹp hơn thứ nó khoá (`lessons/0006`).

Đo sau khi vá: **8 con trỏ chết đang ship sẵn**. Một trong số đó do **chính lô v2.79.0 tạo
ra** — `whats-new-archive.md` cố ý không ship, được nhắc tên trong file có ship. Ở repo tiêu
thụ nó trỏ vào chỗ trống, và không gì bên đó nói ra.

## Vá bằng MỘT cơ chế, không phải cái thứ ba

Bản đầu của tôi viết một phép kiểm mới trong `apply-to.mjs` — trước khi phát hiện `test-hooks`
đã có một phép hẹp. Giữ cả hai là nuôi hai sự thật. Nên:

```
lib/harness.mjs   unshippedRefs(docs, shipped, tracked, consumerWrites)  ← hàm thuần
test-lib.mjs      15 khẳng định đơn vị
apply-to --audit  gọi nó trên cây THẬT
test-hooks        ca regex viết tay → một khẳng định ĐẤU NỐI (neo hẹp)
```

Kèm `CONSUMER_WRITES`: đường dẫn repo con **tự sinh** (`knowledge/index.json`,
`knowledge/DECISIONS.log`, `.claude/claude-code-baseline.json`). Chúng không ship và không
được ship. Miễn trừ bằng **một danh sách có tên**, không bằng một `if` giấu trong hàm — và có
một ca test làm rỗng danh sách đó để chứng minh miễn trừ ĐẾN TỪ danh sách chứ không từ nơi
khác (`lessons/0007`, hai chiều).

## BẰNG CHỨNG

`test-hooks` **235/235 · sàn 235** · `test-lib` **62/62 · sàn 62** · test-evals · doctor ·
harness-size · entropy-scan · knowledge/lint · test-migrations · `apply-to --audit` ·
gates preMerge · evals · rituals --all — **tất cả exit 0**.

| mutant | ca bị giết |
|---|---|
| `docs/adr/harness` quay lại `SEED` | `vừa khai KHÔNG-ship vừa nằm trong SEED — SEED là cái thắng, nên nó vẫn ship` |
| rơi khỏi `NOT_FOR_CONSUMER`, còn ở `REMOVED_PATHS` | `bị migration XOÁ ở repo con nhưng vẫn nằm trong danh sách ship — nâng cấp xong nó quay lại` |
| `apply-to` bỏ `process.exit(1)` | `gọi unshippedRefs nhưng kết quả KHÔNG dẫn tới exit khác 0 — một phép đo không phán quyết gì` |
| `apply-to` bỏ hẳn lời gọi | `KHÔNG gọi unshippedRefs — hàm đúng mà không ai chạy nó trên cây thật` |
| `unshippedRefs` bỏ miễn trừ `CONSUMER_WRITES` | `CONSUMER_WRITES … ⇒ im: ["knowledge/index.json"] ≠ []` |

Mutant của §9b phải đo **hai chiều**, vì bản vá chỉ thu hẹp một regex:

```
LOGBOOK rộng lại + đường dẫn chết trong docs/progress/_TEMPLATE.md  → exit 0   ← MÙ
LOGBOOK có (?!_) + cùng đường dẫn đó                                → exit 1   ← thấy
LOGBOOK có (?!_) + cây sạch                                          → exit 0   ← không bắn nhầm
```

Dấu chân repo tiêu thụ: **27 827 dòng / 166 file → 27 656 dòng / 164 file**.
Cắt 374, thêm 203 dòng cơ chế ⇒ net −171. Đổi văn bản-đọc-một-lần lấy phép-kiểm-chạy-mọi-lần.

## Hai lần comment của chính tôi thành con trỏ chết

Trong lô này tôi tạo ra đúng lớp bug vừa đi vá, **hai lần**:

1. `entropy-scan.mjs` — tôi viết ví dụ đường dẫn chết trong backtick ở comment. §9b bắt nó.
   File đó cảnh báo đúng điều này hai đoạn bên dưới.
2. `apply-to.mjs` — tôi ghi tên một file `docs/progress/` trong backtick. Ca "ship ↔ trích
   dẫn" bắt nó.

Cả hai lần cách sửa là **mô tả bằng văn xuôi thay vì backtick** — đúng lời khuyên mà chính
thông báo lỗi in ra. Đây là bằng chứng phép kiểm sống: nó bắt tác giả của nó.

## KHÔNG LÀM, có lý do

- **Không viết lại thân ADR 0002.** ADR là bản ghi của một thời điểm; viết lại nó biến nó
  thành tài liệu, và tài liệu thì không trả lời được "lúc đó họ biết gì".
- **Không thêm `REMOVED_PATHS` cho `test-lib.mjs`.** Nó chưa bao giờ ship, nên không repo nào
  có gì để xoá. Ca ①e cố ý kiểm **một chiều** (`REMOVED_PATHS` còn trên đĩa ⇒ phải
  `NOT_FOR_CONSUMER`), không kiểm chiều ngược.
- **Không cắt tiếp trong lô này.** Bề mặt đã đủ: 3 file cơ chế, 1 skill, 17 chỗ sửa con trỏ.
