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
node /đường/dẫn/harness/tooling/apply-to.mjs /đường/dẫn/project-cua-ban

# 2. Trong project đó, điền MỘT file
$EDITOR harness.config.json      # project.id, dri, và commands.*

# 3. Bootstrap
node tooling/init.mjs

# 4. Điền AGENTS.md — chỉ 3 mục: Project · Lệnh · Gotchas
```

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
| Agent tự sửa harness của chính nó | hook chặn · agent ĐỀ XUẤT, người PROMOTE | `protect-harness.mjs`, `/harness-propose` |
| **Trí tuệ không mang đi được sang project khác** | **vòng học có gate + lesson có scope + export/import** | **`knowledge/`** |

---

## Cấu trúc

```
harness.config.json          ★ NGUỒN SỰ THẬT — chỗ DUY NHẤT biết về stack cụ thể
AGENTS.md                    ★ hợp đồng của team (~150 dòng, giữ ngắn)
CLAUDE.md                    → @AGENTS.md

.claude/
├── settings.json            harness của TEAM (commit, chỉ DRI sửa)
├── settings.local.example.json  van xả áp cá nhân (sparsePaths, statusline)
├── whats-new.md             thông báo đổi harness, hiện MỘT LẦN mỗi version
├── hooks/*.mjs              7 hook, Node thuần, chạy 3 OS
├── rules/                   rule theo `paths`, có owner + expires-review
├── skills/                  10 skill (giữ ≤12)
├── agents/                  evaluator · security-reviewer · researcher
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
├── check-reservations.mjs   pre-commit guard cho vùng nóng
├── check-feature-integrity.mjs  chỉ được đổi passes/evidence
├── wt-clean.mjs · statusline.mjs · precommit-scan.mjs
├── knowledge/{lint,export,import}.mjs
└── lib/{harness,frontmatter}.mjs

features/                    default-FAIL, CHẺ THEO FEATURE (không một file chung)
docs/
├── CONFLICTS.md             ★ 5 loại conflict + Coordination Ladder
├── WIP.md                   ★ công thức song song
├── BRANCH-PROTECTION.md     ★ merge queue — việc ROI cao nhất
├── DOR-DOD.md · onboarding.md
├── adr/ · progress/<issue>.md
evals/                       gate cho chính harness
reservations/                advisory lock có TTL
.github/                     CODEOWNERS · PR template · CI + parity matrix
.githooks/pre-commit         shim sh duy nhất — logic ở .mjs
```

---

## Nghi thức hàng ngày

```
/claim         bắt đầu — dựng worktree, KIỂM CHỒNG LẤN TRƯỚC, tạo nhật ký
/ship-feature  làm — contract → core+test → ports → api → ui → wiring → verify
/pre-merge     cổng cuối trước PR
/handoff       kết thúc sạch — evidence, nhật ký, dọn reservation

node tooling/fixlog.mjs "..."     mỗi lần phải sửa tay việc agent làm (3 giây)
```

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
