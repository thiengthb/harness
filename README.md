# Harness Template

Bộ harness dùng lại được cho AI agent trong **project thật, đội nhiều người,
nhiều session song song, nhiều hệ điều hành** — và có cơ chế mang trí tuệ tích luỹ
sang project khác.

```
AGENT = MODEL + HARNESS
        ↑              ↑
   không kiểm soát   toàn bộ phần bạn kiểm soát
```

---

## Áp lên một project trong 10 phút

```bash
# 1. Copy lớp harness vào project của bạn
node /đường/dẫn/harness/tooling/apply-to.mjs /đường/dẫn/project-cua-ban --apply

# 2. Trong project đó, điền MỘT file
$EDITOR harness.config.json      # project.id, dri, và commands.*

# 3. Bootstrap + kiểm
node tooling/init.mjs
node tooling/harness-doctor.mjs          # ← lệnh DUY NHẤT bạn cần nhớ

# 4. Điền AGENTS.md — chỉ 3 mục: Project · Lệnh · Gotchas
```

## Nâng cấp về sau

```bash
node tooling/upgrade.mjs /đường/dẫn/harness            # XEM TRƯỚC
node tooling/upgrade.mjs /đường/dẫn/harness --apply
```

**Không có ghi đè im lặng.** `.claude/harness-manifest.json` lưu hash mọi file cơ chế,
nên `upgrade` phân biệt được *"bạn đã sửa"* với *"template đã đổi"*:

```
bạn CHƯA sửa  →  cập nhật an toàn
bạn ĐÃ sửa    →  GIỮ NGUYÊN của bạn, bản template ghi ra <file>.new
file mới      →  thêm
đổi cấu trúc  →  harness-migrations/ chạy script (đổi tên field, chuyển thư mục…)
```

Nội dung của project (`harness.config.json`, `AGENTS.md`, `features/`,
`knowledge/lessons/`, `docs/progress/`) **không bao giờ bị đụng**.
Chi tiết + cách giữ migration luôn dễ: [docs/MIGRATION.md](docs/MIGRATION.md)

**Việc số 1, làm trước mọi thứ khác:** điền `harness.config.json → commands`.
Không có lệnh verify thì gate không tồn tại, và toàn bộ harness này chỉ là trang trí.
Bạn vẫn là verification loop.

---

## Nó giải quyết cái gì

| Vấn đề | Cơ chế | Ở đâu |
|---|---|---|
| Agent lan man khi codebase phình to | sparse worktree cưỡng chế ở tầng filesystem · rule theo `paths` · một feature một session | `settings.local.example.json`, `.claude/rules/`, `/ship-feature` |
| "Session sau không biết session trước" | nhật ký per-issue · SessionStart ritual · nghi thức handoff | `docs/progress/<issue>.md`, `session-start.mjs`, `/handoff` |
| Nhiều session song song đạp lên nhau | Coordination Ladder: đo → partition → đặt chỗ → serialize | `docs/CONFLICTS.md`, `coactivity.mjs`, `reservations/` |
| Merge sạch nhưng build vỡ (conflict ngữ nghĩa) | merge queue · typecheck toàn repo · nhánh < 1 ngày | `docs/BRANCH-PROTECTION.md` |
| 5 người cùng sửa harness | CODEOWNERS · `protect-harness` hook · canary · `/whats-new` | `.github/CODEOWNERS`, `.claude/hooks/` |
| "Chạy trên máy tôi thì được" | Parity Contract: mọi script là Node `.mjs` · CI matrix 3 OS · `.gitattributes` | `harness-parity.yml`, `tooling/init.mjs` |
| Agent tự khen, mark done sớm | default-FAIL + evidence bắt buộc + CI cưỡng chế | `features/`, `check-feature-integrity.mjs` |
| Agent sửa test cho pass thay vì sửa code | đếm assertion/test block, chặn khi thu nhỏ | `protect-tests.mjs` |
| Agent tự sửa harness của chính nó | hook chặn · agent ĐỀ XUẤT, người PROMOTE · cửa thoát DRI có log | `protect-harness.mjs`, `/harness-propose` |
| Hoá đơn nhảy vọt sau một đêm | 5 guardrail ngân sách + CAPO + model tiering | `docs/ECONOMICS.md`, `capo-report.mjs` |
| Agent hỏng ở bước 40/50, mất hết | mọi thứ cần để tiếp tục nằm TRÊN ĐĨA, không trong context | `docs/RECOVERY.md` |
| Boilerplate và code trùng lặp | generator ở nguồn > detector ở cuối | `docs/ARCHITECTURE.md`, `/dedupe-scan` |
| **Trí tuệ không mang đi được sang project khác** | **vòng học có gate + lesson có scope + export/import** | **`knowledge/`** |

---

## Cấu trúc

```
harness.config.json          ★ NGUỒN SỰ THẬT — chỗ DUY NHẤT biết về stack cụ thể
AGENTS.md                    ★ hợp đồng của team (~150 dòng, giữ ngắn)
CLAUDE.md                    → @AGENTS.md

.mcp.json.example            3–5 server. CLI luôn rẻ hơn MCP về token.

.claude/
├── settings.json            harness của TEAM (commit, chỉ DRI sửa)
├── settings.local.example.json  van xả áp cá nhân (sparsePaths, statusline)
├── whats-new.md             thông báo đổi harness, hiện MỘT LẦN mỗi version
├── hooks/*.mjs              9 hook, Node thuần, chạy 3 OS
├── rules/                   rule theo `paths`, có owner + expires-review
├── skills/                  12 skill (ngưỡng ≤12 — thêm nữa thì phải bỏ bớt)
├── agents/                  evaluator · design-evaluator · security-reviewer
│                            architect · researcher
└── learnings/               ĐỀ XUẤT của agent — một file/người/tuần

knowledge/                   ★ TRÍ TUỆ TÍCH LUỸ, MANG ĐI ĐƯỢC
├── README.md                vòng học 5 bước, thứ tự biểu diễn, scope
├── lessons/*.md             bài học đã promote, có scope + exit-condition
└── index.json               (sinh tự động)

tooling/
├── init.mjs                 ★ bootstrap 3 OS — chỗ DUY NHẤT biết về khác biệt OS
├── test-hooks.mjs           ★ 28 test cho hook — thứ gần như không ai làm
├── apply-to.mjs             áp template lên project khác
├── fixlog.mjs               ★ bước 1 vòng học, 3 giây/lần
├── coactivity.mjs           bậc 0 của ladder: ĐO, đừng đoán
├── harness-size.mjs         harness đang phình hay đang co?
├── capo-report.mjs          chi phí / kết quả được chấp nhận
├── check-reservations.mjs   pre-commit guard cho vùng nóng
├── check-feature-integrity.mjs  chỉ được đổi passes/evidence
├── wt-clean.mjs · statusline.mjs · precommit-scan.mjs
├── generators/              ★ chống boilerplate ở NGUỒN
├── knowledge/{lint,export,import}.mjs
└── lib/{harness,frontmatter}.mjs

features/                    default-FAIL, CHẺ THEO FEATURE (không một file chung)
docs/
├── ROADMAP-30D.md           ★ bảng đòn bẩy + làm gì tuần nào
├── CONFLICTS.md             ★ 5 loại conflict + Coordination Ladder
├── BRANCH-PROTECTION.md     ★ merge queue — việc ROI cao nhất
├── ANTI-PATTERNS.md         ★ tra cứu khi có gì đó sai mà chưa gọi tên được
├── ARCHITECTURE.md          6 tầng · ports/adapters · chống boilerplate
├── ECONOMICS.md             5 guardrail ngân sách · CAPO · model tiering
├── WIP.md                   công thức song song
├── RECOVERY.md              checkpoint · context reset vs compaction
├── TEAM.md                  DRI · nhịp ngày · khối review chung
├── MULTI-PROJECT.md         4 tầng cấu hình · phân phối · portfolio
├── DOR-DOD.md · onboarding.md · DESIGN.md
└── adr/ · progress/<issue>.md · specs/ · rubrics/ · runbooks/
evals/                       gate cho chính harness
reservations/                advisory lock có TTL
.github/                     CODEOWNERS · PR template · CI + parity matrix
.githooks/pre-commit         shim sh duy nhất — logic ở .mjs
```

`node tooling/apply-to.mjs --audit` kiểm mọi file đều được template mang đi
(chạy trong CI — chống lớp bug "thêm file, quên cập nhật danh sách").

---

## Nghi thức hàng ngày

```
/claim         bắt đầu — dựng worktree, KIỂM CHỒNG LẤN TRƯỚC, tạo nhật ký
/ship-feature  làm — contract → core+test → ports → api → ui → wiring → verify
/pre-merge     cổng cuối trước PR
/handoff       kết thúc sạch — evidence, nhật ký, dọn reservation

node tooling/fixlog.mjs "..."     mỗi lần phải sửa tay việc agent làm (3 giây)
node tooling/harness-doctor.mjs           kiểm sức khoẻ toàn bộ — một lệnh
```

## Vòng học — cái làm harness TỰ TỐT LÊN

```
1 CAPTURE   fixlog.mjs (3 giây/lần)  +  hook tự ghi gate-fails
     ↓
2 DISTILL   /harness-retro thứ Sáu — 2 người: một đề xuất, một phản biện
     ↓
3 GATE      evals/run.mjs — regression tụt thì KHÔNG promote
     ↓
4 PROMOTE   /knowledge-promote → knowledge/lessons/ (có scope + exit-condition)
     ↓
5 PRUNE     /entropy-sweep + entropy-scan.mjs — mỗi lần thêm phải xét một lần bỏ
     ↑
     └──────────────────────────────────────────────────────────────┘
```

Bước 3 không được bỏ. **Không có gate thì "cải thiện harness" chỉ là phình harness.**

Máy kiểm được phần nào: `entropy-scan.mjs` bắt rule thiếu `paths`/`owner`, tài liệu
quá hạn `last-verified`, bài học đã đạt điều kiện thoát, hook đăng ký mà **không có
test**, và harness đổi mà `whats-new.md` không đổi.

| Nhịp | Ai | Việc |
|---|---|---|
| hàng ngày | mọi người | `fixlog` khi sửa tay |
| hàng ngày | DRI | merge queue có nghẽn? PR nào treo >24h? |
| thứ Sáu | DRI + 1 người | `/harness-retro` — **một đề xuất, một phản biện** |
| 2 tuần | DRI | `/entropy-sweep` |
| đổi model | DRI | `node evals/run.mjs --bare` → deprecation review |

---

## Mang trí tuệ sang project khác

```bash
node tooling/knowledge/export.mjs                    # → .harness-pack/
node tooling/knowledge/import.mjs ../repo-cu/.harness-pack
```

Mỗi bài học có `scope`:

- `universal` — đúng ở mọi repo → **đi cùng bạn**
- `stack:<tên>` — đúng cho một stack → **đi cùng bạn nếu stack khớp**
- `project` — chỉ đúng ở đây → **ở lại**

Import **không bao giờ** tự ghi vào `.claude/` — nó đặt mọi thứ vào
`knowledge/incoming/` kèm checklist review. Một pack ghi thẳng vào cấu hình harness
là một đường supply-chain vào chính lớp kiểm soát của bạn.

Có ≥2 repo → tách `.harness-pack/` thành **repo trung tâm**, các repo pin theo
**tag/sha, không bao giờ `main`**.

---

## Mười hai điều nếu bạn chỉ nhớ được mười hai

1. **Cho agent một check nó tự chạy được.** Không có nó, mọi thứ khác là trang trí — vì **bạn** là verification loop.
2. **Có 5 loại conflict, không phải một.** Loại git bắt được là loại DỄ NHẤT. Loại tệ nhất là **ngữ nghĩa**; loại bị bỏ qua nhất là **harness**.
3. **Bật merge queue.** Cơ chế duy nhất bắt được conflict ngữ nghĩa một cách hệ thống. ROI cao nhất trong cả bộ này.
4. **Chỉ định một DRI.** Harness không có chủ sẽ mục trong ~6 tuần.
5. **Đừng chống conflict quá mức.** ~4/5 cặp PR song song **không** conflict. Leo ladder, dừng ở bậc đủ.
6. **Chuẩn hoá MỘT agent cho một repo.** Trộn vendor làm tỉ lệ conflict tăng ~gấp đôi.
7. **Hook viết bằng Node, không bash.** Nếu không, harness của team không tồn tại với người dùng Windows — và bạn sẽ không biết.
8. **`.gitattributes` với `eol=lf` + `core.ignorecase false`.** Năm dòng, làm hôm nay, xoá một lớp conflict giả.
9. **Mọi file nhiều người cùng ghi phải chẻ theo người hoặc theo issue.** Đây là kỹ thuật chống conflict rẻ nhất trong cả tài liệu.
10. **Mọi session rút từ cùng quota.** Mỗi người một seat. 2 session/người là điểm khởi đầu hợp lý.
11. **WIP ≤ năng lực review ≤ thông lượng merge queue.** Muốn nhanh hơn thì làm PR nhỏ hơn — **đừng thêm session**.
12. **Model không học. Hệ thống học — nếu có gate.** Và một harness đang tốt lên thường đang **nhỏ đi**.

> **Đừng cố hoàn hảo ngày 1.** Thêm một mảnh khi có tín hiệu thật.
> **Và bỏ một mảnh khi tín hiệu đó biến mất** — phần thứ hai khó hơn, và gần như không ai làm.
