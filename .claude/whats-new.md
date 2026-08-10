<!-- version: 2026-08-11-b -->
<!--
  Thông báo thay đổi harness cho cả team.
  SessionStart hook so `version` ở trên với version người dùng đã xem
  (.claude/state/whats-new-seen.json) và nhắc MỘT LẦN nếu mới hơn.

  Đổi harness mà không thông báo = nửa team hành xử theo rule cũ.
  Mỗi lần merge thay đổi vào .claude/, cập nhật version + viết 3 dòng ở đây.
  Giữ file NGẮN — xoá mục cũ hơn 1 tháng.
-->

## 2026-08-11 — `test-hooks` phân biệt "cây bị gỡ có chủ ý" với "repo hỏng" (v2.57.0)

Năm check đọc `.claude/settings.json` hoặc `.claude/rules/` từng báo **FAIL** khi không thấy
file, kèm câu *"neo của check này đã trôi"*. Câu đó đúng trong repo thật và **sai** trên cây
`eval --bare`, nơi file bị gỡ theo yêu cầu. Nay chúng là `?` ở đó — không PASS, không FAIL.

Điều kiện là **bằng chứng**: có `settings.json.bare-disabled` nằm cạnh. Nếu `settings.json`
của bạn **biến mất** mà không có cái xác đó, suite vẫn ĐỎ TO như trước — đó là repo hỏng.

**Việc bạn phải làm khác đi:** không có. Ratchet mẫu số eval đi từ 4 xuống **2**.
## 2026-08-11 — Eval: điều kiện của phép trừ nay đo được bằng MỘT LỆNH (v2.56.0)

```
node evals/run.mjs --denominators
```

Đếm mẫu số hai chiều — **tất định, KHÔNG thả agent, 0 đồng**. Trước bản này, cách duy nhất biết
hai chiều có so được với nhau không là chạy CẢ HAI với agent. Hôm nay: `24` assertion sống ở
chiều đầy đủ, `16` ở chiều trần, **4 task lệch** — kèm tên đúng dòng gây lệch.

Có **ratchet**: vượt mốc ⇒ đỏ; xuống dưới mốc ⇒ cũng đỏ, kèm yêu cầu hạ mốc trong CÙNG commit.
Không phải gate `Stop` (chạy ~5 phút) và không phải ca test (assertion của `0007` chạy
`test-evals` ⇒ đệ quy). Lệnh gõ tay khi bạn viết hoặc sửa task eval.
## 2026-08-10 — Eval: patch của chiều TRẦN nay đọc được, và cây eval có 2 commit (v2.55.0)

Chạy thật cả hai chiều lần đầu, và chiều trần lộ hai lỗi. Patch `--bare` từng chứa **26 file,
25 là thao tác gỡ harness của chính runner** — đúng một file là việc agent làm. Nay có một
commit **MỐC** đóng lại mọi thứ runner làm trước khi agent chạy, nên patch chỉ còn việc agent.

**Việc bạn phải làm khác đi:** nếu bạn viết assertion đếm commit — cây eval nay có **2 commit**
(clone `--depth 1` + mốc), không phải 1. Mốc chạy ở **cả hai chiều** (`--allow-empty`); chỉ một
chiều thôi là hai cây lại khác nhau ngoài `BARE_STRIP`, đúng lỗi #155.
## 2026-08-10 — Eval: `eval − eval --bare` nay TỪ CHỐI trừ hai vế không cùng mẫu số (v2.54.0)

Chiều trần bị gỡ lớp harness, nên assertion nào đọc file của harness sẽ **đỏ sẵn** ở đó và bị
chấm `n/a`. Đúng — nhưng hệ quả là hai vế chấm trên hai tập assertion khác nhau. Đo trên 7 task
thật: **22 assertion sống ở chiều đầy đủ, 13 ở chiều trần**, và lệch luôn dồn về phía
*"harness không giúp gì"*.

Từ nay task nào lệch mẫu số sẽ **ra khỏi phép trừ**, kèm cặp số. Nếu bạn thấy nó: sửa ở **task**
— assertion phải hỏi về **sản phẩm**, không hỏi về file của harness. Baseline cũ chưa có mẫu số
⇒ `?`, chạy lại cả hai chiều.

## 2026-08-10 — Eval: agent chạy trong cây DÙNG MỘT LẦN, không trong repo bạn đang mở (v2.53.0)

Khi `evals.command` đã khai, runner clone repo ra tmp và thả agent vào đó — **cả hai chiều**,
không riêng `--bare`. Ba thứ đổi cho bạn:

- Agent không còn sửa được cây bạn đang làm việc. Việc nó làm được **rút thành patch** và
  runner in đường dẫn (kể cả khi task bị chấm `?`).
- Bạn **ghi vào repo trong lúc eval chạy được rồi** — phép so vân tay nay gác cái clone.
- Assertion nào đọc lịch sử git, `origin`, hoặc file chưa commit sẽ thành `n/a` kèm lý do:
  clone là `--depth 1` và không có remote.

`evals.command` rỗng thì **không đổi gì** — vẫn đo cây hiện tại như trước.

## 2026-08-10 — Eval: thêm `--output-format json` vào `evals.command` (v2.52.0)

Nếu bạn đã nối `evals.command` với `claude`, thêm cờ đó:

```
claude -p --max-turns {maxTurns} --permission-mode auto --output-format json
```

Đổi lại: báo cáo eval in **số lượt agent thật sự dùng / trần** cho mỗi task, và kêu khi tỉ lệ đó
chạm `budget.alertAtPercent`. Một trần sát ngưỡng là một task sắp rơi khỏi mẫu số ở lần chạy
sau — trước đây điều đó xảy ra im lặng và tỉ lệ đổi mà không ai biết vì sao.

Tới v2.52.0 cờ này còn là một cái **bẫy**: bật nó làm bộ dò "agent cạn ngân sách" (v2.51.0) mù,
vì chuỗi `Reached max turns` biến mất khỏi output. Nay runner đọc lời khai có cấu trúc trước.

## 2026-08-10 — `upgrade` thôi khởi động dev server trên máy bạn (v2.51.1)

Bước Verify của `upgrade.mjs` gọi `gates.mjs --list --timing`, và lệnh đó đo độ trễ bằng cách
**chạy thật từng gate**. Ở repo đã áp template, đó là cả `preMerge` — gồm `e2e`, tức Playwright
và một `next dev` trên cổng 3799. Đo ở canary: 26 giây ở template, **hơn 20 phút** ở repo thật.

Ba thứ hết theo: nâng cấp không còn đọc-như-treo, không còn mở dev server/trình duyệt mà không
báo, và không còn in *"hook test ĐỎ"* khi thứ đỏ là `e2e` của chính bạn.

Bạn gõ tay `node tooling/gates.mjs --list --timing` thì **không đổi gì** — chạy gate thật là
việc của nó.

## 2026-08-09 — Hai field cấu hình: một cái vừa hiện ra, một cái biến mất (v2.49.0)

`limits.sessionPresenceMinutes` **nay khai được** (240 phút — TTL sổ phiên). Trước đây
`session-start.mjs` vẫn đọc nó, nhưng config không khai nên bạn không thấy nó tồn tại để
hiệu chỉnh. Giá trị không đổi, chỉ là giờ nhìn thấy được.

`mcp.maxTools` **bị cắt** — 0 nơi đọc, và tiền đề hết hạn: MCP tool definition nay nạp theo
yêu cầu. Repo đã áp harness nhận cả hai qua migration `012` khi chạy `upgrade`.

## 2026-08-09 — Nghi thức mới: 22 ô native để trống, ai đã xét ô nào? (v2.47.0)

Bảng nghi thức có mục thứ 14: `rituals.mjs --slots`. Nó hỏi câu **CỘNG** — *"vendor gọi cho ta
ở bao nhiêu chỗ mà harness không nhấc máy?"* — cặp đôi của `claude-code-drift`, vốn chỉ hỏi câu
**TRỪ** (*"vendor có làm harness thành thừa không"*).

`native-surface` trước đây khai cả 22 ô trống là `n/a` — *"không phải thiếu sót"*. Rổ `n/a`
nghĩa là **bằng không do cấu trúc**; 22 câu chưa hỏi thì thuộc rổ `?`. Nay chia ba:
`co-viec` / `khong-co-viec` / `chua-xet`.

Xét một ô: `node tooling/rituals.mjs --slot <Event> khong-co-viec "<vì sao không>"`.
Lý do BẮT BUỘC, và `co-viec` phải kèm số issue. Sự kiện MỚI vendor thêm vào **tự** vào hàng chờ.

## 2026-08-08 — Máy dò field cấu hình chết (v2.46.0)

`harness-doctor` có mục mới: `config: N field · X không ai đọc · Y đọc-mà-chưa-khai`.
Nó vừa tìm được 3 mục thật, gồm `limits.prWarnFiles` (0 nơi đọc, dù có đoạn biện minh dài
nhất file) và `limits.sessionPresenceMinutes` (code đọc, config không khai).
Thêm field vào `harness.config.json` mà quên nối vào code ⇒ doctor sẽ nói. Bị báo oan → nhắn @dri.

## 2026-08-08 — Hai bên đọc ngân sách, một cái sổ, hai câu trả lời (v2.45.1)

`rituals` gọi `budgetStatus` mà **quên một đối số**, nên nó nói *"không đo được"* trong khi
`harness-doctor` nói *"12 lần chạm rate limit"* — cùng một cái sổ. Và `rituals` là cái chạy ở
**mỗi SessionStart**.

Bản vá là **bỏ chỗ để quên**: `budgetSnapshot()` — một phép IO cho mọi bên đọc.

Tệ hơn: lưới `lib-import` dựng ở v2.44.2 để bắt đúng lớp lỗi này thì **mù 89% `rituals.mjs`**
(một `strip()` viết bằng regex). Nó báo XANH trên một file nó gần như không đọc được. Nay dùng
`codeOnly()` — máy quét trạng thái đã có sẵn ở `lib` từ lâu, kèm chú thích kể đúng chuyện này
đã xảy ra một lần rồi.

**Việc bạn phải làm khác đi:** đừng gọi `budgetStatus()` trực tiếp nữa — có một ca test chặn.
Và nếu bạn viết một phép kiểm quét mã nguồn: dùng `codeOnly(src, { blankStrings: true })`,
đừng tự viết regex bỏ chú thích.

## 2026-08-08 — L0007: bản vá hai chiều mà chỉ có ca một chiều (v2.45.0)

Bài học mới, promote từ `.claude/learnings/` sau khi DRI duyệt. **4 lần trong một phiên**
(#117 #118 #121): mọi bản vá dạng *"đừng đếm cái này"* / *"giữ cái kia"* đều chỉ có ca cho
chiều ồn ào, và bản vá **cực đoan nhất** — `measured = false`, strip-list rỗng, `...prev` đặt
sai chỗ — thoả mãn hết chúng.

Chiều còn lại **không có triệu chứng**: mẫu số rỗng, bản ghi mới bị nuốt. Không ai mở issue cho
một con số không xuất hiện.

**Việc bạn phải làm khác đi:** khi bạn sửa một phép đo để nó **thôi đếm** hoặc **giữ lại** thứ
gì đó, chạy đúng một mutant trước khi báo xong — làm **TẤT CẢ** theo chiều bản vá đó. Suite vẫn
xanh ⇒ bạn thiếu ca. Gate: `evals/tasks/0007`.

## 2026-08-08 — Nhánh gói PHẲNG chưa từng đếm được lần nào (v2.44.2)

Cơ chế gói phẳng thêm ở v2.44.0 **hỏng ngay từ lúc merge**, và nó chỉ lộ ra khi có người thật sự
bật `HARNESS_BUDGET_PLAN=flat`. Hai lỗi chồng lên nhau: một tên chưa được import (`ReferenceError`
bị `catch` trần nuốt ⇒ *"không đọc được"* vĩnh viễn), và một phép cộng trên object (`"0[object
Object]"` ⇒ báo **0 lần chạm** trong khi sổ có **12**).

13 ca test của v2.44.0 không thấy gì: chúng kiểm hàm THUẦN bằng số truyền tay, còn phép đếm nằm
inline trong `harness-doctor`. **Ranh giới test dừng đúng trước chỗ hỏng.**

**Việc bạn phải làm khác đi:** không có. Nếu bạn dùng gói phẳng, mục NGÂN SÁCH giờ ra số thật.
Thêm một lưới `lib-import` chạy trong `test-hooks`: gọi một hàm của `lib` mà quên import thì
suite đỏ ngay, thay vì đợi tới lúc nhánh đó được ai đó bật.

## 2026-08-08 — Nếu bạn từng chạy `native-surface --record` TRƯỚC bản rà: chạy lại (v2.44.1)

`.claude/claude-code-baseline.json` có **hai người ghi** — `rituals --reviewed-claude-code` (bản rà
changelog) và `native-surface --record` (tập sự kiện hook). Người thứ nhất dựng lại file từ đầu, nên
nó **xoá** phép đo của người thứ hai. Im lặng, và chỉ khi bạn chạy `--record` trước.

**Việc bạn phải làm khác đi:** nếu nghi thức đang bảo bạn *"CHƯA đo tập sự kiện hook lần nào"* mà bạn
nhớ là đã đo — nó đúng là đã bị xoá. Chạy lại `node tooling/native-surface.mjs --record`, một lần.
Từ bản này thứ tự hai lệnh không còn quan trọng.

## 2026-08-08 — Ngân sách biết GÓI CƯỚC; gói phẳng thôi báo động vĩnh viễn (v2.44.0)

Lớp ngân sách giả định trả theo mức dùng. Với gói **phẳng** (Pro/Max), chi tiêu **bằng định
nghĩa** đúng bằng trần, nên `over` luôn đúng và **không bao giờ tắt** — đo được: dữ liệu ĐÚNG
(`--days 30 --usd 20`, cap 20) vẫn ra `over` 100%. Một cảnh báo luôn bật dạy người đọc bỏ qua
cả mục ngân sách.

Tín hiệu đúng cho gói phẳng đã có sẵn: **12 dòng `rate_limit`** trong `budget-alarm.log`, do
chính harness đo. Cổ chai của gói phẳng là **rate limit**, không phải tiền.

**Việc bạn phải làm khác đi:** nếu bạn trả **phẳng**, thêm `"HARNESS_BUDGET_PLAN": "flat"` vào
`.claude/settings.local.json` → `env`. Gói cước là thuộc tính của **người trả tiền**, không phải
của project — nên tầng theo người thắng `budget.plan` của đội. Trả theo mức dùng thì **không đổi
gì**: `metered` là mặc định và hành vi y nguyên.

## 2026-08-08 — `--bare` giờ THẬT SỰ gỡ harness (v2.43.0)

Chỉ số trung tâm của cả vòng học — *"giá trị đo được của harness = `eval` − `eval --bare`"* —
đang so **hai lần chạy giống hệt nhau**. `--bare` đổi tên file baseline, đổi tiêu đề, đổi lời
nhắn cuối; `spawnSync` gọi agent thì **không nhận nó**. Cùng `cwd`, cùng bộ hook.

Nay `--bare` chạy agent trong một **clone dùng một lần** đã gỡ remote và gỡ lớp harness Claude
Code tự nạp (`settings.json` · rules/skills/agents · `CLAUDE.md`/`AGENTS.md` · `.mcp.json`).
Giữ `tooling/` và `harness.config.json` — assertion lớp 1 gọi thẳng vào đó.

**Việc bạn phải làm khác đi:** `--bare` giờ **TỪ CHỐI** chạy nếu `evals.command` rỗng — đó là
trạng thái của mọi repo hiện tại, nên bạn sẽ gặp nó ngay. Khai `evals.command` rồi chạy lại.
Và đừng trừ hai con số bằng mắt nữa: runner tự trừ, **trên giao của hai tập đo được**, vì hai
tỉ lệ đó có hai mẫu số khác nhau.

## 2026-08-08 — Một task eval thôi được chấm PASS cho phép đo nó không làm (v2.42.4)

`evals/tasks/0004` có mục `## Dựng cảnh` dựng một conflict lockfile thật, và **runner chưa bao
giờ chạy mục đó**. Agent được hỏi *"có conflict khi merge, giải quyết giúp tôi"* trong một repo
không có conflict nào — rồi task vẫn vào mẫu số và vẫn được chấm **PASS**, đẩy tỉ lệ LÊN.

Cùng lớp lỗi với #93 nhưng ngược chiều, và im lặng hơn hẳn: **không ai đi điều tra một con số
đẹp**.

**Việc bạn phải làm khác đi:** task nào có `## Dựng cảnh` thì runner bỏ qua và nói ra — dựng
cảnh bằng tay rồi chạy lại. Và nếu task của bạn **không có assertion tất định nào chạy được**,
nó ra khỏi mẫu số kể cả khi agent đã chạy xong: runner chỉ chấm lớp 1, một lượt chạy kết thúc
bình thường không phải một phép đo.

## 2026-08-08 — Sổ audit thôi ghi mọi người thành MỘT người (v2.42.3)

`DEV_ID` còn nguyên placeholder `CHANGEME-ten-cua-ban`, và nó được ghi vào `harness-edits.log`
— sổ làm cửa thoát `HARNESS_DRI=1` **audit được** — như thể là một cái tên. Hôm qua có hai
phiên song song trên cùng máy; sổ không phân biệt được phiên nào ghi vùng cấm.

Cảnh báo cho đúng chuyện này **đã có sẵn** ở `check-reservations`, nhưng nó hỏi *"có rỗng
không"* — mà placeholder thì **không rỗng**, nên nó chưa từng bắn một lần nào.

**Việc bạn phải làm khác đi:** mở `.claude/settings.local.json` → `env.DEV_ID`, điền tên bạn.
File đó gitignored, máy-cục-bộ, không ảnh hưởng ai. `harness-doctor` giờ nói ra nếu bạn chưa làm.

## 2026-08-08 — `/claim` `/handoff` `/verify-ui` thôi mù trên nhánh của bạn (v2.42.2)

Ba nghi thức đó đọc `?` trên **mọi** nhánh làm việc, và lý do in ra thì nói sai — nó bảo nhánh
không theo quy ước, trong khi nhánh theo đúng quy ước. Thật ra `project.issuePrefixes` là hạt
giống kiểu Jira (`["ABC"]`), và nó khớp **0/30** nhánh từng tồn tại ở repo này.

Giờ số ở **đầu** tên nhánh được nhận làm issue (`fix/100-…` ⇒ 100), còn số ở giữa thì không.

**Việc bạn phải làm khác đi:** nếu thấy dòng `· issue SUY TỪ số trần trong tên nhánh` mà số đó
sai — đổi tên nhánh, hoặc khai `project.issuePrefixes` cho đúng project của bạn. Dùng Jira thì
**không đổi gì**: prefix khai thật vẫn được thử trước.
## 2026-08-08 — `test-hooks` đỏ thì đó là lỗi THẬT (v2.42.1)

Suite gác từng chập chờn, và **chỉ khi bạn chạy song song với một phiên khác**: đo được tuần tự
6/6 xanh, mà 2 suite song song thì **cả hai đỏ**. Năm đường ghi trạng thái dùng chung một cái
tên toàn máy — kể cả ba file tạm ghi thẳng vào `.claude/hooks/`.

**Việc bạn phải làm khác đi:** thôi chạy lại lần hai. Trước đây "chạy lại thì xanh" là thật, nên
nó dạy đúng phản xạ tệ nhất — và ba ca hay đỏ nhất lại nói về `block()` không ghi sổ, tức lần
sau chúng đỏ vì lý do thật thì bạn cũng sẽ bỏ qua. Giờ **đỏ là đỏ**.

Sàn cũng vừa bắt kịp tổng thật (185 → 201): 10 ca từng thêm vào mà không ai nâng sàn.

## 2026-08-08 — Bạn sẽ THẤY phiên song song của chính mình (v2.42.0)

Ba phiên chạy song song 2 giờ trên repo này mà **0 cảnh báo** — vì sổ phiên nằm TRONG
worktree, nên mỗi phiên chỉ thấy chính nó. Giờ nó ở `.git/harness-shared/`, chỗ mọi worktree
cùng nhìn thấy.

**Việc bạn phải làm khác đi:** đầu phiên, nếu thấy dòng `ℹ️ N phiên KHÁC đang mở` — dừng một
giây và hỏi *hai việc này có chạm cùng file không?*

```
node tooling/overlap-scan.mjs <đường-dẫn dự kiến>
```

Song song **không rẻ gấp đôi**: ~2× là sàn cứng (context nhân đôi), phần vượt lên là rebase +
nhiễu do tranh máy + làm trùng. Quy trình 5 bước ở `docs/WIP.md`.
## 2026-08-08 — Sổ telemetry ĐÓNG được (v2.41.0)

`/harness-propose` đỏ vì đếm **mọi dòng từng có** trong `gate-fails.log`. Ba lần chặn hôm qua
đã xử lý xong, nghi thức vẫn đỏ, và **không lệnh nào làm nó xanh lại được**. Một tín hiệu như
vậy thôi là tín hiệu — người đọc học được rằng nó không đáng phản ứng.

```
node tooling/rituals.mjs --close harness-propose "<đã làm gì>"
```

Không phải nút tắt: **lý do bắt buộc**, dòng đóng nằm trong **chính cái sổ đang audit**, và
**một lần chặn mới sẽ tự mở lại**. Sau khi đóng, bảng vẫn nói *"3 lần, tất cả ĐÃ ĐÓNG"* —
không nói *"chưa từng xảy ra"*.

**Việc bạn phải làm khác đi:** thấy mục đỏ mà việc đã xong — đóng nó kèm lý do, đừng bỏ qua nó.
## 2026-08-08 — `wt-clean` thôi mù với squash-merge (v2.40.0)

`git branch --merged` không phân biệt được nhánh **đã squash-merge** với nhánh **chưa từng có
PR**. Repo này squash 100% số PR, nên bộ dò đó **chưa từng đúng một lần nào** — worktree tích
lại im lặng và `/wt` không bao giờ đỏ.

Giờ nó có **ba** trạng thái: `merged` · `open` · `unknown`. *"Không hỏi được GitHub"* thôi bị
viết thành *"chưa merge"*.

**Việc bạn phải làm khác đi:** cài `gh` và `gh auth login`. Không có nó, `wt-clean --apply` sẽ
**giữ lại nhiều hơn** (an toàn, nhưng dọn ít hơn) và nói rõ vì sao.

## 2026-08-08 — Ngân sách biết VAI của repo (v2.39.0)

`setup.mjs` **từ chối** ghi cấu hình ở repo template — đúng, vì một cap ghi ở đó chảy xuống
mọi consumer. Nhưng doctor vẫn in `? chưa khai trần chi tiêu`. **Harness đòi một thứ chính
harness cấm cung cấp**, và không đường nào làm mục đó xanh.

Ở template, hai chuyện giờ tách ra: **trần** là `n/a` (không khai được, đúng thiết kế), còn
**CAPO** là việc làm được và chưa làm:

```
node tooling/capo-report.mjs --days 7 --usd <số từ dashboard billing>
```

**Việc bạn phải làm khác đi:** ở repo template, đừng chạy `setup.mjs --apply` nữa — nó sẽ từ
chối, và giờ doctor cũng thôi đòi. Ở repo consumer: **không đổi gì.**

## 2026-08-07 — Tập sự kiện hook được ĐO, không nhớ (v2.38.0)

Bản rà `2.1.222` ghi *"13 tên"*; binary `2.1.224` có **31**; bản rà `2.1.224` — viết cùng
ngày — không nhắc tập nào. Nghi thức kích hoạt bằng máy nhưng trả lời bằng người, nên **con
số duy nhất kiểm được bằng máy trong cả bề mặt đó không ai tính**.

```
node tooling/native-surface.mjs --record
```

Đo hôm nay: **31 sự kiện · 9 đang cắm · 22 để trống**. Nó cũng báo chiều ngược — sự kiện
*đang cắm mà binary không có*, tức hook không bao giờ chạy và im lặng.

**Việc bạn phải làm khác đi:** mỗi lần Claude Code lên version, chạy thêm lệnh trên sau khi
rà changelog. Nghi thức `claude-code-drift` giờ đòi **cả hai**, và rà changelog mà chưa đo
tập vẫn là `due`.

## 2026-08-07 — Sửa file khi đang đứng trên `main` giờ bị CHẶN (v2.37.0)

Luật *"một issue = một nhánh = một worktree"* viết ở `AGENTS.md` **và** `/claim`, và không gì
cưỡng chế nó. Đo 2026-08-06: cùng một agent vi phạm **hai lần trong một ngày**.

**Việc bạn phải làm khác đi:** tạo nhánh **trước** khi sửa — thay đổi trong cây làm việc đi
theo bạn, không mất gì. Sửa tài liệu/changelog thẳng trên nhánh tích hợp vẫn hợp lệ:

```powershell
$env:HARNESS_ALLOW_MAIN_EDIT='1'
```

Cửa thoát **được ghi sổ**, và `rituals.mjs` đối chiếu nó với số lần chặn: **dùng nhiều hơn
chặn ⇒ guard sai, và bảng sẽ đề xuất CẮT nó.**

Hook này **fail-open** (hỏng thì cho qua, có báo) — khác `dcg`. Nó là guard *phối hợp*, không
phải guard *an toàn*, và một hook hỏng chặn mọi `Write|Edit` thì chặn cả đường sửa chính nó.

## 2026-08-07 — `dcg` thôi chặn văn bản NHẮC tới lệnh (v2.36.0)

Guard từng chặn cả `git commit -m "…git push --force…"`, cả heredoc viết fixture, và **cả
lệnh `gh issue create` mở issue báo về chính nó**. Cùng lúc, 5/5 biến thể nguỵ trang bằng
nháy (`git "push" --force`) thì **đi lọt**.

Giờ nó khớp theo **lệnh**: bóc thân heredoc, cắt theo `; && || |`, bỏ nháy, và mỗi điều cấm
khai nó nói về **chương trình** nào.

**Việc bạn phải làm khác đi:** không gì. Nhưng đọc `.claude/rules/danger-zones.md` một lần —
nó thôi nói *"cưỡng chế bằng máy"* chung chung và giờ nói rõ **hai tầng**: `permissions.deny`
là tầng một (vendor cưỡng chế), hook là tầng hai (giải thích + telemetry, **best-effort**).
`dcg` vẫn không bắt được biến shell, `eval`, hay `base64 -d | sh` — và điều đó được viết ra.

## 2026-08-07 — SỬA LẠI: hai field `budget` KHÔNG phải field ma (v2.35.0)

v2.28.0 nói ba field còn lại của `budget` đều không ai đọc, và ghi ba dấu ❌ vào
`docs/ECONOMICS.md`. **Sai hai trong ba** — `maxTurnsPerRun` và `maxWallClockMinutes` được
`evals/run.mjs` đọc làm mặc định. Lần đo đó quên mất thư mục `evals/`.

Chỉ `maxToolCallsPerRun` là field ma thật, và nó đã bị cắt.

**Việc bạn phải làm khác đi:** nếu bạn từng đọc bảng ở `docs/ECONOMICS.md` và định cắt hai
field kia — **đừng**. Bảng đã sửa, và giờ có test khoá cả hai chiều: khoá không ai đọc phải
cắt, khoá đang được đọc không được lặng lẽ biến mất.

## 2026-08-07 — AGENTS.md ngắn đi, và thôi nói chuyện với đội không tồn tại (v2.34.0)

**Cắt §"Nghi thức: đừng nhớ, hãy đọc"** — nó mô tả bằng văn xuôi đúng thứ SessionStart đã in
ra mỗi phiên. File **149 → 142 dòng** (trần nó tự đặt là ~150, và nó đang chạm trần).

**§"Làm việc trong repo dùng chung" → "Làm việc trong một repo"**, tách ba điều chỉ có nghĩa
khi `teamSize ≥ 2`: kiểm PR đang mở ở vùng nóng · không push nhánh người khác · trần session
mỗi người.

**Việc bạn phải làm khác đi:** solo thì `precommit-scan` thôi nhắc *"cần review của
CODEOWNERS"* — bạn không approve được PR của chính mình. File `CODEOWNERS` **vẫn giữ**: nó có
giá trị ngày project có người thứ hai.

## 2026-08-07 — Hook `PostToolUse` thôi bị bắt nói câu sai sự thật (v2.33.0)

Hợp đồng output cũ đòi mọi nhánh từ chối in `BỊ CHẶN`. Nhưng `post-edit-lint` là
`PostToolUse` — **file đã ghi xong rồi**, nên câu đó sai. Giờ hợp đồng biết sự kiện:
`PreToolUse` → `BỊ CHẶN`, `PostToolUse` → `⛔`, và **cả hai** bắt buộc có dòng gợi ý `→ `.

**Việc bạn phải làm khác đi:** viết hook `PostToolUse` mới thì đừng in `BỊ CHẶN` — in `⛔` kèm
một dòng `→ ` nói phải làm gì. Sự kiện của hook đọc từ `.claude/settings.json`, nên chuyển hook
sang sự kiện khác là hợp đồng tự đổi theo.

## 2026-08-07 — Banner đầu phiên biết vai, và gọi tên thay vì đếm (v2.32.0)

Hai thứ bạn thấy mỗi phiên vừa đổi:

**Mất một dòng đỏ.** `⚠️ chưa khai báo lệnh verify/test — việc số 1 cần làm` giờ chỉ in ở repo
**tiêu thụ**. Ở template nó là placeholder đúng, và nó đã đỏ 7/7 phiên kể từ commit đầu tiên —
dạy người đọc bỏ qua đúng cái khối có tín hiệu thật.

**`? N mục KHÔNG đo được` giờ nói N là những mục nào**, gộp theo nguyên nhân chung.

**Việc bạn phải làm khác đi:** không gì. Nếu repo bạn là consumer và chưa khai `commands`, dòng
đỏ kia **vẫn đúng** — nó chỉ thôi bắn nhầm ở template.

## 2026-08-07 — Runner gate có chi phí SÀN, và giờ nó hiện ra (v2.31.0)

Claude Code 2.1.224 **bỏ trần 200 subagent mỗi phiên**. Trần <5s ở `SubagentStop` mà
`AGENTS.md` đặt ra giờ không còn cái gì của vendor che cho nữa.

`gates --list --timing` từng nói `subagent: KHÔNG đo được`. Đúng về phần *việc* của gate, sai
về *chi phí*: chính runner tốn **~104ms** mỗi lần gọi, nhân với số agent song song.

**Việc bạn phải làm khác đi:** không gì bắt buộc. Nếu `gates.subagent` của bạn chưa có lệnh,
bạn sẽ thấy dòng sàn lần đầu — đó là chi phí vẫn luôn trả, chỉ chưa được nói ra.

## 2026-08-07 — Hai phép kiểm ĐI LÊN từ repo con (v2.30.0)

`entropy-scan` giờ bắt **đường dẫn trỏ vào hư không**: với agent, một đường dẫn chết không
báo lỗi — nó gửi người đọc tới chỗ trống, và người đọc TỰ NGHĨ RA nội dung đáng lẽ ở đó.
Và `check-feature-integrity` đối chiếu `features/_index.json` với ĐĨA — trước đó một index
liệt entry trỏ vào hư không vẫn cho gate in *"(không có gì để báo cáo)"*.

Cả hai đến TỪ `sakubun` qua `upstream.mjs` — lần đầu chiều LÊN chuyển được một cơ chế.

**Việc bạn phải làm khác đi:** entropy-scan có thể báo thêm đường dẫn chết. Sửa đường dẫn,
tạo file, hoặc bỏ lời nhắc — **đừng nới loại trừ**.

## 2026-08-07 — `/handoff` thôi nói "không có gì" khi nó KHÔNG BIẾT (v2.29.0)

Nhánh không theo quy ước `<type>/<issue>-<slug>` làm `rituals.mjs` không suy ra được issue —
và `/handoff` gộp chuyện đó với "đang ở nhánh tích hợp" rồi báo `ok`. Nhật ký W32 đã bắt
được đúng ca này: *"OK — không có gì để giao lại"* trong khi có 2 commit chưa push.

**Việc bạn phải làm khác đi:** đặt tên nhánh theo quy ước thì bảng đo được. Không thì nó
báo `?` — thành thật hơn, và đó là điểm.

Kèm bài học **L0005** (`knowledge/lessons/0005-*`, 6 lần, `universal`) + eval `0006`.

## 2026-08-07 — Trần chi tiêu thôi là con số không ai đọc (v2.28.0)

`budget.monthlyUsdCap` từng chỉ được đọc ở đúng một chỗ, và chỉ để nói *"= 0"* — đặt `$50`
vào cũng không có gì xảy ra. Giờ `harness-doctor` có mục **NGÂN SÁCH** và `rituals.mjs` có
năng lực `capo-report`, đối chiếu với `.claude/state/capo-history.json`.

**Việc bạn phải làm khác đi:** doctor sẽ in một dòng `?` cho tới khi bạn khai trần
(`node tooling/setup.mjs`) **và** đo ít nhất một lần
(`node tooling/capo-report.mjs --days 7 --usd <số từ dashboard billing>`). Khai trần mà chưa
đo vẫn là `?` — harness không đọc được hoá đơn, số là bạn gõ vào.

## 2026-08-07 — Pack 0 bài học không còn đọc ra là rỗng (v2.27.0)

`accept.mjs --list` từng chỉ nhìn `lessons/`, nên một pack **20 mục fixlog thô + diff cơ
chế** đọc ra là *"Không có gì trong knowledge/incoming/"* — trong khi `harness-doctor` cùng
lúc nói *"pack chờ duyệt: 3"*. Ba công cụ, ba định nghĩa "chờ quyết". Giờ chỉ còn một
(`packPending()`), và `--list` liệt kê cả nguyên liệu thô kèm đường dẫn.

**Việc bạn phải làm khác đi:** pack không có bài học nào để nhận thì đóng bằng
`node tooling/knowledge/accept.mjs <pack> --reviewed "kết luận"` — không có lệnh này thì nó
chờ mãi. Bị chặn sai → mở issue label `harness`.

## 2026-08-07 — Bộ eval thôi gọi "chưa đo" là "hỏng" (v2.24.0)

`node evals/run.mjs` báo **40%** trên một harness không hỏng — cả ba FAIL đều là *chưa đo
được*: một placeholder `CHANGEME` bị đem chạy như lệnh, một assertion chấm output của agent
mà không agent nào chạy, và `> /dev/null` không tồn tại trên `cmd.exe`. Giờ là **100% + 1
n/a khai ra**.

**Việc bạn phải làm khác đi:** task nào của bạn chấm output của agent thì thêm dòng
`# requires-agent` ngay trước assertion đó — nếu không, nó vẫn bị đếm là hỏng khi
`evals.command` chưa khai.

Nghiêm trọng hơn, **chỉ trên Windows**: runner băm `node -e "…"` nhiều dòng thành từng dòng,
và `cmd.exe` đọc `>` trong `=>` là chuyển hướng ⇒ nó **tạo file rác trong repo đang đo**, làm
đỏ `apply-to --audit` ở task kế tiếp. Đã sửa, và có lưới riêng: assertion nào làm bẩn cây thì
FAIL kèm tên file.

## 2026-08-06 — Harness hỏi bạn làm một mình hay có đội (v2.23.0)

`node tooling/setup.mjs` có câu hỏi mới, **ngay sau mã project**: bao nhiêu người làm project
này. Trả lời `1` sẽ TẮT ba thứ chỉ có nghĩa khi có người thứ hai — guard đặt chỗ ở pre-commit,
dò reservation của người khác, và lời khuyên *"KHÔNG tự quyết, hỏi người"*.

**Việc bạn phải làm khác đi:** chạy lại `setup.mjs` nếu project bạn là solo. **Không khai thì
không đổi gì** — `chưa khai` giữ nguyên lớp phối hợp, nó KHÔNG được đọc thành `solo`.

Một trong ba thứ bị tắt là lỗi chặn nhầm thật: reservation so theo `DEV_ID || USER ||
USERNAME`, nên cùng một người trên hai máy có thể bị **chính reservation của mình** chặn
commit. `node tooling/harness-doctor.mjs` → mục **LỚP PHỐI HỢP** nói rõ cơ chế nào đang tắt.

## 2026-08-06 — Vòng học W32 đã lên `main`; việc còn lại nằm ở issue, không nằm ở nhánh

Nhánh `chore/vong-hoc-2026-W32` dừng ngay trước `gh pr create` khi phiên hết quota
2026-08-05, rồi nằm ngoài `main` một ngày. Giờ nó ở đây: **L0004** + gate `evals/tasks/0005`
+ retro W32 + nhật ký phiên.

**Việc bạn phải làm khác đi:** đọc `docs/progress/vong-hoc-2026-W32.md` §"BÀI HỌC ĐẮT NHẤT"
trước khi sửa thứ mà harness tố. Ba lần trong một phiên, thứ bị tố hoá ra là placeholder đúng
hoặc cơ chế load-bearing. **Cảnh báo của harness là giả thuyết, không phải việc.**

5 mục `/harness-propose` trong nhật ký đó **chưa** thành issue hết — mới có `#43` (dcg khớp
văn bản thô) và `#56` (`session-start:203` gọi placeholder đúng là "việc số 1"). Còn thiếu:
`budget.monthlyUsdCap = 0`, kênh đi LÊN không có bên nhận, cắt `AGENTS.md` §Nghi thức.

## 2026-08-06 — Skill chỉ-người-gõ giờ có người nhắc (v2.15.0)

9 skill trong repo này **chỉ bạn gõ được** — agent gọi thì Claude Code từ chối. Đo hôm nay:
**chưa cái nào từng chạy**, và 2 trong số đó (`/harness-propose`, `/verify-ui`) **không có bất
kỳ cơ chế nào** nhắc tới. `/harness-propose` là cánh cửa hợp pháp duy nhất vào vùng cấm.

Giờ `/harness-propose` **tự hiện đỏ ở SessionStart** khi `protect-harness` đã chặn ≥2 lần —
tín hiệu lấy từ log có sẵn, không thêm cờ nào. Còn `/verify-ui` vẫn chưa có, vì nó cần khai
`paths.ui` trong `harness.config.json` (vùng cấm) — nói ra thay vì lặng lẽ bỏ.

Và phần **máy làm được** của `/claim` bước 3 tách thành `node tooling/overlap-scan.mjs`: dò PR
đang mở + vùng nóng + reservation, **agent chạy được**, đưa bạn kết quả. Phần quyết định vẫn
là `/claim` của bạn — nó **không chặn gì bao giờ**. Chạy trước khi bắt tay vào một việc mới.

## 2026-08-06 — Repo con thôi mang lịch sử của harness (v2.14.0)

**Nâng lên 2.14.0 sẽ XOÁ `HARNESS-CHANGELOG.md` và `harness-migrations/` khỏi repo bạn** —
chỉ khi chúng còn nguyên như harness đặt. Không mất gì: `upgrade.mjs` xưa nay vẫn đọc cả hai
từ **bản template**, không bao giờ từ cây của bạn. Đó là 210 KB lịch sử phát triển harness
được ghi đè lại ở mỗi lần nâng cấp mà không cơ chế nào ở phía bạn đọc tới. Muốn biết harness
đổi gì thì đọc chính file này.

Nghiêm trọng hơn: `HARNESS-CHANGELOG.md` là **một nửa dấu hiệu để harness tự nhận biết mình
là template hay repo con** — và nó được ship xuống repo con. Repo nào mất
`.claude/harness-manifest.json` sẽ tự nhận là template, và **mọi dòng CHẶN sẽ im**, kể cả
*"commands rỗng ⇒ GATE KHÔNG TỒN TẠI"*. Dấu hiệu giờ là `tooling/cli.mjs` — thứ duy nhất
không bao giờ đi xuống repo con — và có test khoá lại: dấu hiệu nhận vai **không được** nằm
trong danh sách ship.

## 2026-08-06 — Công cụ đo vừa bị đo (v2.13.0)

**Nếu repo bạn chưa khai lệnh nào thật trong `harness.config.json → commands`, `harness-doctor`
giờ sẽ CHẶN ở chỗ trước đây nó cho ✓.** Không phải hồi quy: `$comment_a11y_perf` — một dòng
chú thích — đang được đếm là "1 lệnh đã khai", nên nhánh cảnh báo *"GATE KHÔNG TỒN TẠI"* chưa
từng chạy ở bất kỳ repo nào. Điền `commands.verify` / `test` / `typecheck`, hoặc đọc lý do
trong `HARNESS-CHANGELOG.md` §2.13.0 ①.

Bốn thứ nữa thôi nói dối: lời khuyên *"chạy `test-hooks.mjs` để lấy bằng chứng"* (suite ghi
telemetry sang thư mục khác — chạy bao nhiêu lần cũng không đổi gì); **`/pre-merge` in "chưa
thấy dấu gate preMerge chạy" trong khi nó chưa từng đi tìm dấu nào — `gates.mjs` chỉ ghi log
khi HỎNG, nên nghi thức đó đỏ mãi dù bạn chạy gate bao nhiêu lần** (giờ gate ghi cả lần xanh,
và nghi thức so lần chạy với commit mới nhất); nghi thức `claude-code-drift` đứng `?` trên mọi
máy cài bằng npm; và `init.mjs` gọi placeholder của template là FAIL trong khi `harness-doctor`
gọi đúng cái đó là ĐÚNG.

`harness-doctor` → "Nên làm": **19 → 4**, và 15 dòng biến mất là 15 dòng **không ai được phép
làm**. Không hook nào bị sửa.

## 2026-08-05 — Promote một bài học? Nhớ ĐĂNG KÝ nó, nếu không nó không đi đâu cả

`L0004` (gác hỏng thì chặn) đã lên `knowledge/lessons/`, kèm gate `evals/tasks/0005`.

**Việc bạn phải làm khác đi:** thêm file vào `knowledge/lessons/` hoặc `evals/tasks/` thì
phải thêm tên nó vào `SEED` trong `tooling/apply-to.mjs` — nếu không, `--audit` đỏ và bài
học **không sang được project đích**. `/knowledge-promote` chưa nói bước này; `--audit` bắt.

Bị chặn sai chỗ này → nhắn DRI, đừng tự nới `--audit`.

## 2026-08-05 — Gác ném lỗi giờ CHẶN, không im lặng cho qua (v2.12.0)

**Đọc mục này.** Đo được hôm nay: một hook ném lỗi thoát mã **1**, và Claude Code đọc mọi mã
khác 0/2 là *"lỗi không chặn"* ⇒ **lệnh đi lọt**. Cả bốn cái gác của ba nhóm nguy hiểm —
`block-secrets` · `dcg` · `protect-harness` · `protect-migrations` — đều đang như vậy.

Giờ 6 gác bất biến cứng **fail-CLOSED**; 4 hook cố vấn fail-open nhưng **hiện ra** (exit 1 —
tool đi qua *và* lỗi lộ, chứ không im). Nếu chính cái gác đang hỏng và bạn cần đi tiếp:
`HARNESS_FAIL_OPEN=1` — được ghi log.

Và một nghi thức mới **tự hiện** ở SessionStart: khi Claude Code lên bản mới, nó hỏi MỘT câu —
*bản mới có ra sẵn thứ mình đang tự viết không?* Đóng nó bằng:

```
node tooling/rituals.mjs --reviewed-claude-code "<thấy gì>"
```

## 2026-08-05 — Không cần nhớ nghi thức nữa (v2.10.0)

SessionStart giờ in **việc nào đang tới hạn kèm số đo**, thay cho dòng nhắc tĩnh cũ. Xem hết
mọi năng lực harness có (và trạng thái từng cái):

```
node tooling/rituals.mjs --all
```

Và sự có mặt của phiên được ghi **tự động**: hai phiên trên cùng một nhánh sẽ được cảnh báo
mà không ai phải gõ `/claim`. Cảnh báo đó nói thẳng: **đừng `git add -A`** — nó cuốn theo file
của phiên kia (xảy ra thật hôm nay).

**Nếu bạn từng thấy `gen-clean` nói "bạn quên chạy gen"** mà không hiểu vì sao: nó đã sai. Nay
nó chỉ nói câu đó cho file mà CHÍNH `gen` làm bẩn; cây bẩn vì lý do khác thì nó nói ra lý do.

## 2026-08-05 — LỚP KINH TẾ của bạn có thể chưa từng bật (v2.8.0)

Đo trên cả ba repo đang dùng harness: `.claude/settings.json` có **4 sự kiện hook**, template
có **9**. Trong 5 sự kiện thiếu có `StopFailure` — chỗ **duy nhất** vendor gọi cho bạn khi
tiền/quota chạm trần. `observe.mjs` đã được copy sang từ lâu và **nằm đó chết**.

Kiểm 5 giây:

```
node -e "console.log(Object.keys(require('./.claude/settings.json').hooks).join(' '))"
```

Thấy đúng 4 tên → chạy `node tooling/upgrade.mjs --from <template>`. Migration 008 cắm chúng
vào, **chỉ thêm khoá thiếu** — không chạm `permissions`, `worktree`, hay entry bạn đã sửa.

Vì sao nó thiếu: `settings.json` là lớp SEED, `upgrade.mjs` **không bao giờ ghi đè** nó (đúng —
đó là file bạn sửa). Nên chỉ **migration** đi qua được lớp đó, và trước hôm nay không có
migration nào làm việc này.

## 2026-08-05 — `evals.command`: bỏ `{prompt}`, prompt đi qua stdin (v2.7.8)

**Nếu bạn đã điền `evals.command` có `{prompt}`: runner sẽ TỪ CHỐI chạy** và nói cách sửa.
Lý do: `JSON.stringify` không phải shell escaping — prompt nhiều dòng tới agent với `\n` là
hai ký tự literal, **im lặng**, và điểm eval sai theo hướng đọc y hệt *"model tụt hạng"*.

Lệnh mới: `claude -p --max-turns {maxTurns} --permission-mode auto` (prompt qua stdin).
Runner giờ cũng **giữ transcript** của agent và in đường dẫn — eval đỏ có bằng chứng để đọc.

## 2026-08-05 — NÂNG CẤP TỪ BẢN CŨ TỪNG ĐỂ REPO HỎNG (v2.7.2)

**Đã nâng từ v1.x lên 2.x trước hôm nay? Kiểm ngay:**

```
node -e "console.log(require('fs').existsSync('tooling/gates.mjs'))"   # phải là true
```

`false` nghĩa là `settings.json` đang trỏ Stop hook vào một file KHÔNG TỒN TẠI — mọi sự
kiện Stop ném lỗi. Sửa: `node <template>/tooling/apply-to.mjs . --apply --update`, hoặc
nâng cấp lại (migration `003` nay tự mang file đó sang).

Nguyên nhân: `upgrade.mjs` luôn chạy bằng **bản cũ của chính nó**, và danh sách file cơ chế
nằm trong đó — nên mọi `tooling/*.mjs` ra đời sau version của bạn là vô hình với nó.

## 2026-08-05 — Hai cảnh báo đỏ-do-hoàn-cảnh đã tắt (v2.7.1)

Nếu bạn thấy *"chưa gửi bài học lên template"* hoặc *"skill `dedupe-scan` ứng viên GỠ BỎ"*
ngay sau khi áp harness: đó là dương tính giả, đã sửa. Chạy `apply-to`/`upgrade` một lần.

## 2026-08-05 — Áp / nâng cấp không cần bản harness trên máy (v2.7.0)

1. **`npx github:thiengthb/harness init`** — không phải clone gì trước.
2. **`node tooling/upgrade.mjs <URL> --ref v2.7.0 --apply`** — nâng cấp từ xa. `--ref` là
   BẮT BUỘC; `--ref main` chạy được nhưng bị cảnh báo (nhánh di chuyển, không phải mốc).
3. **`upstream.mjs` nhận URL** — chiều LÊN của vòng học không còn đòi hai repo cùng một máy.
   Nó IN RA lệnh push + `gh pr create`, không tự push: ghi vào template là supply-chain vào
   mọi project khác, cổng đó phải có người.
4. `entropy-scan` nhắc khi bạn có bài học mang đi được mà **chưa bao giờ** gửi lên template.

## 2026-08-05 — Phỏng vấn thay cho "nhớ điền config" (v2.6.0)

1. **`node tooling/setup.mjs --apply`** — chạy MỘT LẦN sau khi áp template. Nó đọc repo
   (package.json/pyproject/go.mod + lockfile), đề xuất `commands.*` **kèm bằng chứng**, hỏi
   phần không đọc được, ghi config + `docs/adr/0001-*`. Nó **từ chối kết thúc** khi
   `commands.verify` còn rỗng. Xem trước: `--detect` (không ghi gì).
2. **Nó không cài gì và không bịa lệnh nào.** Không thấy thì để rỗng và nói ra.
3. **Nếu bạn đã áp harness trước 2.6.0:** `tooling/gates.mjs` của bạn CHƯA BAO GIỜ được cập
   nhật qua `upgrade` (nó thiếu trong danh sách lớp cơ chế). Chạy `upgrade` một lần nữa —
   lần này nó tới.
4. `apply-to` nay gỡ `HARNESS_ALLOW_SKIPPED_GATES` khỏi `ci.yml` của project đích.

## 2026-08-05 — Áp template có ba lỗ im lặng, đã bịt (v2.5.0)

1. **Chạy lại `apply-to` hoặc `upgrade` trên project của bạn.** `.gitignore` /
   `.gitattributes` của harness trước đây **không bao giờ tới** project đã có hai file đó
   (tức là mọi project thật). Nếu bạn thấy `.claude/settings.local.json` hoặc
   `.claude/telemetry/` trong `git status` thì đây là lý do.
2. **Repo bạn có `.claude/` trong `.gitignore`?** Vậy `.claude/hooks/` chưa từng được
   commit — cả đội tưởng có harness, thật ra chỉ máy chạy `apply-to` có. Migration `006` tự
   thêm `!.claude/`. Dòng đúng là `!.claude/`, KHÔNG phải `!.claude/settings.json`: sau khi
   cả thư mục bị loại, phủ định cho từng file bên trong **vô tác dụng** (đo bằng
   `git check-ignore`).
3. **ADR của lớp harness dời sang `docs/adr/harness/`.** Số `0001` giờ thuộc về SẢN PHẨM.
4. `/verify-ui` giờ được `/ship-feature` bước 5 gọi tới, và điều kiện thoát của nó khoá vào
   `commands.e2e` thay vì một field không bao giờ tồn tại.

## 2026-08-04 — Skill `/whats-new` bị XOÁ · hai chỉ số thôi nói dối (v2.4.0)

1. **`/whats-new` không còn.** File `.claude/whats-new.md` **giữ nguyên** — bạn đang đọc nó,
   và SessionStart hook vẫn in nó một lần mỗi version. Phần *cập nhật* + *canary* chuyển vào
   **`/harness-propose` §6**, nơi bạn đang đứng khi thật sự cần chúng.
2. **`harness-size` giờ gác `skills (discovery)`**, đọc ngưỡng từ `limits.maxSkills`, không
   đếm số thư mục. Skill có `disable-model-invocation: true` tốn 0 context nên không tính.
3. **`gates --list --timing`**: stage mà mọi gate đều `n/a` giờ báo `n/a`, không báo
   `OK 0ms`. `0ms` khi không có gì chạy không phải "nhanh".

## 2026-08-04 — a11y/perf cuối cùng có dụng cụ đo · skill `verify-ui` (v2.3.0)

1. **`commands.a11y` + `commands.perf`** và hai tên đó trong `gates.preMerge`.
   `features/*.json` đòi hai bằng chứng đó từ đầu mà không có chỗ nào sinh ra chúng.
   **Điền, hoặc xoá tên khỏi `gates.preMerge`** — đừng để lệnh rỗng.
2. **`evidence` phải TRỎ TỚI THỨ CÓ THẬT.** `passes: true` giờ đòi đường dẫn **tồn tại**
   hoặc URL `http(s)`. `"đã chụp rồi"` sẽ ĐỎ. Và `a11y`/`perf` **giờ mới được kiểm** —
   trước đó vòng lặp chỉ đi qua `platforms.*`.
3. **Skill `verify-ui`**: chạy app → chụp **2 viewport** → `docs/evidence/<issue>/` → giao
   `design-evaluator`. Chạy nó **trước** khi đặt `platforms.web.passes = true`.
   `disable-model-invocation` nên nó tốn 0 context.
4. Sửa một điều harness nói sai: trần `maxSkills` tính trên **tầng discovery** (đang 3/12),
   không trên tổng số skill.

## 2026-08-04 — `pre-commit` nay bắt Slack token và JWT (v2.2.0)

Danh sách hình-dạng-secret từng có **hai bản**: hook `block-secrets` 7 pattern, `pre-commit`
chỉ 5 — thiếu **Slack token** và **JWT**. Hook chỉ thấy thứ **agent** ghi; `pre-commit` là
tầng duy nhất thấy thứ **bạn** gõ tay. Nên hai pattern thiếu đúng ở tầng gác người.

Nay một nguồn ở `tooling/lib/harness.mjs`. Không cần làm gì — nhưng nếu bạn từng dán một
token Slack/JWT vào file và nó lọt qua, **giờ nó sẽ bị chặn**, kể cả file cũ (`--all` ở CI).

## 2026-08-04 — CI không còn xanh giả (v2.1.0)

1. **Job `verify` giờ chạy `node tooling/gates.mjs --stage preMerge`.** Trước đó nó là
   `echo "CHANGEME"`, tức LUÔN XANH — trong khi `docs/BRANCH-PROTECTION.md` dạy đặt nó
   thành check bắt buộc. Mỗi `commands` còn rỗng giờ làm **CI ĐỎ**, không im lặng nữa.
2. **Job `e2e` bị XOÁ** — `e2e` là một gate trong `gates.preMerge` nên nó chạy ở
   `verify`. **Bỏ `e2e` khỏi required status checks**, không thì PR treo mãi ở
   *"Expected — waiting for status"*.
3. **`security` quét secret THẬT**: `node tooling/precommit-scan.mjs --all` (mọi file
   được track) + SCA tất định khi có lockfile. Không có lockfile thì nó nói `n/a` ra
   miệng — `n/a` không phải *"không có lỗ hổng"*.
4. `ci.yml` của TEMPLATE có `HARNESS_ALLOW_SKIPPED_GATES: '1'`. **Repo của bạn phải
   không có dòng đó** — migration 004 xoá, và `harness-doctor` báo CHẶN nếu nó còn.

## 2026-08-04 — Gate gọi thẳng runner · doctor đổi tên (v2.0.0, BREAKING)

1. **`tooling/doctor.mjs` → `tooling/harness-doctor.mjs`.** `/doctor` là lệnh NATIVE
   của Claude Code và làm việc khác. Alias còn ở 2.x (có cảnh báo), **xoá ở 3.0.0** —
   cập nhật CI/runbook ngay. Và `/entropy-sweep` bước 1 giờ giao cho `/doctor` native.
2. **`.claude/hooks/stop-gate.mjs` đã bị xoá**, `Stop` gọi thẳng
   `node tooling/gates.mjs --stage stop`. Bản cũ thiếu một nhánh: fail-đóng ở phiên
   KHÔNG có người ngồi xem. Thêm gate `subagent` (**ngân sách 5 GIÂY** — nhân với tối
   đa 16 agent song song).
3. **Đừng cắm `WorktreeCreate`/`WorktreeRemove`.** Chúng là provisioner, không phải
   observer: một script advisory ở đó làm `claude --worktree` throw, hoặc làm rò rỉ
   worktree im lặng. `harness-doctor` sẽ chặn nếu bạn thử.
4. **Auto-memory của Claude Code là CHỈ THỊ, không phải ghi chú** — nó nạp 200 dòng đầu
   `MEMORY.md` mỗi phiên. Mâu thuẫn với `knowledge/lessons/` là một LỖI. **Không commit
   nó.** Xem AGENTS.md §Hai bộ nhớ.
5. Chạy suite hook không còn làm nhiễu telemetry của bạn, và không còn ăn mất thông báo
   `/whats-new` này.

BREAKING — làm theo thứ tự: `node tooling/upgrade.mjs <đường-dẫn-template> --apply`
(migration `003` vá tự động, phần cần người thì nó in ra `→ CẦN NGƯỜI:`), rồi
`node tooling/harness-doctor.mjs`.

## 2026-08-04 — Self-test không còn đỏ giả ở project đích (v1.5.0)

1. **`paths.secrets` giờ phủ định được**: `"**/.env.*"` + `"!**/.env.example"`.
   Trước đây pre-commit chặn `.env.example` — file `init.mjs` cần — ngay ở commit đầu.
2. **`--audit` tự bỏ qua** ở project đích (nó là check của repo template). Hết `Template
   coverage FAIL` trong `doctor` và trong CI parity.
3. **`test-hooks` assert logic, không assert config của bạn.** Điền `commands` không còn
   làm test suite đỏ. Cần một trạng thái config thì dùng `HARNESS_CONFIG=<fixture>`.

Không phải BREAKING — không cần làm gì. Muốn nhận bản sửa:
`node tooling/upgrade.mjs <đường-dẫn-template> --apply`

## 2026-08-03 — Bài học giờ đi được NGƯỢC LÊN template (v1.4.0)

1. **`node tooling/knowledge/upstream.mjs <template>`** — gửi bài học + gate + diff
   cơ chế của project này ngược lên template. Trước đây chiều này không tồn tại:
   trí tuệ tích ở project, project mới vẫn khởi động từ số 0.
2. **`node tooling/knowledge/accept.mjs --list`** — duyệt pack nạp về. `--merge <id>`
   cộng bằng chứng từ repo khác vào bài học có sẵn: đó là cách một bài học universal
   đủ ngưỡng "2 lần độc lập", vì mỗi repo chỉ gặp nó một lần.
3. Bài học dạng test/hook/generator giờ nên khai **`evals:`** — gate đi theo bài học.
   Không có gate thì repo nhận có cơ chế mà không kiểm được cơ chế đó.

## 2026-08-03 — Sửa migration KHÔNG còn bị chặn oan (v1.3.0)

1. **Bạn sửa được file trong `migrations/` rồi.** Guard cũ coi mọi migration là
   file generated và chặn hết — sai, vì Rails/Alembic/Django/Flyway đều để bạn viết
   thân file bằng tay.
2. **Chỉ còn chặn migration ĐÃ MERGE** (có trong `origin/main`). Sửa nó làm DB của
   mọi người lệch nhau im lặng. Muốn đổi → viết migration MỚI.
3. Chắc chắn migration đó chưa apply ở đâu? `HARNESS_ALLOW_MIGRATION_EDIT=1` (ghi log).

## 2026-08-03 — Nâng cấp harness giờ AN TOÀN, và một lệnh kiểm tất cả

1. **`node tooling/doctor.mjs`** *(đổi tên thành `tooling/harness-doctor.mjs` ở v2.0.0)* — lệnh DUY NHẤT bạn cần nhớ. Nó gọi mọi kiểm tra
   khác và tổng hợp thành một bảng có hành động.
2. **Nâng cấp harness không còn ghi đè mù**: `node tooling/upgrade.mjs <template>`.
   File bạn đã sửa được GIỮ NGUYÊN, bản template ghi ra `.new`. Xem `docs/MIGRATION.md`.
3. **`entropy-scan.mjs`** — máy tìm dấu hiệu harness hết hạn: rule thiếu `paths`,
   tài liệu quá hạn, hook đăng ký mà không có test.

Đừng gitignore `.claude/harness-manifest.json` — không có nó, nâng cấp sau này
không phân biệt được "bạn đã sửa" với "template đã đổi".

## 2026-08-03 — Lớp kinh tế, bảo vệ test, và cửa thoát DRI

1. **Hook mới `protect-tests`** — chặn khi bạn ghi một file test có ÍT assertion/test
   block hơn bản trên đĩa. Sửa CODE cho test pass, đừng sửa test cho code pass.
   Xoá test đã lỗi thời thật thì thêm comment `harness-allow-test-shrink`.
2. **Cửa thoát DRI**: `HARNESS_DRI=1` cho phép sửa file harness và **ghi log** vào
   `.claude/telemetry/harness-edits.log`. Dùng khi bạn CHỦ Ý bảo trì harness.
3. **Lớp kinh tế**: `harness.config.json → budget` (cap turn/wall-clock/tool-call)
   và `node tooling/capo-report.mjs`. Đọc `docs/ECONOMICS.md`.

Tài liệu mới: `ROADMAP-30D` (làm gì tuần nào) · `ANTI-PATTERNS` (tra cứu khi có gì
đó sai) · `ARCHITECTURE` · `RECOVERY` · `TEAM` · `MULTI-PROJECT`.

## 2026-08-03 — Harness baseline v1

Ba thứ bạn cần biết ngay:

1. **Hook sẽ chặn bạn** khi sửa file generated, file secret, hoặc `.claude/settings.json`.
   Đó là cố ý. Đọc thông báo, làm theo. Nếu bạn nghĩ hook sai → `/harness-propose`, **đừng tự tắt hook**.
2. **Nghi thức**: `/claim` khi bắt đầu · `/handoff` khi kết thúc · `/pre-merge` trước khi mở PR.
3. **Trần song song 2 session/người.** Muốn nhanh hơn thì làm PR nhỏ hơn, đừng thêm session.

Chưa cấu hình `harness.config.json` → gate rỗng → harness này chỉ là trang trí. Làm việc đó trước.
