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
| Nghi thức khởi động / worktree | **CC gọi, Harness quyết** | `Setup`, `WorktreeCreate/Remove` hook |

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

**Còn thiếu để hoàn tất Lô 0** (chạy trong một phiên thật, ghi vào đây):

- [ ] `/context` — tokens của memory · skill discovery · MCP tool defs · rules
- [ ] `EVAL_ISOLATED=1 node evals/run.mjs --baseline`
- [ ] `EVAL_ISOLATED=1 node evals/run.mjs --bare --baseline` — hiệu hai số = **giá trị đo được của toàn bộ harness**
- [ ] `node tooling/gates.mjs --list --timing` — độ trễ gate

## Bốn chỉ số phán quyết đợt này

| Chỉ số | Đo bằng | Mục tiêu |
|---|---|---|
| Thuế context | `/context` | ↓ ≥30%, và < 5% context window |
| Giá trị đo được của harness | `eval --baseline` − `eval --bare --baseline` | **không đổi hoặc tăng**. Tụt ⇒ vừa cắt nhầm, revert đúng mảnh đó |
| Độ trễ gate | `gates.mjs --list --timing` | `stop` < 30s · `subagent` < 5s |
| Kích thước harness | `harness-size.mjs` | **phẳng hoặc ↓** |

## Ba chỗ TỪ CHỐI làm theo tài liệu nguồn, và vì sao

Ghi ra vì một đợt rà soát không từ chối gì là một đợt chưa đủ phản biện.

1. **KHÔNG xoá `/wt` và `/whats-new`.** Nguồn gọi chúng là "bọc một lệnh". Đọc thật
   thì `/wt` chứa bảng tài nguyên cục bộ (cổng, DB, inotify, simulator, `index.lock`)
   và luật sparse-checkout; `/whats-new` chứa quy trình canary. Không có ở đâu khác.
   Mục tiêu thật là **cắt tầng discovery** — `disable-model-invocation: true` làm
   đúng điều đó với chi phí context về 0 và **không mất tri thức nào**.
   Hệ quả: trần "≤12 skill" đọc lại thành **"≤12 skill model tự gọi được"**.

2. **KHÔNG thay `block-generated-edit` / `protect-feature-files` bằng deny rule.**
   Nguồn coi chúng là glob tĩnh. Thực tế cả hai **đọc `harness.config.json`**:
   `paths.generated` là per-project, và `protect-feature-files` còn so mã issue với
   tên nhánh. Chuyển sang deny rule tĩnh là đánh đổi **nguồn sự thật duy nhất** —
   thuộc tính mạnh nhất của template này — lấy một chút phủ sóng Bash.
   Quyết định: **giữ hook, THÊM deny rule làm lớp hai**, và `harness-doctor` cảnh báo
   khi hai lớp lệch nhau. Deny rule không test được bằng spawn hook, nên chỗ nó được
   kiểm là doctor — nếu không, xoá nó đi cũng không ai biết.

3. **KHÔNG dùng `!process.stdout.isTTY` trong `unattended()`.** Nguồn đề xuất công
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
| phòng chờ `entropy-scan --stage` | nếu sau 6 tháng chưa MỘT LẦN miễn tội cho file nào → rút 30 ngày xuống 14 |
| ratchet | nếu sau 60 ngày không mốc nào được hạ → nó đang CHE backlog, bỏ đi |

## Nguồn

`code.claude.com/docs/en/{hooks,skills,permissions}` — fetch trực tiếp 2026-08-04.
Ba điểm tài liệu nguồn nêu mà lần fetch này **sửa lại**:

- Danh sách key frontmatter skill hợp lệ là **16**, không phải 12 — thiếu
  `argument-hint`, `agent`, `paths`, `shell`.
- `allowed-tools` chấp nhận **cả** chuỗi cách nhau bởi khoảng trắng **lẫn YAML list**.
  Câu hỏi treo "list YAML có bị bỏ qua im lặng không" → **không**, nó hoạt động.
  Nghĩa là grant đang có hiệu lực thật, không phải field chết.
- `Read` deny rule chặn luôn `Edit` trên cùng path, **nhưng không chặn `Write` và
  `NotebookEdit`** — nên path nào không tool nào được đổi thì phải có `Edit` deny riêng.
