# whats-new xoay vòng — cơ chế in 700 ký tự, file 1 081 dòng (v2.79.0)

issue: **KHÔNG CÓ** — Đợt 1 của kế hoạch cô đặc harness.
owner: @thiengthb · branch: `fix/whats-new-xoay-vong` · worktree: gốc repo · platforms: n/a

<!--
  Neo chống trôi:
    node tooling/test-hooks.mjs                → 291/291, sàn 291
    node tooling/apply-to.mjs --audit          → exit 0
    wc -l .claude/whats-new.md                 → ≤ 220
-->

## Kế hoạch nói làm ⑤ trước. Phép đo nói không.

Kế hoạch cô đặc xếp Đợt 1 = ④ (gom khuôn CLI) + ⑤ (chẻ `lib/harness.mjs`). Đo lại kỹ hơn thì
**cả hai co lại**, và đó là lý do lô này làm việc khác:

**⑤ — lợi ích nằm sau một cánh cửa tôi không mở được.**

```
node -e ''                       18,3 ms   ← sàn
import frontmatter.mjs (83 dòng) 18,6 ms
import harness.mjs (3 421 dòng)  24,8 ms   ← +6,2 ms, tái hiện được (20 lượt)
import + gọi config()            25,2 ms   ← chi phí là PARSE, không phải I/O
```

178 ms lãng phí mỗi lần Edit chia làm hai phần: **43 ms** do import lib × 7 gác, **135 ms** là
khởi động Node × 7. Chỉ bộ điều phối cắt được 135 ms kia, mà nó ở `.claude/hooks/` — **vùng
cấm**. Và các ký hiệu hook cần nằm rải từ dòng **70 đến 3 401** trong lib: mổ nó bây giờ là rủi
ro cao đổi lấy ~12 ms mỗi `git commit`. ⑤ dời sang Đợt 2, đi kèm ①.

**④ — phần trùng lặp thật đã bị v2.78.0 lấy mất.** Bảy bộ đọc cờ còn lại có ngữ nghĩa **khác
nhau có chủ ý**: `capo` xác thực và *từ chối đoán*, `coactivity` ép số kèm mặc định, `setup` trả
`null`. Gom lại sẽ mất đúng thứ đáng giữ, hoặc phải cấu hình đến mức phức tạp bằng cái nó thay.

## Cắt gì, và vì sao nó tự chứng minh

`session-start.mjs` §6 in `.slice(0, 700)` ký tự của `.claude/whats-new.md`. Đo: **2 mục**.

```
78 mục · 1 081 dòng · tích trong 11 ngày (~100 dòng/ngày)
   ↑ 2 mục có đường tới người đọc
   ↑ 76 mục còn lại: 0 đường đọc, nhưng ship xuống MỌI repo tiêu thụ
```

Dấu chân này **tăng tuyến tính theo thời gian** trong khi giá trị đọc được đứng yên ở 700 ký tự.
Với nhịp 11 ngày qua, ba tháng nữa nó là ~9 000 dòng.

**Giả thuyết đầu của tôi sai, và tôi kiểm trước khi nói.** Tôi nghi `session-start` in cả file
vào context mỗi phiên — đọc code thì thấy `.slice(0, 700)`. Không có chuyện tràn context; vấn đề
là *dấu chân*, không phải *context*.

## Hoà giải, không chọn phe

| nguồn | nói gì về `whats-new.md` |
|---|---|
| `harness-doctor.mjs:952` (`HISTORICAL`) · `entropy-scan.mjs:258` | hồ sơ lịch sử, **append-only**, loại trừ khỏi quét tham chiếu chết |
| `skills/harness-propose/SKILL.md` §6.3 | *"Xoá mục cũ hơn 1 tháng"* |

Hai chỉ thị ngược nhau về **cùng một file**. `.claude/rules/README.md` mở đầu bằng đúng vấn đề
đó: chỉ thị xung đột làm model tốn năng lực dàn hoà trước khi làm việc thật.

**Chuyển vào lưu trữ** giữ được cả hai tính chất — hồ sơ còn nguyên từng dòng, file ship thì
ngắn. Không dòng nào bị xoá. Lưu trữ vào `IGNORE` của `apply-to`, `HISTORICAL` và `entropy-scan`
mở rộng để phủ nó.

## Trần thành phép kiểm

Lời dặn *"giữ file NGẮN"* đã nằm trong chính header của file **từ đầu**, và file vẫn lên 1 081
dòng. Đó là bằng chứng cho thang biểu diễn ở `.claude/rules/README.md`: lời dặn là bậc rẻ nhất
và mục nhanh nhất. Đẩy xuống bậc `test`:

- file chính **≤ 220 dòng** (5× chỗ mà 700 ký tự với tới);
- còn dòng `<!-- version: … -->` — mất nó là thông báo **im lặng vĩnh viễn**, không triệu chứng;
- lưu trữ **không** nằm trong SEED — nếu lọt, việc xoay vòng không giảm được dòng nào;
- `HISTORICAL` **thật sự khớp** file lưu trữ.

## MỘT MUTANT SỐNG SÓT, và nó dạy lại đúng bài học repo đã có

Phép kiểm thứ tư, bản đầu, tìm chuỗi `whats-new-archive` **ở bất kỳ đâu** trong
`harness-doctor.mjs`. Mutant "bỏ `(-archive)?` khỏi `HISTORICAL`" **sống** — vì **chính đoạn
comment tôi vừa viết** ở đó có chứa chữ đấy.

Neo rộng hơn thứ nó khoá: `L0006` §mutant, y nguyên. Sửa thành **bóc regex ra rồi chạy thật** nó
với `.claude/whats-new-archive.md`. Comment không thoả được một phép chạy.

## BẰNG CHỨNG

Sàn **290 → 291** (`291/291 exit 0`) · doctor · harness-size · entropy-scan · knowledge/lint ·
test-migrations · test-evals · gates preMerge · `apply-to --audit` — **tất cả exit 0**.

| mutant | ca bị giết |
|---|---|
| dán lưu trữ ngược vào file chính | `1 103 dòng > trần 220` |
| xoá dòng `<!-- version: … -->` | `session-start sẽ không bao giờ in nữa` |
| đẩy lưu trữ vào SEED | `nó sẽ ship xuống consumer, tức xoay vòng không giảm được dấu chân nào` |
| bỏ `(-archive)?` khỏi `HISTORICAL` | `HISTORICAL KHÔNG khớp .claude/whats-new-archive.md` |

Dấu chân repo tiêu thụ: **29 908 → 29 080 dòng** (−828, −2,8 %), 162 file không đổi.

## Một phép đo của tôi lại vô nghĩa, lần thứ ba

Vòng chạy gate báo `precommit-scan --all exit=1`. Chạy riêng thì exit 0. Nguyên nhân: zsh
**không tách từ** khi khai triển biến, nên `node $c` với `c="tooling/precommit-scan.mjs --all"`
tìm một file tên đúng như vậy. Cùng họ với `$?`-sau-ống-dẫn (v2.77.0) và `set -- $spec`
(v2.78.0). Ba lần trong ba lô — đã ghi sổ; nếu lặp lần nữa thì nó thành `/harness-propose`.

## KHÔNG LÀM, có lý do

- **Không cắt `docs/adr/harness/` (372 dòng) khỏi SEED.** Nó ship, và có thể là thừa với repo
  tiêu thụ — nhưng đó là quyết định *"consumer nên đọc gì"*, không phải dọn rác. Để Đợt 4.
- **Không đụng `HARNESS-CHANGELOG.md` (6 999 dòng).** Đo ra nó **không** ship; nó là hợp đồng
  nâng cấp `upgrade.mjs` đọc. Nặng ở template ≠ nặng ở consumer.
- **Không nới trần 220.** Nếu một lô cần nới, đó là lô cần xoay vòng.
