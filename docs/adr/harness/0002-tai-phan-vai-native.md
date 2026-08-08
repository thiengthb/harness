---
status: accepted
date: 2026-08-04
deciders: "@dri"
last-verified: 2026-08-04
supersedes: none
---

# ADR 0002 — Tái phân vai: Claude Code sở hữu RUNTIME, harness sở hữu CHÍNH SÁCH

## Bối cảnh

Harness này lớn lên trong lúc bề mặt native của Claude Code cũng lớn lên. Hệ quả:
một số cơ chế tự viết đang **trùng** với thứ vendor đã làm ở tầng thấp hơn, và một
số điểm mở rộng native đang **để trống**.

Anthropic ship **điểm mở rộng rỗng**: hook có cơ chế nhưng không có nội dung,
permission có cú pháp nhưng không có luật, `.claude/rules/` có `paths` nhưng không
có rule. Đây không phải thiếu sót — nội dung là đặc thù repo.

**Hệ quả: harness không cạnh tranh được với Claude Code. Nó chỉ có thể LẤP hoặc
TRÙNG các điểm mở rộng.** Mọi chồng chập đều là dấu hiệu đang lấp một chỗ đã được
lấp ở tầng thấp hơn.

## Quyết định

### Câu một dòng

> **Claude Code sở hữu RUNTIME. Harness sở hữu CHÍNH SÁCH.**
> Runtime = vòng lặp, tool, context, quyền, cách ly, sự kiện vòng đời.
> Chính sách = "xong" nghĩa là gì *ở repo này*, ai được quyết, cái gì phải có bằng chứng.

### Thang đặt cơ chế — luật cứng

Đặt mỗi cơ chế ở **bậc THẤP NHẤT mà nó còn làm được việc**. Không bao giờ tự viết
ở bậc N thứ mà bậc N−1 đã làm.

```
0  managed settings            vendor cưỡng chế, người dùng không override được
1  permissions deny/ask         vendor cưỡng chế, phủ cả Bash-đọc-file, hợp nhất vào sandbox
2  sandbox (OS)                 vendor cưỡng chế ở tầng OS, phủ cả tiến trình con
3  sự kiện hook native          vendor gọi ĐÚNG LÚC, ta viết logic — nơi DUY NHẤT có cửa thoát
4  script tất định (tooling/)   logic của ta, chạy khi ta gọi
5  skill                        kiến thức thỉnh thoảng cần, có discovery cost
6  rule có `paths`              luật theo vùng, nạp khi chạm file khớp
7  gotcha trong AGENTS.md       LUÔN nạp — đắt nhất, mục nhanh nhất
```

### Bài test bốn câu — dừng ở câu đầu tiên trả lời "có"

```
1. CC có bề mặt native làm đúng việc này chưa?  → có: DÙNG NATIVE, xoá bản tự viết
2. Nó có cần CỬA THOÁT hoặc LOGIC ĐỘNG không?   → có: hook, và chỉ hook
3. Nó có phải chính sách đặc thù repo/đội?      → có: GIỮ, đây là chỗ bất khả thay thế
4. Nó có được MÁY đọc không?                    → không: thuế context, không phải harness
```

### Bảng chủ sở hữu — không ô nào có hai chủ

| Mối quan tâm | Chủ | Cơ chế |
|---|---|---|
| Vòng lặp agent, tool, context, compaction | **Claude Code** | runtime |
| Cách ly filesystem + network | **Claude Code** | `sandbox` + deny rule hợp nhất |
| Chặn tĩnh: generated, `_index.json`, secret theo đường dẫn | **Claude Code** | `permissions.deny` |
| Chặn động **có cửa thoát**: harness, test, migration, secret theo nội dung | **Harness** | PreToolUse hook |
| Lệnh phá hoại theo **ngữ nghĩa** | **Harness** | `dcg.mjs` |
| "Xong" nghĩa là gì | **Harness** | `gates.mjs` + Stop/SubagentStop |
| Bằng chứng cho một feature | **Harness** | `features/*.json` + `check-feature-integrity` |
| Bộ nhớ quan sát, per-máy | **Claude Code** | auto-memory |
| Bộ nhớ quyết định, mang đi được | **Harness** | `knowledge/lessons` + `evals:` |
| Đo context tiêu ở đâu | **Claude Code** | `/context` + `InstructionsLoaded` |
| Đo harness có phình không | **Harness** | `harness-size` + `entropy-scan` |
| Tiền và quota | **Claude Code** | OTel + `StopFailure` + managed spend limit |
| Phân phối lớp cơ chế | **Claude Code** | marketplace + pin sha (chỉ khi ≥3 repo) |
| Phân phối lớp nội dung + migration | **Harness** | `apply-to` + `upgrade` + `harness-migrations` |
| Nghi thức khởi động | **CC gọi, Harness quyết** | `Setup` (init/maintenance) + `SessionStart` hook |
| **Tạo/xoá worktree** | **Claude Code, TOÀN BỘ** | `WorktreeCreate/Remove` là provisioner — xem §"Năm chỗ TỪ CHỐI" #4, #5 |

## Bằng chứng — đo TRƯỚC khi sửa (2026-08-04)

Không có bảng này thì mọi thay đổi trong đợt này là phỏng đoán.

| # | Khẳng định cần kiểm | Đo được | Hệ quả |
|---|---|---|---|
| 1 | skill dùng `allowed-tools` | 12/12; `disallowed-tools` 0; `disable-model-invocation` 0 | sửa cả 12 |
| 2 | `dcg` gác `git push` thường? | không — nhưng `permissions.ask` đã có | **không phải lỗ hổng** |
| 3 | `apply-to` có mang `settings.json`? | **CÓ** | cửa sổ rủi ro "repo mới chưa có hook" **ĐÓNG** |
| 4 | `entropy-scan` đo tuổi bằng gì | `mtime`, và **chỉ** cho doc có `last-verified:` | không có "quét theo im lặng" → A4 **không áp dụng** |
| 5 | baseline `harness-size` ghi cây đã đo? | **KHÔNG** | N1 xác nhận → đã vá |
| 6 | số case test hook | **53** (README nói 28) | bảng viết tay đã lệch → sinh tự động |
| 7 | hook trên đĩa mà ngoài `settings.json` | **0/10** | sạch; giữ check chống hồi quy |
| 8 | `telemetry()` có nhánh thành công? | **KHÔNG** | N3 xác nhận → `hookRan()` |
| 9 | mutation testing | **0** | A2 xác nhận → 3 mutant đầu tiên |
| 10 | neo "yêu cầu nguyên văn" | **0** | issue URL là neo; không thêm khối trùng |

**Lô 0 — ĐÃ ĐO trong một phiên thật (2026-08-04, Opus 5 · cửa sổ 1M):**

- [x] **`/context`** — thuế context của lớp harness:

  | Mục | Tokens | % cửa sổ |
  |---|---|---|
  | Memory files (`AGENTS.md` 2.8k · `rules/README` 943 · `danger-zones` 842 · `CLAUDE.md` 14) | **4.6k** | 0.5% |
  | Custom agents (5) | 396 | 0.04% |
  | Skill **của project** trong tầng discovery (3: dedupe-scan · research-first · ship-feature) | **~190** | 0.02% |
  | MCP tool definitions (44 tool) | **0** | 0% |
  | **Tổng lớp harness** | **≈ 5.2k** | **0.5%** |

  Hai điều số này nói ra, và cả hai đều đổi cách đọc mục tiêu:
  - **MCP = 0 token.** Tool definition giờ nạp **theo yêu cầu** (deferred), chỉ tốn
    ~15.6k khi thật sự dùng. Ngưỡng `mcp.maxTools ≤ 20` trong config được đặt khi
    tool defs ăn context ở MỌI request — **tiền đề đó đã hết hạn**. Ngưỡng nên đọc lại
    thành "≤20 tool ĐANG NẠP", và đó là việc của đợt sau, không phải sửa vội ở đây.
  - **9 skill nghi thức đóng góp 0** nhờ `disable-model-invocation` (1.6.0). Tầng
    discovery của project còn **3**, và chi phí thật của chúng là ~190 token —
    nhỏ hơn `danger-zones.md`, một file rule duy nhất.
- [x] `EVAL_ISOLATED=1 node evals/run.mjs --baseline` → **50% (2/4)**, ghi vào
  `.claude/state/eval-baseline.json`
- [x] `EVAL_ISOLATED=1 node evals/run.mjs --bare --baseline` → **50% (2/4)**
- [x] `node tooling/gates.mjs --list --timing` → `stop` **0ms**/30s · `subagent` **0ms**/5s

**Và hai chỗ phải nói là CHƯA ĐO ĐƯỢC, không được làm tròn thành một con số:**

1. **"Giá trị đo được của toàn bộ harness" = `eval` − `eval --bare` = 0pp — nhưng đây
   là số 0 DO CẤU TRÚC, không phải phát hiện.** `evals.command` rỗng ⇒ không có agent
   nào chạy ⇒ cả hai lần đo chỉ chạy assertion tất định trên **cùng một trạng thái
   repo**, nên `--bare` không thể khác. Chỉ project đã khai `evals.command` (một lệnh
   `claude -p …` thật) đo được chỉ số này. Đây đúng là "trạng thái thứ ba" mà
   `report()` bắt phải phân biệt — và nếu ghi "harness không tạo ra giá trị đo được"
   thì đó là một kết luận rút từ một phép đo chưa chạy.

   > **Đính chính 2026-08-08 (v2.43.0, #91) — nguyên nhân ghi ở trên ĐÚNG nhưng CHƯA
   > ĐỦ, và phần thiếu lớn hơn phần đã ghi.** `--bare` khi đó **không gỡ gì cả**: nó đổi
   > tên file baseline, đổi tiêu đề, đổi lời nhắn cuối, còn `spawnSync` trong `runAgent()`
   > không nhận nó — cùng `cwd`, cùng bộ hook. Nên **lấp `evals.command` cũng không làm
   > số đó khác 0**: hai lần chạy vẫn đo cùng một thứ, chỉ tốn gấp đôi tiền.
   >
   > Từ v2.43.0 `--bare` là một cơ chế thật (clone dùng một lần, đã gỡ remote và gỡ lớp
   > harness Claude Code tự nạp), có tiền kiểm loại các assertion đo chính lớp harness, và
   > runner **tự làm phép trừ trên giao của hai tập đo được**. Ô "CHƯA ĐO ĐƯỢC" trong bảng
   > dưới vẫn đúng cho repo template — nhưng lý do nay chỉ còn một: `evals.command` rỗng.
2. **Mục tiêu "thuế context ↓ ≥30%" KHÔNG so được.** Không ai chạy `/context` TRƯỚC đợt
   này, nên không có số để trừ. 0.5% thoả mục tiêu tuyệt đối (`< 5%`) gấp 10 lần, nhưng
   tỉ lệ giảm thì vĩnh viễn không lấy lại được. Bảng trên **là baseline** cho lần sau.
   Bài học rẻ nhất của cả đợt: *một chỉ số dạng "giảm ≥X%" phải được đo TRƯỚC khi sửa,
   nếu không nó tự động thành chỉ số không phán quyết được gì.*

## Bốn chỉ số phán quyết đợt này

| Chỉ số | Đo bằng | Mục tiêu | ĐO ĐƯỢC 2026-08-04 |
|---|---|---|---|
| Thuế context | `/context` | ↓ ≥30%, và < 5% context window | **0.5%** ✅ tuyệt đối · tỉ lệ **chưa so được** (không có số trước) |
| Giá trị đo được của harness | `eval --baseline` − `eval --bare --baseline` | **không đổi hoặc tăng**. Tụt ⇒ vừa cắt nhầm, revert đúng mảnh đó | **CHƯA ĐO ĐƯỢC** — `evals.command` rỗng, xem §Bằng chứng |
| Độ trễ gate | `gates.mjs --list --timing` | `stop` < 30s · `subagent` < 5s | **0ms / 0ms** ✅ (n/a: template chưa khai `commands`) |
| Kích thước harness | `harness-size.mjs` | **phẳng hoặc ↓** | baseline ghi lại hôm nay; phán quyết **2026-11-02** |

Ba trong bốn chỉ số hoặc đã đạt hoặc phải đợi. Chỉ số duy nhất **không đo được ở
template** là chỉ số quan trọng nhất — và nó chỉ mở ra khi một project thật khai
`evals.command`. Ghi ra để lần sau không ai đọc bảng này như "đã xanh hết".

## Năm chỗ TỪ CHỐI làm theo tài liệu nguồn, và vì sao

Ghi ra vì một đợt rà soát không từ chối gì là một đợt chưa đủ phản biện.
Hai chỗ cuối chỉ lộ ra khi đo **binary CLI đang chạy** thay vì đọc tài liệu — xem
§Nguồn. Chúng là hai chỗ suýt làm vỡ việc của cả đội, nên chúng đứng đây, không ở
phần phụ lục.

1. **KHÔNG xoá `/wt` và `/whats-new`.** Nguồn gọi chúng là "bọc một lệnh". Đọc thật
   thì `/wt` chứa bảng tài nguyên cục bộ (cổng, DB, inotify, simulator, `index.lock`)
   và luật sparse-checkout; `/whats-new` chứa quy trình canary. Không có ở đâu khác.
   Mục tiêu thật là **cắt tầng discovery** — `disable-model-invocation: true` làm
   đúng điều đó với chi phí context về 0 và **không mất tri thức nào**.
   Hệ quả: trần "≤12 skill" đọc lại thành **"≤12 skill model tự gọi được"**.

   > **THAY THẾ MỘT NỬA ở v2.4.0 — phần `/whats-new`.** Skill đó **đã bị xoá**, và lý do
   > không phải vì quyết định trên sai: nó **đúng cho tới khi tiền đề của nó hết hiệu lực.**
   > Tiền đề là *"quy trình canary không có ở đâu khác"*. Ở v2.4.0 canary + nghi thức
   > thông báo được **chuyển vào `/harness-propose` §6** — nơi chúng thuộc về, vì đó là
   > artefact người thi hành thật sự mở lúc đổi harness (cùng luật với D8/G-nhóm:
   > *một luật cưỡng chế ở sai thời điểm đọc như là đã có phủ sóng*). Sau khi chuyển,
   > tiền đề sai, nên kết luận không còn đứng.
   >
   > `/wt` **vẫn giữ** — bảng tài nguyên cục bộ của nó chưa được chuyển đi đâu, nên tiền
   > đề của nó còn nguyên. Đây là chỗ ghi rõ để lần sau không ai cắt nó bằng cách trích
   > câu này như một tiền lệ chung.
   >
   > Ghi vào ADR chứ không sửa dòng trên, vì một ADR bị viết lại thì mất giá trị: cái
   > đáng đọc không phải "hôm nay đúng gì" mà là **"vì sao nó từng đúng, và điều gì đã đổi"**.

2. **KHÔNG thay `block-generated-edit` / `protect-feature-files` bằng deny rule.**
   Nguồn coi chúng là glob tĩnh. Thực tế cả hai **đọc `harness.config.json`**:
   `paths.generated` là per-project, và `protect-feature-files` còn so mã issue với
   tên nhánh. Chuyển sang deny rule tĩnh là đánh đổi **nguồn sự thật duy nhất** —
   thuộc tính mạnh nhất của template này — lấy một chút phủ sóng Bash.
   Quyết định: **giữ hook, THÊM deny rule làm lớp hai**, và `harness-doctor` cảnh báo
   khi hai lớp lệch nhau. Deny rule không test được bằng spawn hook, nên chỗ nó được
   kiểm là doctor — nếu không, xoá nó đi cũng không ai biết.

3. **KHÔNG cắm gì vào `WorktreeCreate`.** Nó **không phải** điểm mở rộng quan sát —
   nó là **provisioner**. Hợp đồng của vendor: *"Stdout should contain the absolute
   path to the created worktree directory."* Hook không in đường dẫn ⇒ CC **throw** ⇒
   `claude --worktree` **vỡ cho cả đội**. Kế hoạch ban đầu (`check-reservations.mjs
   --on-create`) sẽ nổ ngay lần đầu ai đó mở worktree.

4. **KHÔNG cắm gì vào `WorktreeRemove`.** Cùng lớp lỗi, hỏng im lặng hơn: hợp đồng là
   *"Exit code 0 — worktree removed successfully"*. Một script advisory exit 0 làm CC
   tin worktree **đã được xoá** và **bỏ qua bước xoá của chính nó** ⇒ worktree rò rỉ,
   và triệu chứng xuất hiện cách nguyên nhân vài ngày.

   Hệ quả của #3 + #4: **không** thêm cờ `--on-create` cho `check-reservations.mjs`,
   **không** thêm cờ `--one` cho `wt-clean.mjs` (−2 cơ chế so với kế hoạch). Dòng
   *"kiểm `reservations/`"* trong AGENTS.md vẫn xoá được, nhưng nhờ cơ chế **đã có**:
   `session-start.mjs` §5 in reservation đang hoạt động, pre-commit cưỡng chế nó.
   Bậc 7 → bậc 3, chỉ là ở một sự kiện khác. `harness-doctor` có check chặn việc cắm
   lại — bài học phải nằm trong MÁY, không nằm trong một đoạn văn ai đó sẽ không đọc.

5. **KHÔNG dùng `!process.stdout.isTTY` trong `unattended()`.** Nguồn đề xuất công
   thức đó. Hook **luôn** được spawn với stdio piped → isTTY false ở **mọi** phiên,
   kể cả phiên có người ngồi nhìn. Mọi thứ fail-đóng dựng trên đó thành guard bắn
   nhầm cho cả team — đúng `knowledge/lessons/0002-guard-ban-nham.md`. Chỉ giữ ba
   tín hiệu đọc được từ trong hook: `CI`, `CLAUDE_CODE_ENTRYPOINT=sdk-cli`, cờ tường minh.

## Hệ quả

**Được:** một chủ cho mỗi cơ chế · deny rule tự động thành ranh giới sandbox khi bật
sandbox · tầng discovery co từ 12 xuống 3 · lớp kinh tế lần đầu có chỗ vendor GỌI
cho ta (`StopFailure`) thay vì con số không ai đọc.

**Mất / rủi ro:**
- Bật sandbox **sẽ** chặn oan. Chắc chắn, không phải có thể. Quy trình bắt buộc:
  một máy, hai ngày công việc thật, ghi lại mọi lần chặn oan. Không làm được thì
  đừng bật — và đó là lý do đợt này **không** commit `sandbox.enabled: true`.
- Đợt này ròng **+3 file**. Nếu sau 90 ngày `harness-size` đi lên, mục đầu tiên cần
  xét lại là chính ADR này.

## Điều kiện thoát

| Bản vá | Chết khi nào |
|---|---|
| `observe.mjs` (InstructionsLoaded) | thuế context dưới ngưỡng 2 quý liên tiếp |
| deny rule lớp hai | không bao giờ — deny rule không mục |
| `Agent(model:opus)` ask rule | khi managed settings có spend limit phủ cùng việc |
| `budget-alarm` (StopFailure) | khi org bật spend limit cứng ở gateway |
| gate `subagent` | khi vendor cho chạy Stop hook cho từng subagent |
| `unattended()` | khi vendor phơi ra cờ chính thức cho phiên không người |
| `dcg.mjs` phần còn lại | khi sandbox phủ được **ngữ nghĩa lệnh**, không chỉ filesystem |
| alias `tooling/doctor.mjs` | **3.0.0** — mốc cứng, đã ghi trong changelog |
| check "provisioner event" trong doctor | khi vendor tách hai họ sự kiện ở tầng cấu hình |
| phòng chờ `entropy-scan --stage` | nếu sau 6 tháng chưa MỘT LẦN miễn tội cho file nào → rút 30 ngày xuống 14 |
| ratchet | nếu sau 60 ngày không mốc nào được hạ → nó đang CHE backlog, bỏ đi |

## Nguồn

**Nguồn mạnh nhất là binary CLI đang chạy, không phải tài liệu.** Tài liệu nói đúng
về *tên* sự kiện nhưng không nói đủ về *hợp đồng*. Schema hook nhúng ngay trong CLI —
nó là thứ ĐANG THI HÀNH, và nó đọc được:

```bash
grep -a -A6 -m1 'WorktreeCreate:{summary:' ~/.local/share/claude/versions/<ver>
```

Đo ngày 2026-08-04 trên `2.1.221`. Ba điều chỉ nguồn này nói ra:

| Sự kiện | Điều tài liệu không nói rõ |
|---|---|
| `WorktreeCreate` | stdout PHẢI là đường dẫn worktree — đây là provisioner, không phải observer |
| `WorktreeRemove` | exit 0 = "đã xoá xong" — CC bỏ qua bước xoá của nó |
| `StopFailure` | *"Fire-and-forget — hook output and exit codes are ignored"*: mọi `console.error` ở đó là **chữ chết**. Trường là `error` (enum 10 giá trị), không phải `reason`/`error_type` |

Hệ quả thiết kế của dòng thứ ba: `observe.mjs` **ghi mẩu bánh mì** vào
`.claude/state/last-stop-failure.json` và `session-start.mjs` in nó MỘT LẦN ở phiên
sau. Một cảnh báo về tiền mà không ai đọc thì bằng không có cảnh báo.

Và bài học tổng quát, đắt hơn cả ba dòng trên: **một điểm mở rộng native không mặc
định là chỗ để quan sát.** Có ba loại — observer (`InstructionsLoaded`), gate
(`ConfigChange`, `SubagentStop`), và **provisioner** (`WorktreeCreate/Remove`). Cắm
sai loại thì hỏng không phải ở hook, mà ở cơ chế mà hook vừa giành mất quyền sở hữu.

`code.claude.com/docs/en/{hooks,skills,permissions}` — fetch trực tiếp 2026-08-04.
Ba điểm tài liệu nguồn nêu mà lần fetch này **sửa lại**:

- Danh sách key frontmatter skill hợp lệ là **16**, không phải 12 — thiếu
  `argument-hint`, `agent`, `paths`, `shell`.
- `allowed-tools` chấp nhận **cả** chuỗi cách nhau bởi khoảng trắng **lẫn YAML list**.
  Câu hỏi treo "list YAML có bị bỏ qua im lặng không" → **không**, nó hoạt động.
  Nghĩa là grant đang có hiệu lực thật, không phải field chết.
- `Read` deny rule chặn luôn `Edit` trên cùng path, **nhưng không chặn `Write` và
  `NotebookEdit`** — nên path nào không tool nào được đổi thì phải có `Edit` deny riêng.
