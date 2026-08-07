# Learnings — tuần W32, thiengthb (retro lần ba, 2026-08-07 tối)

<!-- ĐỀ XUẤT, chưa phải harness. DRI quyết định promote → /knowledge-promote. -->

Retro này chạy trên một repo vừa ship **12 minor trong một ngày** (v2.27.0 → v2.38.1,
20 PR, 0 revert). Ba nhóm dưới đây đều là *lỗi của sự thành công*: cơ chế chạy đúng, ghi sổ
đúng, và **cái sổ không bao giờ đóng lại được**.

---

## 1. Một bộ đếm tích luỹ SUỐT ĐỜI đang lái một tín hiệu "TỚI HẠN"

**Lần xuất hiện** (3 lần độc lập, cùng một gốc rễ):

- **v2.11.0** (`194b233`, *"lớp phân phối biết XOÁ, fixlog biết ĐÓNG"*) — nhận ra `fixlog`
  cần `--close`, và làm. **Chỉ làm ở một chỗ.**
- **v2.25.0** (#68, *"telemetry của FIXTURE thôi rơi vào sổ THẬT"*) — bịt được **nguồn**
  rò, nhưng **không dọn dòng đã rò**. Đo hôm nay: `gate-fails.log` vẫn giữ 2 dòng
  `fixture-guard-paths` / `fixture-lint-fails` (2026-08-06 13:37, 13:38). Danh mục hook vì
  thế in `protect-tests.mjs  0 qua · 1 chặn` — một hook chưa từng cho qua thứ gì mà đã
  "chặn" một lần. Con số đó sẽ **đúng như vậy mãi mãi**.
- **2026-08-07** — `/harness-propose` ĐỎ vì `rituals.mjs:478` đếm **mọi dòng từng có**, không
  cửa sổ thời gian, không trạng thái đóng. Ba lần chặn lúc `12:00:44` · `12:26:00` ·
  `12:26:01` — **cả ba đã xử lý xong** (mở `HARNESS_DRI`, rồi 11 thay đổi vùng cấm đi qua
  PR #79–#89). Việc đã xong mà nghi thức vẫn đỏ, và **không lệnh nào làm nó xanh lại được**.

**Lớp lỗi:** `state` — sổ giữ sự thật đã cũ mà không có TTL hay trạng thái đóng.

**Vì sao nguy hiểm hơn vẻ ngoài:** một tín hiệu không bao giờ xanh lại được thì **thôi là
tín hiệu**. Sau hai tuần nhìn `/harness-propose` đỏ vì việc đã xong, người đọc học được rằng
mục đó không đáng phản ứng — và lần nó đỏ **thật** thì cũng không ai phản ứng. Đây đúng là
điều `rituals.mjs:99-102` đã tự viết ra về một mục khác:

> *"Một lý do mô tả phép đo chưa từng xảy ra dạy người đọc rằng mục này không đáng phản
> ứng — và sau đó nó không được phản ứng thật."*

Bài học đó được viết ra, rồi **không áp cho cái sổ ngay bên cạnh, cùng file, cách 380 dòng.**

**Dạng biểu diễn:** `1` (contract/test) + `3` (computational control). Hai nửa:

- **Nửa cơ chế:** `telemetry()` nhận `--close`, giống `fixlog --close`. Một dòng `CLOSED|`
  vô hiệu các dòng trước cùng khoá. Mọi bên đọc (`rituals.mjs`, `harness-doctor.mjs`) đi qua
  **một** hàm `openEntries(kind)` thay vì tự `readFileSync`.
- **Nửa hợp đồng (quan trọng hơn):** một test liệt kê **mọi bộ đếm lái một tín hiệu tới
  hạn** và đòi mỗi cái khai một trong hai: `window: <ngày>` hoặc `closable: true`. Không
  khai được thì test đỏ. Đây là thứ ngăn nhóm lỗi này tái sinh lần thứ tư.

Vì sao không dùng dạng rẻ hơn: dạng `5` (gotcha một dòng) **đã tồn tại và đã thất bại** —
chính là comment ở `rituals.mjs:99-102`.

**Tầng:** project → `universal` sau khi ổn định.
**Scope:** `universal`. Xoá repo này thì *"sổ lái tín hiệu phải đóng được"* vẫn đúng.

**Thang độ trễ:** test ở gate `verify` (~s). Không đặt được ở `PostToolUse` vì đây là phép
kiểm **liên file** (đối chiếu danh mục bộ đếm với các bên đọc), không phải kiểm file vừa sửa.

**Chi phí bảo trì:** thấp. Thêm một bộ đếm ⇒ thêm một dòng khai. Đó chính là điểm.

**ĐIỀU KIỆN THOÁT:** khi mọi sổ telemetry có retention thật (rotate theo ngày), phần
`window:` thành thừa, chỉ còn `closable:`. Kiểm lại khi định dạng `telemetryDir()` đổi.

---

## 2. Bài học ghi thành COMMENT ở chỗ không hành động, không áp ở chỗ CÓ hành động

**Lần xuất hiện** (2 lần, cùng một phép đo sai):

- `tooling/overlap-scan.mjs:41` — comment ghi rõ một lần suýt hỏng:
  *"suýt bị dọn nhầm vì `git branch -r --merged` không phân biệt nó với tàn dư squash-merge."*
  Comment nằm ở file **không xoá gì cả**.
- `tooling/wt-clean.mjs:31` — file **thật sự xoá worktree** vẫn dùng
  `git branch --merged origin/main`. Đo hôm nay: PR #89 merge 13:10:45Z (squash →
  `cd450bf`), worktree sạch hoàn toàn, `wt-clean.mjs --apply` in **"giữ (chưa merge)"** và
  không xoá gì. Repo này squash **100%** số PR, nên bộ dò đó **chưa từng đúng một lần nào**.

**Lớp lỗi:** `state` — mô hình về thực tại đã cũ (`--merged` giả định có merge commit).

**Hướng lệch:** nghiêng về "giữ" nên không mất dữ liệu — và đó là lý do nó sống lâu. Hệ quả
thật: worktree tích lại **im lặng**, `/wt` không bao giờ đỏ. `L0005` lần thứ mười: *bộ đếm
không phân biệt được hai trạng thái sẽ đổ về phía dễ chịu.*

**Dạng biểu diễn:** `3` — thay phép đo, không thêm lời nhắc:
`gh pr list --head <nhánh> --state merged --json mergedAt`. Kèm dự phòng khi không có mạng
hoặc không có `gh`: giữ `--merged` **nhưng đổi nhãn** thành `? chưa xác định được` thay vì
`giữ (chưa merge)` — hai câu đó phải đọc khác nhau.

Vì sao không dùng dạng rẻ hơn: dạng `5` đã thử và **thất bại có bằng chứng** — comment ở
`overlap-scan.mjs:41` chính là nó.

**Scope:** `universal`. Mọi repo squash-merge đều dính.

**Thang độ trễ:** lệnh người gõ (~s, có gọi mạng). Không xuống `Stop` hook được: một lời gọi
GitHub API mỗi lần dừng là thuế 300–800 ms cho việc chạy 1 lần/ngày.

**Chi phí bảo trì:** thấp, nhưng thêm phụ thuộc `gh` — bắt buộc có nhánh `?` khi vắng nó.

**ĐIỀU KIỆN THOÁT:** khi repo chuyển sang merge commit thật (`--no-ff`), `--merged` lại đúng
và phần gọi `gh` thành thừa. Kiểm lại nếu chiến lược merge đổi.

---

## 3. `node -e` trong Git Bash NUỐT backtick — 5 lần trong một phiên

**Lần xuất hiện:** 5 lần ngày 2026-08-07, cùng một phiên. **Không có số PR** — và đó là một
phát hiện phụ, xem §"Ba con số".

Bash bóc backtick như command-substitution **bên trong chuỗi nháy kép**, nên mọi đoạn văn
tiếng Việt có code inline đi qua `node -e "…"` mất cả cặp nháy lẫn nội dung giữa chúng. Bốn
lần bắt được ngay; **một lần suýt ghi văn bản hỏng vào `MEMORY.md`** — tức vào chỉ thị được
nạp mỗi phiên.

**Lớp lỗi:** `tools` — giao diện tool, không phải kiến thức.

**Dạng biểu diễn:** `3` — `PreToolUse` hook trên `Bash`, khớp `node -e` / `node --eval` mà
thân lệnh có backtick chưa escape ⇒ chặn kèm câu *"dùng tool Edit/Write cho văn bản có
backtick"*.

Vì sao không dùng dạng rẻ hơn: dạng `1`/`2` không áp được — đây không phải code trong repo,
nó là **lệnh sinh ra lúc chạy**. Dạng `5`/`7` là đúng thứ đã thất bại 5 lần trong một phiên
duy nhất: agent *biết* luật và vẫn vấp, vì lỗi xảy ra ở tầng gõ lệnh chứ không ở tầng suy nghĩ.

**Scope:** `stack:git-bash-windows`. Repo Linux/macOS cũng dính nhưng tần suất thấp hơn
nhiều. **Không** gán `universal`.

**Thang độ trễ:** `PreToolUse` (~ms) — ca sách giáo khoa cho tầng này: bắt trước khi lệnh
chạy thì mất 0 đồng; bắt ở review thì văn bản hỏng đã nằm trong file.

**Chi phí bảo trì:** trung bình, **có rủi ro bắn nhầm** (`knowledge/lessons/0002`). Lệnh hợp
lệ có backtick escape đúng phải đi lọt. Bắt buộc canary 2 ngày trước khi merge.

**ĐIỀU KIỆN THOÁT:** khi không còn `node -e` nào trong luồng làm việc (mọi script tạm đi qua
file scratchpad), hook này thành thừa. Đo bằng: 30 ngày không có lần chặn nào.

---

## Đề xuất CẮT BỎ (bắt buộc)

**CẮT: giá trị mặc định của `worktree.sparsePaths` trong `.claude/settings.local.example.json`**
— hiện là `["packages/contracts", "packages/ports", "packages/core"]`.

Đo hôm nay: repo này **không có thư mục `packages/`**. Gốc repo là
`tooling/ docs/ evals/ knowledge/ features/ harness-migrations/`. `tooling/init.mjs` copy
file example nguyên xi vào **mọi consumer**, nên mọi repo con đang mang một cone trỏ vào ba
đường dẫn không tồn tại. Lần đầu ai đó gõ `claude --worktree`, `tooling/` sẽ **không được
ghi ra đĩa** — và triệu chứng sẽ đọc như "harness hỏng", không như "cấu hình sai".

Đề xuất: ship `"sparsePaths": []`, giữ nguyên `$comment_sparsePaths`. Cơ chế ở lại, **giá
trị mẫu đi**. Một giá trị mẫu sai nguy hiểm hơn không có giá trị mẫu.

**XÉT rồi GIỮ** (ghi lại để lần sau không xét lại):

- `protect-feature-files.mjs` · `protect-migrations.mjs` — cả hai `suite ✓ · ca thật chưa
  tới`. **Giữ.** Template không có feature thật và không có migration; số 0 ở đây nói về
  **mẫu vật**, không nói về cơ chế. `protect-migrations` còn gác một trong ba vùng nguy hiểm.
- `danger-zones.md` không có `paths` — **giữ.** Đúng một trong 3–5 rule toàn cục được phép.
- 12/12 skill, kịch trần. **Giữ cả 12**, nhưng từ nay **thêm skill mới ⇒ phải bỏ một cái.**

---

## Ba con số (bước 6)

| Chỉ số | Số | Xu hướng |
|---|---|---|
| sửa tay / tuần (`fixlog`) | **5** | ↓ trên giấy — **nhưng xem dưới** |
| kích thước harness | AGENTS.md −7 · rule +20 · hook +1 (+165 dòng) · lesson +2 | **PHÌNH** ✗ |
| PR revert trong 7 ngày | **0** / 87 commit · 80 merge | ✓ |

**Con số thứ nhất không đáng tin, và đó là phát hiện thứ tư của retro này.** `fixlog` chỉ
ghi được thứ có người nhớ gõ. Riêng phiên hôm nay có **≥10 lần sửa tay** đo được trong nhật
ký (5 lần backtick, 4 lần comment tự kích hoạt chính phép kiểm nó mô tả, 1 lần
`--floor-probe` đo lệch 40%) — **không lần nào vào `fixlog`**. Nên *"5 lần/tuần, đang giảm"*
là một con số dễ chịu sinh ra từ việc quên ghi, chứ không từ việc ít lỗi đi.

`L0005` lần thứ mười một, và lần này nó nằm trong chính **nguyên liệu đầu vào của vòng học**.

Hướng xử lý (chưa đề xuất cơ chế — cần thêm một lần xuất hiện độc lập nữa): cân nhắc để
`/handoff` bước 6 **hỏi thẳng** *"phiên này bạn sửa tay việc tôi làm mấy lần?"* thay vì nhắc
suông, vì `/handoff` là chỗ duy nhất trong ngày chắc chắn nhìn lại cả phiên.

---

## Nguồn thứ hai: auto-memory (bước 1)

Quét `MEMORY.md` của **3 project trên máy này** (harness 12 mục · sakubun 5 · yakudoku 4).

**MỘT MÂU THUẪN — sửa ngay, không đợi promote.** `may-nay-df-noi-doi-va-dia-gan-day` ghi
*"đĩa C thật sự gần đầy (~3.3 GB / 454 GB), đã gây ENOSPC thật"*. Đo hôm nay bằng `statfs`:
**124.8 GB trống / 453.4 GB = 27.5%**. Phần *"`df` của Git Bash nói dối"* vẫn đúng và phải
giữ; phần *"gần đầy"* đã sai. Auto-memory nạp mỗi phiên nên một sự thật hết hạn ở đó là một
**chỉ thị sai** được đọc mỗi ngày.

**MỘT ỨNG VIÊN ≥2 lần độc lập, khác project:** *"đo trước khi quy nguyên nhân"*.
`sakubun-tunnel-quic` (*"kiểm log trước khi đổ cho lần deploy"*) và
`kiem-nguyen-nhan-truoc-khi-ket-luan-can-quyen` (*"đừng suy 'cần DRI' từ chỗ triệu chứng"*)
là cùng một lớp lỗi ở hai repo không liên quan: **gán nguyên nhân cho thay đổi gần nhất thay
vì đo**. Đủ ngưỡng 2. Chưa đề xuất cơ chế trong retro này — nó thuộc lớp `verification` và
cần một vòng nữa để tìm dạng biểu diễn rẻ hơn `rule`.

**Còn lại: chỉ ở một máy, để nguyên.** Chưa phải sự thật của đội.
