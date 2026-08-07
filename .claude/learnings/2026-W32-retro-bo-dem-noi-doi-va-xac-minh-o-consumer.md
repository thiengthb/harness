# Learnings — tuần W32 (retro thứ hai), claude (agent)

> Chạy 2026-08-07. Retro trước cùng tuần: `2026-W32-retro-vai-tro-va-kenh-di-len.md`.
> Chạy MỘT MÌNH — `/harness-retro` khuyến nghị 2 người (một đề xuất, một phản biện).
> Ghi ra để người đọc chiết khấu đúng mức: mục 2 và 3 dưới đây **chưa ai phản biện**.

---

## 1. `dcg` khớp VĂN BẢN THÔ — 4× (★), và giờ có TỈ LỆ chứ không chỉ có số lần

Nhóm ★ duy nhất trong fixlog, đã là **#43**. Cái retro này thêm vào là **mẫu số**:

```
dcg.mjs   675 qua  ·  3 chặn
```

Cả **3/3 lần chặn đều là DƯƠNG TÍNH GIẢ** — đọc thẳng từ `gate-fails.log`:

| ngày | lệnh bị chặn | vì sao sai |
|---|---|---|
| 04:41 | `cat > "$TMP/dcg-probe.mjs"` | heredoc viết script **đo chính dcg** |
| 04:42 | `node tooling/rituals.mjs --review…` | một **đối số chuỗi**, không phải lệnh phá huỷ |
| 04:53 | `gh issue create --label harness…` | chặn chính lệnh **mở issue báo cáo về dcg** |

Cả ba gắn nhãn `ghi lại lịch sử chung`.

**Lớp lỗi:** Constraint

**Điểm mới, và nó đổi đề xuất CẮT ở bước 4:** ba dương tính giả này đều thuộc **mục 1** của
`dcg.DENY`, và mục 1 là **nhóm DUY NHẤT được `permissions.deny` phủ ĐỦ** (`Bash(git push
--force:*)` · `Bash(git push -f:*)` — bảng đối chiếu 12 nhóm ở comment của #43).

Nghĩa là: **cắt đúng mục sinh ra 100% dương tính giả thì không mất tầng nào.**

---

## 2. Việc đã SHIP, xác minh còn NỢ, và bản ghi duy nhất nằm ở auto-memory máy-cục-bộ

**Nhóm lớn nhất tuần này, và fixlog KHÔNG thấy nó** — vì nó không xảy ra trong repo template.
Nguồn: `MEMORY.md` của ba project trên máy này (bước 1, nguồn thứ hai).

**4 ca độc lập trên 2 project:**

| project | mục auto-memory | trạng thái xác minh |
|---|---|---|
| yakudoku | *MCP expansion* | "merged to main + pushed (deploying); **live smoke pending**" |
| yakudoku | *grading quality* | "pushed to main (deploying); **live ping verify pending**" |
| yakudoku | *word lookup* | "pushed to main; **needs seed-kanji + seed-dict + live verify**" |
| sakubun-single-user | *mobile app state* | "đã deploy + build APK, **chặn vì chưa có thiết bị kiểm chứng**" |

Số đo đóng đinh:

```
sakubun-single-user   harness: CÓ (v2.13.0)   features/ thật: 0
```

`features/` ở đó **chỉ có `_index.json` và `_TEMPLATE.json`**. Repo **đã ship** nhiều thứ,
đang **nợ xác minh có thật**, và `features/*.json` — cơ chế default-FAIL + `evidence` mà
`AGENTS.md` gọi là **"không thương lượng"** — **chưa được dùng lần nào**.

Nợ xác minh có tồn tại. Nó chỉ không nằm ở chỗ harness nhìn được. Nó nằm ở auto-memory:
**gitignore, máy-cục-bộ, không ai review, và nạp 200 dòng vào MỌI phiên như chỉ thị thật.**

Đó chính là điều `AGENTS.md` §"Hai bộ nhớ, hai vai" cấm: *"một sự thật ở cả hai chỗ là một
LỖI"*. Ở đây tệ hơn — sự thật chỉ ở **một** chỗ, và là chỗ SAI.

**Lớp lỗi:** Verification

**Vì sao nó không tự lộ ra:** mọi cơ chế đo của harness (`check-feature-integrity`,
`gates preMerge`, `/verify-ui`) đều lặp qua `features/*.json`. Không có feature nào ⇒ chúng
lặp qua tập rỗng ⇒ **xanh**. Một mẫu số bằng 0 làm mọi tỉ lệ thành 100%. Cùng lớp lỗi với
`evals/run.mjs` vừa sửa ở v2.24.0, chỉ khác chiều: ở đó "chưa đo" thành FAIL, ở đây thành PASS.

**Dạng biểu diễn đề xuất:** `3` (computational control) — `harness-doctor` ở repo **consumer**
phải nói ra khi `features/` rỗng mà repo CÓ commit trong 7 ngày qua. Không phải "bạn nên dùng
features" (lời khuyên chung, sẽ bị bỏ qua) mà là một câu có số: *"N commit tuần này, 0 feature
được khai — lớp xác minh của harness đang chạy trên tập rỗng."*

Vì sao không rẻ hơn: `5` (gotcha) và `6` (skill) là **thêm chữ cho người đọc** — mà `AGENTS.md`
đã có sẵn mục "Verification (không thương lượng)" và nó **đã thất bại**. Vì sao không `1`
(test): tính chất này thuộc repo ĐÍCH lúc chạy, không thuộc code template.

**Độ trễ:** `harness-doctor` (~phút). Không đặt nhanh hơn được — câu hỏi là *"tuần qua có ship
gì mà không khai feature không?"*, nó cần lịch sử git.

**Tầng:** project · **Scope:** `universal` · **Bảo trì:** thấp (một phép đếm)

**ĐIỀU KIỆN THOÁT:** khi ≥1 consumer có feature thật kèm `evidence` trong 30 ngày liên tiếp,
cảnh báo này thành nhiễu ⇒ hạ xuống `--verbose`, hoặc cắt.

---

## 3. Bộ đếm mà chính bước 4 đọc ĐẦU TIÊN đang bị nhiễu — 2/6 mục

Bước 1 dặn: *"Đọc cột `N qua · M chặn` TRƯỚC khi đọc bất cứ gì khác."* Tôi đọc, rồi đọc luôn
`gate-fails.log` thô. Cột `project` lộ ra:

```
04:41  CHANGEME-project-id   dcg                    ← thật (dương tính giả)
04:42  CHANGEME-project-id   dcg                    ← thật (dương tính giả)
04:53  CHANGEME-project-id   dcg                    ← thật (dương tính giả)
09:21  CHANGEME-project-id   protect-tests          ← THẬT, và là lần cứu THẬT DUY NHẤT
13:37  fixture-guard-paths   block-generated-edit   ← KHÔNG THẬT
13:38  fixture-lint-fails    post-edit-lint         ← KHÔNG THẬT
```

Hai mục cuối mang **project id của FIXTURE**. Chúng không phải công việc thật bị chặn.

**Suite thì sạch** — đo trực tiếp: chạy `test-hooks` + `test-evals`, `gate-fails.log` giữ
nguyên **6 → 6 dòng**. `TEST_ENV` có `HARNESS_TELEMETRY_DIR` từ v2.13.0 và `mutate()` truyền
nó xuống. Nguồn rò là **probe hook BẰNG TAY lúc phát triển**: chạy hook với `HARNESS_CONFIG`
trỏ fixture nhưng quên chuyển đích telemetry. Suite có kỷ luật; probe tay thì không — và probe
tay là đúng thứ người ta làm khi đang viết một hook.

Hệ quả đo được — 6 lần chặn từ trước tới nay:

| | |
|---|---|
| cứu THẬT | **1** (`protect-tests` bắt edit rút `example.test.js` từ 3 assert xuống 0) |
| dương tính giả | **3** (dcg) |
| rác của chính quá trình phát triển | **2** |

Bảng "hook nào đang gánh việc" — thứ quyết định CẮT cái gì — đang **nói quá về hai hook**.

**Lớp lỗi:** Verification (công cụ đo tự làm nhiễu số của mình)

**Dạng:** `3` — `telemetry()` ở `lib/harness.mjs` **từ chối ghi vào thư mục thật** khi
`config().project.id` bắt đầu bằng `fixture-`. Một mệnh đề, ở đúng chỗ mọi đường ghi đi qua.
Không cần ai nhớ gì, kể cả lúc probe tay lúc 2 giờ sáng.

Vì sao không `5` (một dòng *"nhớ set HARNESS_TELEMETRY_DIR khi probe"*): đó là lời nhắc cho
người đang gấp, và người đang gấp luôn tồn tại — `danger-zones.md` nói đúng câu này.

**Độ trễ:** tại chỗ ghi (~ms). Không có tầng nào nhanh hơn.
**Tầng:** project · **Scope:** `universal` · **Bảo trì:** ~0

**ĐIỀU KIỆN THOÁT:** khi mọi fixture config bị cấm nằm ngoài `tooling/fixtures/` và
`telemetry()` đọc được điều đó từ ĐƯỜNG DẪN, mệnh đề theo `project.id` thành thừa.

---

## 4. Một mục fixlog đã TỰ HẾT mà chưa ai đóng

```
1×  protect-feature-files chặn features/_index.json mà không gọi telemetry('gate-fails')
    trước block() — gác chặn thật nhưng vô hình
```

Đã sửa **tận gốc** ở v2.17.0: `block()` tự ghi sổ, nên không còn cách nào viết ra một gác câm.
Mục này chưa đủ ngưỡng ≥2 và **sẽ không bao giờ đủ** — cơ chế sinh ra nó đã biến mất.

Để nó nằm đó làm `fixlogTotal` nói quá và làm nhóm ★ trông nhỏ hơn tương quan thật.
**Đóng bằng `fixlog.mjs --close`** — không phải đề xuất harness, chỉ là vệ sinh số đo.

---

## Đề xuất CẮT BỎ (bắt buộc)

### ✂️ CẮT — `dcg.DENY` mục 1 (`ghi lại lịch sử chung`)

Cắt **hẹp và có số đo**, không phải cắt cả `dcg`:

| | |
|---|---|
| mục 1 sinh ra | **3/3** dương tính giả của dcg |
| mục 1 được tầng 1 phủ | **ĐỦ** — `Bash(git push --force:*)` · `Bash(git push -f:*)`, vendor cưỡng chế |
| cắt đi thì mất gì | **không tầng nào** |

Ca hiếm: một mục vừa có **chi phí đo được** vừa có **giá trị bằng 0 đo được**.
11 mục còn lại của `dcg.DENY` **GIỮ** — 8 trong số đó không có tầng 1 nào (bảng ở #43), nên
cắt chúng là đi từ *một tầng yếu* xuống **không tầng nào**.

`.claude/hooks/dcg.mjs` ∈ vùng khoá ⇒ gộp vào **#43**, không mở issue mới.

### ✂️ CẮT — `AGENTS.md` §Nghi thức (11 dòng → 2)

Đã mở ở **#63** với số đo. Nhắc lại để retro này có mục cắt của chính nó, không phải mở lần hai.

### 🚫 KHÔNG CẮT — `block-secrets.mjs` (292 chạy · **0 chặn**)

Con số đọc như ứng viên cắt số một. Nó không phải.

`0 chặn` ở một gác secret là **kết quả mong muốn**, không phải bằng chứng vô dụng — nó nói
"chưa ai suýt commit secret". Và giá trị của nó **bất đối xứng**: một lần bỏ lọt là một
credential trong lịch sử git công khai, không rollback được.

Ghi ra vì bước 4 **bắt buộc xét cắt**, và cách hỏng của bước 4 là cắt nhầm thứ đang im lặng
làm việc — đúng cảnh báo ở bước 1 của chính skill này.

---

## Ba con số

| Chỉ số | Giá trị | Xu hướng |
|---|---|---|
| sửa tay / tuần | **5** (retro trước: 14) | **↓ tốt** — và 4/5 là cùng một nhóm |
| kích thước harness | AGENTS.md 150 · hooks 691 · rules 188 · skills 1119 — **PHẲNG**; chỉ `lessons +1` | **↔ tốt** |
| PR revert 7 ngày | **0** | ✓ |

`harness-size` in `WARN Harness đang PHÌNH`, nhưng delta duy nhất so baseline là **+1 bài
học** — lớp *kiến thức* lớn lên trong khi lớp *cơ chế* đứng yên. Đó là chiều đúng.
**Cảnh báo đang nói quá; ứng viên cho retro sau.**

**Chẩn đoán theo luật bước 6:** sửa tay ↓, harness phẳng, revert 0 ⇒ **harness đang co lại
đúng chỗ**. Khác hẳn tuần trước (*"sửa tay cao và harness lớn"*). 16 PR merge tuần này, phần
lớn là **sửa công cụ đo nói dối**, không phải thêm cơ chế.

Nhưng đừng đọc là "xong": mục 2 nói chỗ hỏng đã **dời khỏi repo template** sang repo tiêu thụ,
nơi không bộ đếm nào của retro này nhìn tới. Ba trong bốn con số ở trên đo template.
**Retro sau nên bắt đầu từ consumer.**
