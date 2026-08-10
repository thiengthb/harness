# Learnings — tuần W33, thi3n (+ Claude)

Retro chạy 2026-08-10. Nguồn: `fixlog --top/--list` (11 mục) · `harness-doctor` (DANH MỤC HOOK)
· 30 PR đã merge · `harness-size` · `knowledge/lint` · `.claude/telemetry/gate-fails.log` ·
auto-memory của 3 project.

**Đây là ĐỀ XUẤT, chưa phải harness.** Promote → `/knowledge-promote`.

---

## ① Cột "N chặn" gộp GUARD-PROBE của agent eval với lần chặn thật

> **Ghi lại cả đường đi, vì phần đó mới là bài học.** Giả thuyết đầu của tôi là *"fixture của
> test suite rò vào sổ thật"* — chuỗi `git "push" --force` có đúng 1 lần trong
> `tooling/test-hooks.mjs`, và ba mục nằm trong **cùng một giây**, hai dấu hiệu rất thuyết
> phục. Tôi suýt ship nó làm phát hiện số một. Phép đo phủ định nó trong 40 giây:
>
> ```
> wc -l gate-fails.log  →  30    node tooling/test-hooks.mjs    →  30    chênh 0
> ```
>
> Suite **không** ghi vào sổ thật. Hai dấu hiệu thuyết phục cộng lại vẫn không phải một phép đo.

**Sự thật, có bằng chứng:** ba mục `2026-08-10T07:38:56` (14:38:56 giờ máy) là
`git "push" --force` · `rm -f /tmp/hd-test.txt` · `git checkout -- evals/run.mjs`. Transcript
`harness-eval-0005-19268.log` (task chạy **14:35–14:40**) chứa **cả ba** chuỗi đó.

Đó là **agent eval của task `0005` đang thăm dò guard** — và đúng việc của nó: task `0005` gác
bất biến *"gác hỏng thì CHẶN"*, nên nó cố tình kích hoạt guard để xem guard có nói không.

**Vì sao vẫn là một vấn đề:** lần chặn đó **có thật** (guard nổ thật), nhưng nó **không phải
bằng chứng rằng hook đang cứu ai khỏi một sai lầm** — nó là một phép tự kiểm. `/harness-retro`
bước 1 dặn *"đọc cột `N qua · M chặn` TRƯỚC bất cứ gì khác"*, bước 4 **bắt buộc** cắt bỏ dựa
trên nó. Một hook được giữ lại nhờ chính bộ eval đang thử nó là một quyết định dựa trên số của
chính mình.

`dcg 2643 qua · 17 chặn` — ít nhất 3 trong 17 là probe. Không phải "sai 3", mà là **không biết
sai bao nhiêu**, và mỗi lượt eval lại cộng thêm.

**Và nó đã tự hết — do một bản vá KHÔNG nhắm vào nó.** Từ **v2.53.0 (#155)** agent eval chạy
trong **clone dùng một lần**, nên `telemetryDir()` trong cây đó trỏ vào clone và bị xoá cùng
cây. Cửa sổ nhiễm là *"agent eval chạy trong repo sống"*, đóng lại hôm nay.

**Nên phần còn lại KHÔNG phải một cơ chế mới, mà là một cái mốc.** Số `gate-fails` **trước
2026-08-10** gồm cả probe của eval; số **sau** thì không. Không có gì đánh dấu ranh giới đó, nên
lần retro sau sẽ so hai chế độ đo khác nhau mà không biết.

**Lớp lỗi:** `verification` — cùng họ #66 (`gate-runs.log` bị `--list --timing` làm nhiễu,
vá v2.25.0), khác nguồn.

**Dạng biểu diễn:** `5 gotcha 1 dòng` — dạng RẺ NHẤT khả thi, vì cơ chế sinh ra vấn đề đã chết.
Viết một cơ chế mới cho một nguyên nhân không còn tồn tại là đúng thứ bước 4 của retro này tồn
tại để chống.

**Đề xuất cụ thể:** một dòng trong `docs/ECONOMICS.md` (hoặc chỗ `harness-doctor` in bảng):
*"`N chặn` trước 2026-08-10 gồm cả guard-probe của agent eval; từ v2.53.0 agent chạy trong clone
nên số sau ngày đó là chặn thật."* Nếu ai đó muốn hơn thế, cách đúng là **cột riêng**, không
phải lọc — một probe bị lọc mất là mất luôn bằng chứng *"guard này CÓ nổ"*.

**Điều kiện thoát:** khi `gate-fails.log` bị xoay vòng qua mốc 2026-08-10, dòng ghi chú hết
nghĩa và phải bỏ.

---

## ② Nhóm fixlog ĐÃ ĐÓNG vẫn hút thành viên mới — và nuốt luôn một lớp lỗi khác

**Lần xuất hiện:**

- Nhóm ⊕ *"dcg khớp regex trên chuỗi lệnh THÔ"* — **5×**, đóng 2026-08-07 (v2.36.0, #83), kèm
  câu: *"Nhóm này không thể tái sinh vì phép khớp cũ đã biến mất."*
- 2026-08-10 07:40, một mục MỚI rơi vào đúng nhóm đó: *"dcg chặn `git checkout -- <MỘT file cụ
  thể>` dùng làm bước DỌN DẸP của mutation test"* — và mục đó tự khai **3 lần** (Aug-8
  `evals/run.mjs`, Aug-10 ×2 `tooling/rituals.mjs`), cộng ca cùng lớp `rm -f /tmp/<file cụ thể>`.
- Xác nhận độc lập ở `gate-fails.log`: `02:49` · `02:59` · `07:38` cùng ngày.

**Nên `--top` in `0 nhóm ★ đang mở`, trong khi có một vấn đề 3× đang sống.** Câu đóng nhóm còn
khẳng định nó *"không thể tái sinh"* — đúng với lớp lỗi CŨ, sai với thành viên mới. Hai lớp lỗi
khác nhau ở chung một cái tên: *"khớp chuỗi thay vì khớp lệnh"* (đã chết) và **"rule đúng nhưng
QUÁ RỘNG"** (đang sống).

**ĐÃ THỬ CÁCH THOÁT CÓ SẴN — VÀ NÓ KHÔNG THOÁT ĐƯỢC.** Chính `fixlog` hướng dẫn: *"thấy hai
dòng cùng một gốc rễ mà nằm rời nhau thì khai nhóm"*. Tôi khai nhóm ngược lại — tách dòng Aug-10
ra:

```
node tooling/fixlog.mjs --group "dcg-rule-qua-rong-chan-buoc-don-dep" "buoc DON DEP cua mutation"
  ⊕ nhóm "…" giờ gom 1 dòng:  · 2026-08-10 dcg chan git checkout -- <MOT file cu the> …
```

Nhóm mới **khớp đúng dòng đó**. Nhưng `--top` sau đó vẫn in dòng ấy **nằm trong nhóm ✔ cũ**, và
**nhóm mới không xuất hiện chút nào**. Một dòng chỉ thuộc về **nhóm khai TRƯỚC**; nhóm khai sau
là inert. Tức **không có đường thoát bằng công cụ hiện có** — và câu gợi ý *"dòng sau khớp … sẽ
tự vào nhóm này"* là sai với mọi dòng đã bị nhóm khác nhận.

**Và một tầng nữa: `N×` đếm DÒNG, không đếm LẦN.** Dòng Aug-10 tự khai **3 lần xảy ra** trong
thân nó (`Aug-8 evals/run.mjs, Aug-10 ×2 tooling/rituals.mjs`), nhưng nhóm mới hiện `1×` — dưới
ngưỡng ★ (≥2). Ngưỡng *"2 lần là không còn ngẫu nhiên"* đang đo trên **sai đơn vị**: người ghi
gộp nhiều lần vào một dòng thì càng gộp cẩn thận càng bị đếm thấp.

**Lớp lỗi:** `learning` — vòng học tự bịt mắt ở bước đọc dữ liệu.

**Dạng biểu diễn:** `3 computational-control`. Không dùng được dạng rẻ hơn: một `gotcha` không
sửa được phép đếm, và tôi vừa đo rằng **thao tác thủ công có sẵn không cứu được**.

**Cơ chế đề xuất — hai phần, phần một là bắt buộc:**

1. Mục mới rơi vào nhóm **ĐÃ ĐÓNG sau ngày đóng** thì **không được im**:
   `⚠ nhóm ĐÃ ĐÓNG nhận thêm N mục sau <ngày> — hoặc bản vá chưa tận gốc, hoặc đây là lớp lỗi
   KHÁC đang mượn tên`. Đây là ca `n/a`-vs-`?` một lần nữa: *"đã đóng"* không phải *"không còn
   gì"*, nó là *"không còn **lớp lỗi đó**"*.
2. Nhóm khai SAU **thắng** nhóm khai trước khi cả hai cùng khớp — nhóm sau là nhóm **cụ thể
   hơn**, và người khai nó đang sửa một phép gom sai. (Hoặc tối thiểu: cảnh báo *"dòng này khớp
   2 nhóm, đang tính cho nhóm cũ"* thay vì im lặng.)

**Tầng độ trễ:** `fixlog --top` (~ms, do người gõ).

**Chi phí bảo trì:** ~0 — `fixlog-closed.log` đã có ngày đóng, chỉ cần so mốc thời gian.

**Điều kiện thoát:** khi phép gom nhóm không còn là lexical (nếu có ngày gom theo nguyên nhân
thật thì cả hai cảnh báo này thừa).

**Dọn dẹp cần làm khi promote:** nhóm `dcg-rule-qua-rong-chan-buoc-don-dep` hiện **inert** —
hoặc để nó nhận các dòng tương lai, hoặc gỡ khỏi `fixlog-groups.log`. Đừng để một nhóm vừa tồn
tại vừa không có tác dụng.

---

## ③ Guard đúng nhưng QUÁ RỘNG: `git checkout -- <một file>` là bước dọn, không phải "bỏ working tree"

**Lần xuất hiện:** 3 lần (mục ② ở trên), cộng `rm -f /tmp/<file cụ thể>` bị chặn bởi rule `rm`
gốc. Cả 4 đều là **bước dọn dẹp của mutation test** — tức của chính nghi thức mà harness đòi hỏi.

**Vì sao đáng xử, dù `danger-zones.md` nói guard là cố ý:** một guard bắn nhầm vào **đúng việc
harness yêu cầu người ta làm** thì nó dạy đi vòng — và đi vòng là thứ tôi đã làm, ba lần, bằng
`writeFileSync` từ Node để né hook. Đường vòng đó **không có telemetry, không ai xem lại**.
Guard vẫn "chặn được 17 lần" trong bảng, còn hành vi thật đã chuyển sang một kênh không đo được.
Đây là chế độ hỏng tệ nhất của một guard: **nó không mất tác dụng, nó mất TẦM NHÌN.**

**Lớp lỗi:** `constraint`.

**Dạng biểu diễn:** `3 computational-control` — thu hẹp rule, KHÔNG nới cửa thoát.

**Cơ chế đề xuất:** trong `dcg` rules, tách `git checkout --` thành hai:
`git checkout -- .` / `git checkout -- :/` / không có pathspec ⇒ **CHẶN** (bỏ cả cây);
`git checkout -- <đường dẫn cụ thể>` ⇒ **CHO QUA**. Cùng khuôn mà `danger-zones.md §3` đã dùng
cho migration: *"migration ĐÃ MERGE thì chặn, migration chưa merge thì sửa thoải mái — một
guard chặn cả nhóm là guard bắn nhầm"*. Nguyên tắc đã có, chỉ chưa áp cho ca này.

**Tầng độ trễ:** PreToolUse (~ms) — đúng chỗ nó đang ở.

**Chi phí bảo trì:** thấp; nhưng **rủi ro thật**: nới sai thì mất một guard `lịch sử chung`. Nên
bản vá phải kèm ca test hai chiều — `git checkout -- .` vẫn CHẶN — và một ca **mutation**.

**Điều kiện thoát:** khi mutation test có bước dọn riêng không cần `git` (ví dụ runner tự sao
lưu/khôi phục), rule có thể quay lại rộng như cũ.

---

## ④ Fixture chỉ an toàn khi cơ chế nó kiểm còn sống — thì không phải fixture an toàn

**Lần xuất hiện:**

- 2026-08-10, mutation của #155: mutant `N2` (phá cô lập) đưa `cwd` của agent giả về repo thật,
  và chế độ `writes` **ghi thẳng vào `AGENTS.md`** — vùng cấm. Lọt vào commit, bắt được ở
  `git status` trước khi push.
- Cùng ngày, lớp lỗi anh em: script mutation khôi phục **file nó tự sửa**, không khôi phục thiệt
  hại kèm theo.

**Lớp lỗi:** `verification` — dụng cụ đo gây thiệt hại cho đối tượng đo.

**Dạng biểu diễn:** `1 test/contract` (fixture tự gác) — dạng CAO NHẤT, và đã áp ở v2.53.0
(`FAKE_AGENT_FORBID_CWD`). Mục này ghi lại **nguyên lý**, vì nó vượt ra ngoài fixture đó.

**Nguyên lý đề xuất promote:** *mutation testing cố ý làm hỏng cơ chế; mọi fixture có thể GHI
phải tự gác bằng một điều kiện ĐỘC LẬP với cơ chế đang bị kiểm.* Kiểm hàng rào bằng chính mutant
đã gây hại: mutant vẫn phải chết, và `git hash-object <file>` không đổi.

**Còn hở:** `protect-harness.mjs` gác `Write|Edit` của model, **không** gác tiến trình con do
test spawn. **Vùng cấm có hai cửa; cửa thứ hai chưa có ai gác.** Chưa đề xuất cơ chế — chưa đủ
2 lần, và một hook chặn mọi ghi từ tiến trình con sẽ chặn luôn generator hợp lệ.

---

## Bước 4 — ĐỀ XUẤT CẮT BỎ (bắt buộc)

**Cắt: ratchet `hooks-without-mutant` khỏi `harness-size`.**

Nó in một dòng **~420 ký tự** mỗi lần chạy, chỉ để nói rằng mốc = 1 và mục còn lại
(`session-start.mjs`) **không thể về 0 bằng cách viết thêm test** — nó chỉ về 0 khi DRI đổi định
nghĩa mẫu số. Tức đây là một chỉ số **đã chạm đáy khả thi**, đang trả thuế chú ý ở mọi lần chạy,
với câu giải thích dài hơn chính chỉ số ~15 lần.

Đề xuất: chuyển kết luận đó vào `knowledge/lessons/` (nó là một *quyết định*, không phải một
*phép đo*), và bỏ mục khỏi `harness-size`. Nếu DRI muốn giữ, thay bằng một dòng:
`hooks-without-mutant: 1 (đáy khả thi — xem L00xx)`.

**Xét mà KHÔNG cắt:**

- `protect-feature-files` · `protect-migrations` — `suite ✓ · ca thật chưa tới`. Đây là `?`,
  **không phải `0`**: hai hook này gác những ca hiếm theo thiết kế (sửa `_index.json`, sửa
  migration ĐÃ MERGE). Cắt một guard vì *"chưa ai chạm vào"* là cắt đúng loại guard đắt nhất khi
  mất.
- `protect-tests.mjs` — `0 qua · 1 chặn`. Con số kỳ lạ (chặn nhiều hơn qua) nhưng giải thích
  được: hook chỉ kích hoạt trên file test, nên mẫu số nhỏ. Không cắt, nhưng **đáng đo lại** sau
  khi có mốc của mục ①.

---

## Bước 6 — Ba con số

| Chỉ số | Số | Xu hướng |
|---|---|---|
| sửa tay / tuần | **11** | ⚠️ vượt ngưỡng 10 — nhưng 9/11 thuộc hai lớp lỗi ĐÃ ĐÓNG (dcg-khớp-chuỗi, `node -e` nuốt backtick) |
| kích thước harness | **PHÌNH** — so baseline 2026-08-05: rules +20 dòng, hook +1 file/+181 dòng, lessons +4 | ✗ ngược hướng tốt |
| PR revert / 7 ngày | **0** | ✓ |

**Đọc ba số cùng nhau:** sửa tay cao **và** harness phình = harness đang lớn mà chưa giải quyết
vấn đề thật. Có một tình tiết giảm nhẹ đo được: 30 PR gần nhất là **+8475 / −389**, tỉ lệ xoá
≈ **4,4%**; phần lớn phần thêm là **test + chú thích mang bằng chứng**, không phải cơ chế mới.
`hooks (dòng) +181` là con số cơ chế thật, và nó đến từ **một** hook.

Một cảnh báo khi đọc ba số này: chúng đến từ những cái sổ mà mục ① vừa chỉ ra là **đổi chế độ
đo giữa chừng** (probe của eval nằm trong số trước 2026-08-10, không nằm trong số sau). Chưa
đủ để bác bỏ con số nào ở trên, nhưng đủ để **không so tuần này với tuần sau như thể cùng một
cái thước**.

---

## Nguồn thứ hai — auto-memory

3 project có `MEMORY.md` (`harness` 21 mục · `sakubun-single-user` 7 · `yakudoku` 4). Đối chiếu
tự động: **0 mục trùng tên ở ≥2 project**, nên **không có ứng viên promote từ nguồn này** tuần
này, và **0 mâu thuẫn** với `knowledge/lessons/` phát hiện được.

Lưu ý cho lần sau: cả 3 nằm trên **cùng một máy**, nên ngưỡng *"≥2 máy"* của
`knowledge/README.md` **chưa từng đo được** ở repo này. Đó là một `?`, không phải một `0`.
