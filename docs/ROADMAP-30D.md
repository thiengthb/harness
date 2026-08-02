# Lộ trình 30 ngày

> **Đòn bẩy trong harness rất lệch: 3 việc đầu chiếm phần lớn kết quả.**
> Triển khai theo chiều ngang (mỗi phần một ít) cho bạn 40% giá trị với 100% chi phí.

## Bảng đòn bẩy — làm theo THỨ TỰ NÀY

| Hạng | Việc | ROI | Chi phí |
|---|---|---|---|
| 1 | **Một check agent tự chạy được** (`commands.verify` + Stop hook) | rất cao | thấp |
| 2 | **Cắt context**: AGENTS.md ≤150 dòng, xoá negative constraint thừa | rất cao | rất thấp |
| 3 | **Merge queue + branch protection** | rất cao | thấp |
| 4 | **`init.mjs` + nghi thức khởi động/kết thúc** | cao | thấp |
| 5 | Contract/schema là nguồn sự thật + codegen | cao | trung bình |
| 6 | Verification skill | cao | trung bình |
| 7 | 3–5 hook cưỡng chế cho luật **thật sự** nguy hiểm | cao | thấp |
| 8 | Ranh giới module cưỡng chế bằng máy | trung-cao | thấp |
| 9 | Eval 12–20 task cho chính harness | trung-cao | trung bình |
| 10 | Budget cap + CAPO | trung bình | thấp |
| 11 | Methodology framework | trung bình | cao |
| 12 | MCP thứ 4, 5 trở đi | thấp | trung bình |
| 13 | Agent teams / swarm | thấp–âm | rất cao |

> Chưa có hạng 1 và 2 thì cài framework + 8 MCP sẽ làm bạn **chậm hơn** là không cài gì.

---

## Tuần 1 — Nền móng chống conflict (DRI làm phần lớn)

**DRI:**

- [ ] Nhận vai chính thức. Thông báo cho team: ai quyết cái gì
- [ ] Điền `harness.config.json` → `project.id`, `dri`, và **`commands.*`** ← việc số 1
- [ ] `node tooling/init.mjs` chạy sạch trên máy bạn
- [ ] Commit `.gitattributes` (đã có sẵn)
- [ ] **Bật branch protection + merge queue** trên `main` → [BRANCH-PROTECTION.md](BRANCH-PROTECTION.md)
- [ ] Điền `.github/CODEOWNERS` bằng handle **thật** (handle sai = GitHub bỏ qua im lặng)
- [ ] `node tooling/coactivity.mjs` — biết mình **có** vấn đề conflict thật không

**Cả team:**

- [ ] Mỗi người một seat riêng. Xác nhận không ai dùng chung account
- [ ] Đọc `AGENTS.md` — **chỉ** AGENTS.md
- [ ] Bật alias `fixlog`

## Tuần 2 — Parity đa OS + hook cưỡng chế

**DRI:**

- [ ] `node tooling/test-hooks.mjs` xanh trên máy bạn
- [ ] Bật CI `harness-parity.yml`, xác nhận xanh trên **cả 3 OS**
- [ ] Bỏ `continue-on-error` khỏi job Bootstrap khi config đã đủ
- [ ] Pin toolchain (`.nvmrc` / `mise.toml` / `packageManager`)
- [ ] Điền `AGENTS.md §Gotchas` — 3–5 dòng **thật**, không phải thứ agent tự suy ra được

**Thành viên Windows:**

- [ ] Quyết WSL2 hay native → [onboarding.md](onboarding.md). Native thì 4 việc bắt buộc
- [ ] Chuyển repo ra khỏi OneDrive/Desktop và khỏi `/mnt/c`

## Tuần 3 — Quy trình & artifact

**DRI + 1 người:**

- [ ] Chuyển backlog thật vào `features/<id>.json` (default-FAIL)
- [ ] `docs/progress/` cho các issue đang chạy
- [ ] Chốt DoR/DoD → [DOR-DOD.md](DOR-DOD.md). **Thảo luận 30 phút rồi commit**
- [ ] Điền `.mcp.json` từ `.mcp.json.example` — **3–5 server, không hơn**
- [ ] 3 issue label `good-first-agent-task`

**Cả team:**

- [ ] Chạy thử `/claim` → `/ship-feature` → `/pre-merge` → `/handoff` trên một issue thật
- [ ] Thử **khối review chung** 15:00–16:00 trong một tuần rồi đánh giá

## Tuần 4 — Song song có kỷ luật + vòng học

**DRI:**

- [ ] Tính WIP limit bằng công thức ở [WIP.md](WIP.md). **Viết con số vào config**
- [ ] `worktree.sparsePaths` cá nhân cho từng domain
- [ ] `node tooling/wt-clean.mjs` mỗi sáng
- [ ] Reservation + pre-commit guard **chỉ cho vùng nóng** đã đo ở tuần 1
- [ ] Budget cap → [ECONOMICS.md](ECONOMICS.md). `node tooling/capo-report.mjs --usd <số>`
- [ ] `node tooling/harness-size.mjs --baseline`

**Cả team:**

- [ ] `/harness-retro` đầu tiên, có **2 người**: một đề xuất, một phản biện
- [ ] Bài học đầu tiên → `/knowledge-promote` → `knowledge/lessons/`

---

## Sau 30 ngày — nhịp duy trì

```
hàng ngày   fixlog khi phải sửa tay (3 giây)
hàng ngày   DRI: merge queue có nghẽn? PR nào treo >24h?
2 lần/tuần  review capacity check: PR đang mở / người review được
thứ Sáu     /harness-retro 30 phút — GỒM 1 đề xuất CẮT BỎ bắt buộc
2 tuần      /entropy-sweep + node tooling/harness-size.mjs
đổi model   node evals/run.mjs --bare  → deprecation review → cập nhật ADR
```

## Bảng theo dõi sức khoẻ (cập nhật thứ Sáu)

| Chỉ số | Đo bằng | Xu hướng tốt |
|---|---|---|
| PR chờ review trung bình | insights | ↓ (mục tiêu < 4 giờ trong giờ làm) |
| PR mở > 24h | `gh pr list` | ↓ (mục tiêu 0) |
| Tỉ lệ conflict trên PR | đếm | ↓ so baseline (~20% là bình thường) |
| **Lần main vỡ / tuần** | CI trên main | **0** — merge queue phải đảm bảo |
| Revert trong 7 ngày | `capo-report.mjs` | ↓ |
| Sửa tay toàn team / tuần | `fixlog --list` | ↓ |
| **Kích thước harness** | `harness-size.mjs` | **phẳng hoặc ↓** |
| CAPO | `capo-report.mjs --usd` | ↓ hoặc phẳng |
| Time-to-first-PR của người mới | đo người mới gần nhất | ↓ (mục tiêu < 1 ngày) |

---

## Nếu bạn chỉ có một ngày

```
1. Điền harness.config.json → commands.verify        (30 phút)
2. Bật merge queue + branch protection               (20 phút)
3. Cắt AGENTS.md xuống còn gotcha thuần              (40 phút)
4. node tooling/test-hooks.mjs — xác nhận hook chạy  (5 phút)
5. Bật alias fixlog                                   (2 phút)
```

Bốn việc đầu là hạng 1–3 của bảng đòn bẩy. Việc thứ năm là thứ rẻ nhất và giá trị
nhất trong toàn bộ vòng học — nó biến trực giác mơ hồ thành dữ liệu đếm được.
