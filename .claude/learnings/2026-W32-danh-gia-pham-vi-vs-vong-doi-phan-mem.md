# 2026-W32 — Harness phủ được gì của vòng đời phần mềm, và chỗ nó đang nói dối

> **ĐÁNH GIÁ, không phải bản sửa.** Đo trên đỉnh stack #1–#5 ngày 2026-08-04.
> Mọi khẳng định kèm lệnh tự kiểm. `[✓]` đọc trực tiếp từ repo · `[?]` chưa kiểm được.
>
> Câu hỏi được hỏi: *"harness đã đảm bảo ship sản phẩm tốt nhất chưa — UI/UX, đa nền
> tảng, quy trình, database, backend, boilerplate, best practice FE, testing, docker/CD,
> security, DR, migrate?"*

## §0 — Trả lời thẳng, ba câu

1. **Harness không thể đảm bảo chất lượng sản phẩm, và kỳ vọng đó là một lỗi phạm trù.**
   Nó là lớp **phối hợp + xác minh**: nó làm việc tệ **hiện ra**, không làm việc tệ
   **bất khả thi**. Thứ quyết định gu, chọn DB, ngưỡng perf là **quyết định của đội** —
   và `ANTI-PATTERNS.md` F5 của chính repo nói đừng globalize ngưỡng.
2. **Tầng ĐẠO LÝ rộng và tốt bất thường** (kiến trúc 6 tầng, ports/adapters, DoR/DoD,
   runbook giảm-thiểu-trước-chẩn-đoán, ma trận platform default-FAIL, spec có rollback).
3. **Tầng CƯỠNG CHẾ đang rỗng, và ở CI nó rỗng một cách XANH** — đó là phát hiện
   nghiêm trọng nhất, vì nó không phải thiếu sót, nó là một tuyên bố sai.

## §1 — Ba tầng, ba điểm

| Tầng | Là gì | Điểm | Vì sao |
|---|---|---|---|
| **Đạo lý** — quyết định một lần | `docs/ARCHITECTURE.md` · `DESIGN.md` · `DOR-DOD.md` · `specs/` · `runbooks/` · `ADR` | **4.5/5** | Đủ để một đội mới không phát minh lại. Thiếu duy nhất: doctrine chọn **công nghệ** DB (§4) |
| **Cưỡng chế** — gate nhị phân | `harness.config.json → commands` · `gates.mjs` · `ci.yml` | **1.5/5** | 10/10 `commands` rỗng `[✓]`. Ở template là placeholder ĐÚNG; ở CI là **xanh giả** (§3.1) |
| **Dụng cụ chất lượng sản phẩm** — a11y/perf/visual/coverage/SEO/SAST/SCA | — | **0.5/5** | Gần như không có, và một phần là **cố ý** (stack-agnostic), một phần là **thiếu slot** (§3.2) |

Ba tầng này độc lập. Điểm cao ở tầng 1 **không** bù được tầng 2 — vì tầng 1 là chữ, và
chữ không chặn được PR.

## §2 — Ma trận: 14 vùng vòng đời

`T` = thuộc template · `R` = thuộc repo tiêu thụ · `D` = là một quyết định (ADR), không phải cơ chế

| # | Vùng | Harness có gì `[✓]` | Dạng đúng | Tình trạng |
|---|---|---|---|---|
| 1 | **Kiến trúc** | 6 tầng, phụ thuộc đi XUỐNG · ports/adapters · public surface tường minh · CATALOG chống reinvent | D + gate `depcruise` | **Mạnh.** Gate rỗng |
| 2 | **Đa nền tảng** | `features/<id>.json` ma trận 6 platform, default-FAIL, `n/a` ≠ `true` · Parity Contract 3 OS + CI matrix | T | **Mạnh nhất trong bảng** |
| 3 | **Boilerplate / DRY** | `tooling/generators/` · schema là nguồn, code là dẫn xuất · `dedupe-scan` · `research-first` | T | **Đủ** |
| 4 | **Quy trình phát triển** | `/claim → ship-feature (10 bước) → /pre-merge → /handoff` · DoR/DoD · spec có rollback · progress append-only | T | **Mạnh** |
| 5 | **UI/UX & gu** | `DESIGN.md`: token là nguồn · quality floor · **§Vòng lặp verify quan trọng hơn cả skill thẩm mỹ** · `design-evaluator` + rubric | D + agent + **quy trình THẤY** | **3/4 mảnh.** Thiếu bước THẤY (§3.3) |
| 6 | **Frontend web/mobile/desktop** | `ship-feature` bước 5–7 có bảng verify theo platform, gồm hàng **a11y** và **perf** | R (stack) | Quy trình có, **lệnh không có** (§3.2) |
| 7 | **Backend / hiệu suất** | `perf` là tiêu chí trong `features/_TEMPLATE.json` | R + gate | **Đòi bằng chứng, không có chỗ sinh** (§3.2) |
| 8 | **Database** | schema-là-nguồn · `protect-migrations` (chỉ chặn migration ĐÃ MERGE) · migration forward-only | D + gate | Cơ chế **đủ**; **chọn công nghệ** thiếu doctrine (§4) |
| 9 | **Testing** | `test-hooks` 70 case cho chính harness · 4 phần bắt buộc của suite gác · mutant · TDD ở tầng 2 (`ship-feature` b2) | R (ngưỡng) + T (hình dạng) | **Test của HARNESS xuất sắc. Test của SẢN PHẨM: không slot coverage** |
| 10 | **UI test / E2E** | `ship-feature` b7 bắt buộc E2E thật, không chỉ unit+curl · AGENTS.md: *"bắt buộc E2E thật (browser/device)"* | R | `playwright` 0 file · `chrome` 0 file `[✓]` — **không cơ chế** |
| 11 | **CI/CD** | `ci.yml` + `harness-parity.yml`, **cả hai được `apply-to` mang sang repo tiêu thụ** `[✓]` | T (khung) + R (lệnh) | **Xanh giả** (§3.1). Không có phần **CD** nào |
| 12 | **Security** | AGENT: `block-secrets` · `dcg` · `protect-*` · deny rule · sandbox (ADR 0002) · `security-reviewer` phủ injection/authz/secret/deserialization/crypto | T (agent) + R (sản phẩm) | **Agent mạnh. Sản phẩm là stub** (§3.4) |
| 13 | **Deploy / DR / vận hành** | `runbooks/_TEMPLATE`: giảm thiểu NGAY **trước** chẩn đoán · leo thang · *"agent được phép làm gì"* · production chỉ người bấm | T (hình dạng) + R (nội dung) | Hình dạng **tốt**; `docker` 0 file · `SLO` 0 file · observability 1 file `[✓]` |
| 14 | **SEO / metadata** | không có gì | R | **ĐÚNG khi không có** (§4) — nhưng thiếu **slot khai** |

## §3 — Năm phát hiện, xếp theo mức nghiêm trọng

### 3.1 🔴 Tám check XANH chứng minh SỐ KHÔNG — và tài liệu dạy đặt chúng thành required

`ci.yml` `[✓]`:

```yaml
verify:   - run: echo "CHANGEME — điền lệnh từ harness.config.json → gates.preMerge"
e2e:      - run: echo "CHANGEME — E2E cho mọi platform trong scope"
security: - name: Quét secret
            run: echo "CHANGEME: gitleaks detect --no-git -v"
          # - name: SAST
          #   run: semgrep ci
```

Ba job này **luôn xanh**. `docs/BRANCH-PROTECTION.md` dạy đặt các check thành
`required` với `enforce_admins: true` — tôi đã làm đúng thế cho repo này ở PR #3. Ghép
hai thứ lại: **một repo tiêu thụ áp harness sẽ có 8 dấu tick xanh bảo vệ một cửa không
có ai đứng.** Đó không phải thiếu gate, đó là một **tuyên bố sai** — tệ hơn không có CI,
vì không có CI thì người ta biết là không có.

**Và cơ chế đúng ĐÃ TỒN TẠI, chỉ chưa được gọi.** `gates.mjs` fail-**đóng** khi phiên
không có người **và** gate bị bỏ qua — `unattended()` nhận `CI=1`, và `test-hooks` đã
chứng minh cả ba nhánh `[✓]`:

```
PASS gates.mjs  phiên CÓ người + gate bỏ qua → cảnh báo, KHÔNG chặn
PASS gates.mjs  phiên KHÔNG người + gate bỏ qua → FAIL ĐÓNG
PASS gates.mjs  cửa thoát chủ ý mở được ở phiên không người
```

Đổi `echo CHANGEME` thành `node tooling/gates.mjs --stage preMerge` là **một dòng**, và
nó biến 3 job xanh-giả thành 3 job **đỏ cho tới khi `commands` được điền** — đúng hành vi
mà `harness.config.json → $comment_gates` đã hứa. Đây là việc số 1.

Kiểm: `rg -n 'CHANGEME' .github/workflows/ci.yml`

### 3.2 🔴 Hợp đồng đòi bằng chứng mà cấu hình không có chỗ để sinh ra

Ba chỗ **đòi** `[✓]`:

- `features/_TEMPLATE.json`: `"a11y": { "passes": false, ... }` · `"perf": { "passes": false, ... }`
- `ship-feature` bước 7: bảng verify có hàng `a11y | audit ở viewport mobile VÀ desktop`
  và `perf | budget theo route`
- `AGENTS.md`: `evidence` bắt buộc khi `passes: true`

Chỗ **sinh ra**: không có. `commands` có 10 field, **không field nào** là `a11y`,
`perf`, `visual`, `coverage`, `seo`. `gates.preMerge` cũng không có tên gate nào cho chúng.

Hệ quả không phải lý thuyết: hai field đó **default-FAIL và không có đường nào thành
`true` một cách hợp pháp**. Người đang gấp sẽ điền `"n/a"` — và lúc đó họ học được rằng
field trong feature file điền cho xong được. Đó đúng là thói quen mà default-FAIL sinh
ra để diệt. **Một tiêu chí không có dụng cụ đo thì không phải tiêu chí, nó là một lời
nhắc — và lời nhắc bị bỏ qua bởi người đang gấp.**

Hai lối đi, phải chọn **một**, không được để lửng: thêm slot (`commands.a11y/perf/...` +
tên gate) **hoặc** xoá hai field khỏi `features/_TEMPLATE.json`.

Kiểm: `rg -n 'a11y|perf' harness.config.json features/_TEMPLATE.json`

### 3.3 🟠 Bước THẤY: đạo lý bắt buộc một artefact mà không cơ chế nào tạo ra

`docs/DESIGN.md:78` `[✓]` viết thẳng vòng lặp:

```
implement → chụp screenshot → so với thiết kế → LIỆT KÊ khác biệt → sửa
```

`AGENTS.md:64` xếp screenshot vào **bằng chứng hợp lệ**. `docs/rubrics/_TEMPLATE.md:34`:
*"Mỗi điểm phải kèm `file:dòng` hoặc screenshot. Điểm không có bằng chứng = không hợp lệ."*

Nhưng: `playwright` **0 file** · `chrome` **0 file** · không có thư mục `docs/evidence/`.
Nghĩa là `design-evaluator` đang chấm **mã nguồn**, không chấm **giao diện** — và ba tài
liệu trên đòi một artefact mà không có gì trong repo sản xuất được nó.

Đây là lý do **cài thêm skill thẩm mỹ không giải quyết gì**: thêm ý kiến vào một vòng
lặp không có mắt. `DESIGN.md §Vòng lặp verify quan trọng hơn cả skill thẩm mỹ` đã kết
luận đúng trước cả câu hỏi — nó chỉ chưa được thi hành.

Dạng đúng: **một skill quy trình** (`verify-ui`), không phải skill tri thức. Vì đây là
một **chuỗi hành động** (chạy app → chụp 2 viewport → lưu `docs/evidence/<issue>/` →
giao `design-evaluator`), và gate không biểu diễn được chuỗi.

### 3.4 🟠 An ninh: tầng AGENT mạnh, tầng SẢN PHẨM là stub

| | Có | Trạng thái |
|---|---|---|
| Agent | 5 hook (`block-secrets`, `dcg`, `protect-harness/tests/migrations/feature-files`) · `permissions.deny` · sandbox (ADR 0002) · `untrusted-input.md` | **Mạnh, có 70 test** |
| Sản phẩm | `security-reviewer` (agent, phán đoán) · `ci.yml → security` job | **SAST comment-out · secret scan là `echo` · SCA 0 · dependabot 0** `[✓]` |

`security-reviewer` phủ đúng các nhóm cần phủ (injection · IDOR/authz · secret trong
bundle · deserialization/SSRF/XXE/zip-slip · crypto sai). Nhưng nó là **inferential
control** — và AGENTS.md của chính repo đặt luật *"ưu tiên computational control trước
inferential control"*. Dependency có CVE là thứ **tất định**: `npm audit`/`osv-scanner`
trả lời được, không cần model đọc.

### 3.5 🟡 Không có phần CD, và không có SLO/observability

`docker` 0 file · `SLO` 0 file · observability 1 file `[✓]`. `runbooks/` có hình dạng
tốt cho **sự cố**, nhưng không có gì cho: build image · promote staging→prod (người bấm,
đã đúng) · rollback thao tác thật · smoke sau deploy · alert nối vào runbook nào.

Phần này **phần lớn thuộc repo tiêu thụ**, nhưng harness nên có **slot + runbook mẫu**,
vì `docs/runbooks/README.md §Nên có` đã liệt kê mà không ai điền được nếu không có khung.

## §4 — Vùng KHÔNG có gì, và đó là ĐÚNG

Ghi ra để không ai "sửa" nhầm:

| Vùng | Vì sao đúng khi không có |
|---|---|
| **SEO/metadata** | Metadata API của Next ≠ Nuxt ≠ Astro; app mobile/desktop không có SEO. Template stack-agnostic; `harness.config.json` là chỗ **duy nhất** được biết stack. Thuộc repo tiêu thụ — nhưng cần **slot khai** |
| **Best practice React/TS/Next** | Đây là tri thức stack, đổi theo phiên bản framework. Nhét vào template = ship một thứ hết hạn nhanh hơn template. Dạng đúng: `.claude/rules/react.md` **ở repo tiêu thụ**, có `paths` + `expires-review` |
| **Ngưỡng coverage cụ thể** | `ANTI-PATTERNS.md` F5: *"repo legacy và greenfield không cùng ngưỡng"*. Globalize ngưỡng ⇒ repo legacy fail liên tục ⇒ **mọi người tắt gate**. Globalize **cơ chế**, không globalize **ngưỡng** |
| **Chọn công nghệ DB** | Postgres vs Mongo vs Redis vs SQLite là **một quyết định**, không phải một luật. Dạng đúng: `docs/adr/NNNN-chon-database.md` — khung ADR đã có, nội dung là của đội |
| **Skill coding-convention mua ngoài** | Convention nằm ở bậc 3 của thang (`lint/hook`) trong `.claude/rules/README.md`. Đóng thành skill = đẩy lên bậc 6: đắt hơn, mục nhanh hơn, và **không xác định được** — lint fail thì đỏ, skill nói "nên" thì model đồng ý rồi vẫn làm khác |

## §5 — Thứ tự làm

| Đợt | Việc | Chi phí | Vì sao trước |
|---|---|---|---|
| **1** | `ci.yml`: 3 job `echo CHANGEME` → `node tooling/gates.mjs --stage <stage>` | **1 dòng × 3** | Biến 8 tick xanh-giả thành đỏ-thật. Dùng cơ chế đã có + đã test |
| **2** | Quyết §3.2: thêm slot `commands.{a11y,perf,visual,coverage,seo}` + tên gate, **hoặc** xoá 2 field khỏi `features/_TEMPLATE.json`. Không để lửng | 1 file (protected → `/harness-propose`) | Một tiêu chí không đo được dạy người ta điền cho xong |
| **3** | `verify-ui` — skill **quy trình**: chạy → chụp 2 viewport → `docs/evidence/<issue>/` → `design-evaluator` | 1 skill (trần ≤12, đang 12 → phải bỏ 1) | Vá bước THẤY. **Trước** mọi cuộc bàn về skill thẩm mỹ |
| **4** | `ci.yml → security`: bật SCA tất định (`npm audit`/`osv-scanner`) — rẻ hơn SAST và ít dương tính giả hơn | 1 dòng | Computational trước inferential |
| **5** | `docs/runbooks/` thêm 2 khuôn: **deploy-rollback** và **post-deploy-smoke** | 2 file docs | `§Nên có` đã đòi, không ai điền được nếu không có khung |

**Phanh:** đợt 3 làm trần skill vỡ (đang **12/12**). Theo luật của chính repo, thêm một
phải bỏ một — `/harness-retro` quyết, không phải tôi.

## §6 — Chưa kiểm được `[?]`

| Điều | Lệnh |
|---|---|
| `gates.mjs` có `--stage` nào ngoài stop/subagent/preMerge | `node tooling/gates.mjs --list` |
| Repo tiêu thụ có nhận `features/_TEMPLATE.json` không | `rg -n 'features/' tooling/apply-to.mjs` |
| `design-evaluator` có đọc được ảnh không (hay chỉ Read/Grep/Glob/Bash) | `rg -n 'tools' .claude/agents/design-evaluator.md` |
| Claude in Chrome dùng được trong phiên headless/CI không | thử `claude -p` với tool chrome |

## Điều kiện thoát của chính tài liệu này

Khi đợt 1 và 2 xong, **§1 tầng "Cưỡng chế" phải được chấm lại**. Nếu điểm không lên,
tài liệu này chẩn đoán sai và phải bị bác bỏ bằng số, không bằng tranh luận.
