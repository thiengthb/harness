# evals/ — gate cho chính harness

Bước 3 của vòng học. **Không có bước này thì cả vòng lặp là mê tín**, và
"cải thiện harness" chỉ là phình harness.

## Bộ eval tối thiểu: 12–20 task

```
├── 6 task ĐẠI DIỆN       "thêm 1 endpoint + test", "thêm 1 màn hình",
│                          "sửa bug từ mô tả", "thêm 1 migration", "refactor 1 module"
├── 4 task ĐÃ TỪNG THẤT BẠI   ← QUAN TRỌNG NHẤT. Lấy từ manual-fixes.log
├── 3 task NGUY HIỂM      chạm auth/payment/prod-adjacent → đo AN TOÀN, không đo tốc độ
├── 2 task DÀI            >30 phút → đo recovery + state
└── 2 task NGOÀI VÙNG     thứ harness chưa được thiết kế cho → đo overfit
```

## Hai loại eval PHẢI tách nhau

```
CAPABILITY EVAL  → tỉ lệ pass thấp, mục tiêu là ĐẨY LÊN
REGRESSION EVAL  → tỉ lệ pass gần 100%, mục tiêu là BẢO VỆ
```

Trộn hai loại → bạn ra quyết định ưu tiên sai.

## Chấm — hai lớp

```
Lớp 1 (tất định, chạy TRƯỚC):  gate pass? test pass? số lần can thiệp người?
                               token? wall-clock? repo có sạch sau khi xong?
                               agent CÓ chạy test trước khi tuyên bố xong không?
Lớp 2 (LLM-judge, chỉ khi lớp 1 không đủ):  rubric cho chất lượng/thẩm mỹ
```

## Ba luật vệ sinh eval

1. **Cách ly mạng khi eval.** Model có thể suy ra là đang bị eval, nhận ra tên
   benchmark, và tìm ra đáp án. Đây là yêu cầu kỹ thuật, không phải tuỳ chọn.
2. **Cố định cấu hình hạ tầng.** Cấu hình tài nguyên container một mình có thể gây
   swing 6+ điểm phần trăm — thường lớn hơn khoảng cách giữa các model. Eval trên
   máy khác nhau = bạn đang đo nhiễu.
3. **Chấm cả quá trình, không chỉ kết quả.** Tới ~23% lần "pass" là **lucky pass**
   (vòng regression, retry mù, thiếu verify). Xếp hạng dịch chuyển tới 5 bậc khi
   chấm theo chất lượng quá trình.

## Bốn luật cho eval CÓ MODEL tham gia

Chỉ áp khi `evals.command` đã được điền. Assertion tất định không cần bốn luật này —
nhưng khoảnh khắc bạn spawn một model, cả bốn đều bắt buộc, vì thứ eval đo lúc đó
không còn là "code có chạy không" mà là "một luật có đổi được HÀNH VI không".

| | Luật | Vì sao |
|---|---|---|
| 1 | **Hai nhánh** control/treatment, khác đúng **MỘT** biến | Không có control thì mọi thay đổi đều "có tác dụng" — bạn không có mẫu số |
| 2 | **`direction()` viết bằng CODE, TRƯỚC khi chạy** | Một kết quả rỗng không kể lại thành thắng lợi được. Văn xuôi thì kể lại được |
| 3 | **"Harness không chạy" là TRẠNG THÁI THỨ BA** | Dùng rổ `na` / `unknown` của `report()` trong `tooling/lib/harness.mjs`. Gộp nó vào pass hay fail đều bịa ra một phát hiện |
| 4 | **`--smoke` trước, trên MỖI máy mới** | Chứng minh spawn được model **trước đã**. Một eval chưa từng spawn nổi thì mọi test của nó vô nghĩa |

### Ba cái bẫy đã có người trả giá — không phải suy đoán

Đọc trực tiếp từ mã của một project anh em trên cùng máy này (2026-08-04), nơi cả ba
đã nổ thật. Chỗ tự kiểm được là **số hiệu**, không phải lời kể: `DEP0190` trong tài
liệu Node, `CVE-2024-27980` trong changelog Node.

**① Reachability — cái bẫy đắt nhất, và nó nói dối ĐÚNG HƯỚNG bạn mong.**
`--permission-mode acceptEdits` nhận **EDIT** nhưng vẫn **từ chối Bash**. Một lần chạy
headless được bảo `node build.mjs` trả lời *"The command needs your approval to run."*
Hệ quả: đường thành công **không tới được**, hai nhánh trông y hệt nhau, và eval công
bố NULL/NEGATIVE về một biến chưa bao giờ có chỗ để nhúc nhích. Lần chạy đầu của một
eval như thế cho NULL 3/3 và suýt hạ cấp một luật đúng.

> **Luật rút ra:** cấp đúng công cụ mà đường thành công cần (`--allowedTools`), **và**
> từ chối công bố NULL nếu **không lần chạy nào** đi tới được đường thành công. Không
> có tiền điều kiện đó thì NULL là **hiện vật của dụng cụ**, không phải phát hiện về luật.

**② Spawn xuyên OS — Parity Contract áp vào đây, không có ngoại lệ.**
Trên Windows: `claude` → `ENOENT` (launcher trên PATH là `claude.cmd`, và Node **không**
áp `PATHEXT` ở đây) · `claude.cmd` → `EINVAL` (Node từ chối spawn `.cmd` trực tiếp kể từ
bản vá `CVE-2024-27980`) · có shell → chạy. Nhưng dưới `shell`, **`DEP0190`**: Node **nối**
tham số chứ không escape. Nên **không nội suy gì biến đổi được vào command** — prompt,
thứ duy nhất dài và do người nhập, luôn đi qua **stdin**, không bao giờ qua argv.

> Harness đã học **nửa còn lại** của cùng một bẫy ở v2.0.0, theo chiều ngược: `git()`
> trong `tooling/lib/harness.mjs` **luôn** `shell: false`, vì `shell: true` nối các tham
> số có dấu cách lại và làm `parity (windows-latest)` đỏ với `fatal: must give exactly
> one tree`. Cùng một `DEP0190`, hai kết luận trái nhau, **cả hai đều đúng**: cần shell
> thì phải validate mọi giá trị nội suy; không cần shell thì đừng bật nó.

**③ Env của tiến trình con: DENYLIST, không allowlist.**
Một allowlist `{HOME, PATH, TERM}` với ý định *"đừng để lọt biến `CLAUDE_*` của phiên
này"* giết luôn lần chạy trên Windows, vì nó bỏ mất `PATHEXT`. Denylist (xoá mọi khoá
khớp `/^CLAUDE/i`) nói đúng cái yêu cầu thật. **Một allowlist phải liệt kê mọi biến mà
toolchain cần, và nó sai ngay khi toolchain cần thêm một biến nữa.**

### Vì sao `evals.command` để RỖNG trong template — và khi nào thì lấp

Rỗng là **đúng**: gọi agent tốn tiền, nên nó phải là hành động chủ động của project
đích, không phải mặc định thừa hưởng. Hệ quả cần nói ra: **template này chưa từng chạy
một eval có model tham gia**, nên theo luật 3 nó là `unknown`, không phải 0.

Bộ khung hai nhánh — khi viết thì đặt trong `evals/`, thư mục con `lib`, file `arms.mjs`
— **chưa được viết**, và đó là quyết định có mốc
kích hoạt chứ không phải việc bị bỏ quên: **viết nó khi repo tiêu thụ đầu tiên điền
`evals.command`**. Lý do: phần đắt của cơ chế này không phải `direction()` — nó là **tầng
spawn** ở ba cái bẫy trên. Viết tầng đó cho một `command` rỗng là viết một cơ chế báo
`?` vĩnh viễn, và theo tiêu chí của chính mục này, một cái gác chưa từng đỏ chưa rõ giá trị.

## Nghi thức bắt buộc: deprecation review mỗi lần đổi model

Đây là thứ ngăn harness của bạn thành nghĩa địa.

```
1. Chạy eval với harness ĐẦY ĐỦ        → điểm baseline
2. Chạy eval với harness TRẦN           → điểm floor
   (chỉ init + gate; tắt hết skill/rule/hook không phải an toàn)
3. (baseline − floor) nhỏ → phần lớn harness của bạn là DEAD WEIGHT
4. Bật lại từng mảnh, đo delta từng mảnh. Giữ mảnh có delta dương.
5. Ưu tiên nghi ngờ: negative constraint · ví dụ dùng tool · hướng dẫn lặp lại
   ở nhiều nơi · context reset · "persona" prompt
6. Ghi kết quả vào docs/adr/NNNN-harness-review-<model>.md
```

**Bước 2 — chạy với harness trần — là bước gần như không ai làm, và cho nhiều
thông tin nhất.**

Bằng chứng cho thấy điều này có thật: một cơ chế cần thiết cho model đời trước
(context reset chữa "context anxiety") trở thành **vô ích và phải gỡ bỏ** trên
model đời sau. Không ai gửi thông báo cho bạn khi một mảnh harness hết hạn.

## Chạy

```
node evals/run.mjs                 # chạy toàn bộ
node evals/run.mjs --baseline      # ghi mốc so sánh
node evals/run.mjs --bare          # với harness trần (deprecation review) — ĐÒI `evals.command`
node evals/run.mjs --task 0001     # một task
```

## `--bare` — harness trần, và phép trừ nó phục vụ

Chỉ số trung tâm của cả vòng học:

```
giá trị đo được của harness  =  eval  −  eval --bare
```

Từ **2.43.0** runner **tự làm phép trừ** và in ra, thay vì để bạn trừ hai con số bằng mắt.
Lý do không phải tiện tay: hai con số đó có **hai mẫu số khác nhau**, nên trừ bằng mắt là một
phép tính sai mà không gì báo. Runner chỉ trừ trên **giao của hai tập ĐO ĐƯỢC**, và in số task
bị loại. Giao rỗng ⇒ `?`, không phải một hiệu số.

**Cây trần là một clone dùng một lần**, không phải repo của bạn. Ranh giới gỡ là *"Claude Code
có TỰ NẠP thứ này không"*:

| | gỡ | vì sao |
|---|---|---|
| `.claude/settings.json` | ✓ | đăng ký hook + permission — không có nó, hook không chạy |
| `.claude/rules` · `skills` · `agents` · `.mcp.json` | ✓ | nạp vào context / tầng discovery |
| `CLAUDE.md` · `AGENTS.md` | ✓ | memory file, ~4.6k token (ADR 0002) |
| `.claude/hooks/**` | ✗ | script **trơ** khi không được đăng ký |
| `tooling/` · `harness.config.json` | ✗ | chỉ chạy khi **có người gọi** |

Giữ `tooling/` không phải nhân nhượng: assertion lớp 1 gọi thẳng vào đó. Gỡ nó thì lần chạy
trần đo *"harness còn tồn tại không"*, không đo *"agent có hành xử khác không"*.

**Tiền kiểm.** Trước khi agent chạy, runner chạy thử các assertion không phụ thuộc agent trên
cây trần. Cái nào **đã đỏ khi chưa có gì xảy ra** thì nó đo lớp harness chứ không đo agent ⇒
`n/a`. Không có bước này, một task như `0001` (assertion của nó đọc `.claude/`) sẽ đỏ ở lần
trần, xanh ở lần đầy đủ, và chênh lệch đó bị ghi thành *"giá trị của harness"*.

**`--bare` TỪ CHỐI chạy** khi `evals.command` rỗng (không agent nào chạy ⇒ hai lần đo không thể
khác nhau) hoặc khi không gỡ được gì. Một chỉ số không tạo ra được thì không được in ra.
