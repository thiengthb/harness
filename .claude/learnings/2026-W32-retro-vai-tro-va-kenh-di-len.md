# Learnings — 2026-W32, retro (thien)

> Chạy 2026-08-05. Nguyên liệu: 14 mục fixlog cục bộ + **20 mục fixlog từ 3 repo tiêu thụ**
> (`knowledge/incoming/`) + danh mục hook + `harness-size` + `evals/run.mjs`.
> Đây là ĐỀ XUẤT, chưa phải harness. DRI quyết định promote → `/knowledge-promote`.
>
> Auto-memory: 2 mục, không mục nào mâu thuẫn `knowledge/lessons/`, không mục nào ở ≥2 máy
> ⇒ để nguyên (chưa phải sự thật của đội).

---

## 1. Kênh đi LÊN gửi fixlog, nhưng KHÔNG có bên nhận — 20 mục từ 3 repo vô hình với mọi công cụ

**Bằng chứng cấu trúc, đo trực tiếp hôm nay:**

| công cụ | trả lời cho cùng câu hỏi "có việc gì đang chờ?" |
|---|---|
| `ls knowledge/incoming/` | 3 thư mục |
| `harness-doctor` | `3 pack chờ duyệt — quyết đi: accept.mjs --list` |
| `accept.mjs --list` | `Không có gì trong knowledge/incoming/.` |
| `rituals.mjs --all` | `OK · không có pack chờ quyết` |

- `knowledge/incoming/{warehouse,sakubun,sakubun-test}/fixlog.md` — 10 + 7 + 3 = **20 mục**,
  gửi 2026-08-05T08:03. Cả ba `pack.json` có `"lessons": []`.
- `tooling/knowledge/accept.mjs:46` `incomingLessons()` chỉ duyệt `incoming/<pack>/lessons/`.
- `grep -rn "fixlog.md" tooling/ .claude/skills/` → **chỉ `upstream.mjs`** (bên GỬI).
  Không một dòng nào ĐỌC nó.

**Điểm cay nhất:** comment `upstream.mjs:150-159` ghi rõ *"cả 6 bài học đều [không mang đi
được]… nên fixlog đi lên dưới dạng NGUYÊN LIỆU"* — tác giả biết fixlog mới là payload có giá
trị, rồi xây đúng một nửa. Nghi thức — thứ duy nhất người ta đọc mỗi phiên — báo **OK**.

**Lớp lỗi:** `state` (hai đầu một kênh, hai mô hình về "cái gì đang chờ")

**Dạng:** `1 test/contract` — `accept.mjs --list` phải liệt kê **mọi** field mà `upstream.mjs`
biết gửi, neo vào `pack.json` (`fixlogEntries` · `lessons` · `evals` · `artifacts` ·
`mechanismDiffs`). **Một danh sách, hai đầu** — đúng lý do `gates.mjs` tồn tại.
Kèm `3 computational-control`: `rituals.mjs` đếm theo cùng nguồn đó.

**Tầng:** org · **Scope:** `universal` · **Độ trễ:** CI/doctor (bất biến giữa hai file, không
đặt nhanh hơn được) · **Bảo trì:** thấp — gộp 3 phép đếm thành 1.

**ĐIỀU KIỆN THOÁT:** khi `upstream.mjs` và `accept.mjs` đọc chung một schema pack — không còn
hai mô hình để lệch.

---

## 2. `repoRole()` có từ v2.7.7 nhưng công cụ vẫn hỏi câu SAI — 4 lần, 3 repo

**Lần xuất hiện:**

- `sakubun` (2026-08-03) — `apply-to.mjs --audit` chỉ đúng ở repo TEMPLATE, nhưng `doctor.mjs`
  và `harness-parity.yml` chạy nó ở **mọi** project đích ⇒ 351 file source báo thiếu, CI
  parity fail mọi PR.
- `sakubun-test` (2026-08-03) — cùng triệu chứng, repo độc lập thứ hai.
- `harness` (2026-08-04) — doctor chặn theo **dấu của quy trình** (`!manifest.profile`) thay
  vì theo **kết quả**. Đã sửa.
- `harness` (2026-08-05) — `.claude/hooks/session-start.mjs:203`:
  `if (!c.commands?.verify && !c.commands?.test)` in *"gate đang rỗng. Đây là việc số 1 cần
  làm."* mà **không hỏi `repoRole()`**.

**Vì sao mục cuối nghiêm trọng hơn một cảnh báo thừa:** trên repo template, `commands` rỗng là
placeholder ĐÚNG — `ci.yml` mang sẵn `HARNESS_ALLOW_SKIPPED_GATES: '1'` kèm lý do, và
`harness.config.json` nằm trong `SEED` của `apply-to.mjs` nên điền lệnh vào đây **rò sang mọi
consumer tương lai**. Cảnh báo này nổ **mọi phiên, cho mọi người**, về một file mà
`protect-harness` **cấm sửa**, và nó suýt làm tôi đi điền lệnh vào file SEED trong chính phiên
này.

**Bằng chứng đây là lỗi hệ thống chứ không phải 4 bug rời:** `repoRole()`
(`tooling/lib/harness.mjs:550`) xây ở **v2.7.7, PR #18**, tiêu đề đúng chữ *"một nguồn cho
phép TỰ NHẬN DIỆN của harness"*. `harness-doctor` **dùng nó đúng** — in
`ℹ Đây là REPO TEMPLATE — placeholder CHANGEME là đúng` — rồi ngay dưới, mục *"Nên làm"* vẫn
liệt kê `chưa khai commands.verify · typecheck · test`. **Cùng một công cụ, biết vai trò ở
đoạn này và quên ở đoạn kia.**

**Lớp lỗi:** `context` (chỉ thị đúng-ở-vai-khác nạp vào mọi phiên)

**Dạng:** `3 computational-control` + `1 test`. Không rẻ hơn được: không gotcha nào sửa được
một dòng chữ do máy in ra. **Một** thay đổi: mọi câu "chưa khai `commands.*`" đi qua một
helper `configTodos({ role })`; `test-hooks.mjs` thêm case *"trên repo template, session-start
KHÔNG nhắc commands rỗng"*.

**Tầng:** org · **Scope:** `universal` · **Độ trễ:** `1 test` (~s), không phải CI — đây là
logic của chính hook · **Bảo trì:** âm về lâu dài, nó gộp 3 chỗ đang hỏi khác nhau.

**ĐIỀU KIỆN THOÁT:** `grep -rn "commands?.verify\|commands?.test" .claude/hooks/ tooling/` chỉ
còn trỏ vào một helper.

---

## 3. So khớp trên VĂN BẢN THÔ, không phân biệt tầng cú pháp — nhóm lớn nhất tuần này

**Lần xuất hiện (4 cơ chế khác nhau, cùng một gốc):**

- `dcg.mjs` chặn oan **3 lần trong một phiên** (2026-08-05): (1) heredoc chứa chuỗi lệnh nguy
  hiểm làm **dữ liệu thử**; (2) một từ nằm trong chuỗi `echo`; (3) chính mục fixlog mô tả nó —
  *không ghi được qua Bash vì việc ghi làm nó nổ*.
- Quét import của guard bootstrap neo vào **comment** nên tố chính `upgrade.mjs` (ghi rõ *"lần
  thứ 3"*). Đã bỏ ở v2.10.3 (PR #32) — bỏ hẳn phép đo proxy.
- `harness-doctor` báo *"tham chiếu chết `/whats-new`"* trong khi hai chỗ nhắc **chính là bia
  mộ** (`TOMBSTONES` ở `lib/harness.mjs:593` + `harness-migrations/010`). Bia mộ **bắt buộc**
  gọi tên thứ không còn tồn tại — đó là việc của nó. Check tố cáo đúng cơ chế được viết ra để
  dọn xác.
- `governanceDrift` (v2.12.0) từng đọc điều cấm **gói xuống hai dòng** thành thiếu — đã có
  assertion, ghi trong `2026-W32-gac-nem-loi-thi-cho-qua.md §4`.

**Gốc chung:** khớp regex trên văn bản thô mà không phân biệt **lệnh sẽ chạy** với **chuỗi
được in ra**, **code** với **comment**, **trỏ tới thứ sống** với **ghi nhận thứ đã chết**.

**Dạng:** `3 computational-control` — strip chuỗi/comment trước khi khớp, hoặc chỉ khớp phần
lệnh ngoài dấu nháy. **KHÔNG nới danh sách DENY** (nới = đổi dương-tính-giả lấy âm-tính-giả,
ở đúng nhóm nguy hiểm nhất). Với doctor: bỏ qua đường dẫn nằm trong `TOMBSTONES`.

**Tầng:** org · **Scope:** `universal` · **Độ trễ:** PreToolUse (~ms) — đã đúng tầng, sai phép
so · **Bảo trì:** trung bình; làm hẹp — chỉ bóc heredoc + chuỗi nháy, không dựng parser đầy đủ.

**ĐIỀU KIỆN THOÁT:** `dcg` có mutant cho cả 3 ca dương-tính-giả và giết được chúng mà không mất
case chặn thật nào (ratchet `hooks-without-mutant`).

---

## 4. `evals/run.mjs` chỉ có HAI trạng thái nên "chưa đo" bị đếm thành FAIL

- `0003` chấm `test -f features/eval-probe.json` — file do **agent** tạo trong task, mà
  `evals.command` rỗng nên không agent nào chạy. Đang chấm output của một bước chưa hề chạy.
- `0004` đem chạy `<lệnh install ở chế độ frozen/ci>` — **một placeholder CHANGEME** — như lệnh
  shell, trên repo mà `ci.yml` đã tự khai *"n/a — repo này không có lockfile"*.

Kết quả: `REGRESSION 50% (2/4) — mục tiêu: BẢO VỆ, phải gần 100%` trên một harness không hỏng.

`gates.mjs` có trạng thái thứ ba (`skip: KHÔNG có lệnh → gate này không tồn tại`).
`rituals.mjs` có (`?` = không đo được). `harness-size` có (`n/a`). **`run.mjs` không** — và nó
là công cụ duy nhất trong bộ có quyền nói "KHÔNG promote thay đổi này".

**Dạng:** `3 computational-control` — thêm `n/a`, và assertion chỉ đúng-sau-khi-agent-chạy phải
được đánh dấu để bỏ qua khi `evals.command` rỗng.

**ĐIỀU KIỆN THOÁT:** khi `evals.command` được khai ở repo này (lúc đó `0003` đo thật). Nhưng
lớp lỗi *"gộp chưa-đo vào hỏng"* thì `universal` và không hết hạn theo cách đó.

---

## 5. L0003 đã tồn tại và lớp lỗi vẫn tái phát — giới hạn của "ghi bài học"

Không đề xuất cơ chế mới; đây là quan sát về **hiệu lực** của vòng học.

`0003-self-test-gia-dinh-repo-cua-no.md` đã promote (v2.7.6, PR #17, *"L0003 lên 10 lần, 4
repo"*). Sau đó vẫn xảy ra: `sakubun-test` (`post-edit-lint` giả định `lintFix` rỗng) ·
`warehouse` (điền `commands.*` làm 3 case FAIL) · `harness` v2.8.1 PR #25 (sàn RATCHET đỏ ở cả
3 consumer **ngay trong bản phát hành**; fixlog ghi thẳng *"lesson 0003 xảy ra TRONG bản vá
chống lớp lỗi đó"*).

**Và một lần nữa trong phiên này:** promote L0004 làm eval `0001` đỏ, vì thêm file vào
`knowledge/lessons/` mà không đăng ký vào `SEED` của `apply-to.mjs`. `/knowledge-promote` không
nói bước đó; `--audit` bắt. Đây là bằng chứng độc lập tiếp theo, và nó **đổi dạng biểu diễn**
của L0003 từ (6 văn xuôi) sang (1 test/fixture): `test-hooks.mjs` cần chạy trên fixture
**layout** khác template (không `src/`, `commands.*` đã điền, `paths.migrations` thu hẹp) —
`tooling/fixtures/config-*.json` đã đi đúng hướng, cần mở rộng từ fixture *config* sang fixture
*layout*.

---

## Đề xuất CẮT BỎ (bắt buộc)

**Xét 1 — `/whats-new` tham chiếu chết → KHÔNG CẮT.** Đã kiểm: hai chỗ nhắc là bia mộ
load-bearing. Cắt chúng là xoá đúng cơ chế v2.11.0 sinh ra để dọn skill đã bỏ khỏi consumer.
Cái sai nằm ở phép kiểm của doctor (mục 3), không ở chỗ nhắc.

**Xét 2 — `AGENTS.md` §"Nghi thức: đừng nhớ, hãy đọc" → ĐỀ XUẤT CẮT còn 2 dòng.**
File đang ở **đúng trần 150 dòng**, +14 so baseline 2026-08-04, và là file đắt nhất repo (nạp
mọi phiên mọi người; CI cố ý **không** loại nó khỏi phép đếm dòng PR). Mục đó (~8 dòng) mô tả
thứ mà `rituals.mjs --all` đã in ra kèm số đo — một mục văn xuôi mô tả output của một lệnh là
bản sao thứ hai của cùng danh sách, đúng lớp lỗi `gates.mjs` được viết ra để diệt.
`AGENTS.md` nằm trong `paths.harness` ⇒ cần DRI, không tự sửa.

---

## Ba con số

| Chỉ số | Giá trị | Xu hướng |
|---|---|---|
| sửa tay / tuần | **14** (⚠️ ngưỡng 10) | ↑ — 12/14 dồn trong **2 ngày** (08-04 → 08-05) |
| kích thước harness | **WARN PHÌNH** | ↑ AGENTS.md +14 · skills +74 · hooks +93 dòng · lessons +1 |
| PR revert 7 ngày | **0** | ✓ |

**Chẩn đoán, theo đúng luật ở bước 6 của skill:** *sửa tay cao **và** harness lớn = harness
đang phình mà không giải quyết vấn đề thật.*

Hình dạng cụ thể ở đây: **10/14 mục fixlog tuần này là harness tự làm hỏng harness** — guard
bắn nhầm, self-test giả định sai repo, ba công cụ ba con số, cảnh báo mù vai trò, placeholder
chạy như lệnh. Không mục nào là agent làm sai việc sản phẩm.

Cả bốn đề xuất ở trên đều là **gộp / sửa phép so**, không thêm cơ chế; mục 1 và 2 làm harness
**nhỏ đi**.
