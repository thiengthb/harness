# Nhiều project cùng lúc

Đây thật ra là **hai câu hỏi khác nhau**, và trộn chúng là nguồn gốc của phần lớn
thất bại:

```
(A) TÁI SỬ DỤNG harness NGANG QUA nhiều project   → bài toán phân phối & governance
(B) CHẠY agent trên nhiều project ĐỒNG THỜI       → bài toán tài nguyên & chú ý người
```

**(A) Có, và đây là nơi ROI cao nhất khi bạn có ≥3 repo** — chi phí xây một cơ chế
được chia cho N repo trong khi lợi ích nhân N.
**(B) Có, nhưng cổ chai không phải máy tính hay tiền — cổ chai là bạn.** → [WIP.md](WIP.md)

---

## (A) Bốn tầng cấu hình — cái gì đặt ở đâu

Đặt sai tầng là lỗi phổ biến nhất khi scale ra nhiều repo.

| Tầng | Nơi | Đặt gì | KHÔNG đặt gì | Ai sở hữu |
|---|---|---|---|---|
| **1. ORG** | managed settings, marketplace riêng, MCP allowlist | chính sách bảo mật · MCP được duyệt · version range · spend limit · plugin bắt buộc | bất cứ thứ gì đặc thù stack | admin |
| **2. USER** | `~/.claude/` | sở thích cá nhân · statusline · alias · skill cá nhân | rule nghiệp vụ · MCP của project · secret | bạn |
| **3. PROJECT** | `<repo>/.claude/`, `AGENTS.md`, `harness.config.json`, `.mcp.json` | gotcha repo · rule theo path · MCP của repo · hook gate · features | thứ giống nhau ở mọi repo (→ tầng 1) | DRI / team |
| **4. PROJECT-LOCAL** | `<repo>/.claude/settings.local.json` | `sparsePaths` cá nhân · `DEV_ID` · allow cá nhân | bất cứ thứ gì team cần giống nhau | mỗi người |

### Test đặt đúng tầng — một câu hỏi

> **"Nếu tôi xoá repo này, mục này còn giá trị không?"**
> Còn → tầng 1 hoặc 2. Không → tầng 3.

### Nguyên tắc vàng chống conflict harness

> Mọi thứ **bắt buộc phải giống nhau** giữa các thành viên → **tầng 3**, có CODEOWNERS.
> Mọi thứ **được phép khác nhau** → **tầng 4** hoặc tầng 2, và phải *nói rõ là được phép khác*.
>
> Conflict harness xảy ra khi một thứ đáng lẽ ở tầng 4 lại bị đặt vào tầng 3.

---

## Phân phối: cái gì globalize được

| Globalize được (cơ chế) | KHÔNG globalize (đặc thù) |
|---|---|
| hook `dcg`, `block-secrets`, `protect-harness` | `harness.config.json` (lệnh, vùng nóng) |
| skill quy trình: `claim`, `handoff`, `pre-merge`, `harness-retro` | `AGENTS.md §Gotchas` |
| `tooling/lib/`, `test-hooks.mjs`, `knowledge/` | `features/*.json` (trạng thái sản phẩm) |
| `.gitattributes`, PR template, CODEOWNERS pattern | `.mcp.json` (tool ăn context mỗi request) |
| bài học `scope: universal` / `stack:*` | bài học `scope: project` |

> **Globalize CƠ CHẾ, đừng globalize NGƯỠNG.**
> Repo legacy và repo greenfield không cùng ngưỡng coverage/dedupe. Globalize ngưỡng
> sẽ dẫn tới việc mọi người **tắt gate** — và bạn mất luôn cơ chế.

## Hai đường phân phối

**Đường 1 — `apply-to.mjs` (đơn giản, đủ cho 2–5 repo):**

```bash
node tooling/apply-to.mjs /đường/dẫn/project --apply            # lần đầu
node tooling/apply-to.mjs /đường/dẫn/project --apply --update   # cập nhật lớp cơ chế
```

`--update` chỉ ghi đè file **thuần cơ chế** (hook, tooling, lib), không đụng nội dung
của project (`AGENTS.md`, `harness.config.json`, `features/`, `knowledge/lessons/`).

**Đường 2 — repo harness trung tâm (từ ~5 repo trở lên):**

```
your-org-harness/          ← một repo, là nguồn phân phối
├── .harness-pack/         ← export từ repo học được nhiều nhất
└── tooling/, .claude/     ← lớp cơ chế
```

Bốn chi tiết quyết định thành/bại:

1. **Pin theo TAG hoặc SHA, không bao giờ theo `main`.** Một commit sai ở `main`
   làm hỏng **đồng thời** mọi repo của bạn.
2. **Có repo canary.** Một repo ít quan trọng pin `main`, chạy eval set của nó,
   rồi mới gắn tag cho các repo khác.
3. **Seed cho môi trường air-gapped/CI.** Nướng vào image ở build time; nếu không,
   container CI không có harness và hành vi agent khác hẳn local.
4. **Không có binary signing.** Hook và skill chạy **với đầy quyền của bạn**.
   Kiểm soát thật nằm ở allowlist + review nguồn, không phải ở scanning.

**Sai lầm phổ biến:** dùng một private repo chứa `skills/` rồi bảo mọi người clone.
Cách này bỏ qua lớp governance: không pin version, không cưỡng chế được ở tầng org,
không có cơ chế update sạch. Chạy được với 5 người, vỡ ở 50.

## Rollout an toàn

```
main của repo harness  →  canary repo (1 repo ít quan trọng, pin main)
                       →  chạy eval set của repo đó
                       →  CI parity 3 OS xanh
                       →  gắn tag v1.x
                       →  các repo khác pin tag, nâng theo lịch
```

Nghe nặng, nhưng đây **chính xác** là quy trình bạn dùng cho một thư viện dùng chung —
và harness **là** một thư viện dùng chung, chỉ khác là nó dùng chung cho các agent.

---

## (B) Bảng portfolio — cập nhật thứ Sáu

Khi có ≥3 project, bạn cần một góc nhìn portfolio:

| Project | Hạng 1–4 đủ chưa? | Eval set | CAPO tuần | Sửa tay | Kích thước harness | Trạng thái |
|---|---|---|---|---|---|---|
| app-a | ✓✓✓✓ | 15 task | … | 3 | 180 dòng | active |
| app-b | ✓✓✗✗ | chưa | … | 11 | 420 dòng | active → **cần cắt** |
| app-c | ✓✓✓✓ | chưa | – | – | 60 dòng | maintenance |

Ba tín hiệu đọc từ bảng:

- **Sửa tay cao + harness lớn** → harness phình mà không giải quyết vấn đề thật
- **Chưa đủ hạng 1–4 mà đang active** → **hạ xuống maintenance** cho tới khi đủ.
  Chạy agent tự trị trong repo chưa có gate là cách nhanh nhất để tạo một đống code
  không ai dám chạm
- **CAPO tăng ở mọi project cùng lúc** → thường do một thay đổi ở tầng ORG → rollback tag

## Ba luật vận hành

```
LUẬT 1 — MỖI PROJECT PHẢI TỰ CÓ GATE.
  Chạy song song chỉ an toàn khi CI là người gác cổng, không phải bạn.

LUẬT 2 — MỖI PROJECT PHẢI CÓ BUDGET CAP RIÊNG.
  Không có cap thì một project vô tình đốt hết ngân sách cả tháng.

LUẬT 3 — THÔNG BÁO PHẢI ĐỊNH TUYẾN, KHÔNG PHẢI POLLING.
  Agent chủ động báo khi cần người. Nếu bạn phải "ghé xem" thì bạn chưa scale được.
```

## Quy tắc portfolio

Khi bạn học được điều gì ở project A, câu hỏi tiếp theo **bắt buộc** là:
*"cái này thuộc tầng nào?"*

Tầng 1 hoặc `scope: universal` → đưa vào pack **ngay**, đừng chờ.

Đây là chỗ mà nhiều project trở thành **lợi thế** thay vì gánh nặng:
**mỗi bài học được khuếch đại N lần.**
