# Cấu trúc code phục vụ cả agent lẫn người

> **Agent điều hướng bằng TÊN và RANH GIỚI, không bằng trực giác.**
> Cấu trúc tốt cho agent = cấu trúc tốt cho người mới vào, nhưng **khắt khe hơn**.

Tài liệu này **stack-agnostic**. Nó mô tả mô hình phụ thuộc, không mô tả framework.

---

## Sáu quy tắc

### 1. Feature-first / vertical slice, không layer-first

```
✗ Layer-first — agent phải mở 6 thư mục để hiểu 1 feature
  controllers/  services/  repositories/  models/  dtos/

✓ Vertical slice — 1 feature = 1 thư mục = 1 ĐƠN VỊ CONTEXT
  features/billing/
  ├── AGENTS.md        invariant nghiệp vụ của ĐÚNG feature này (~15 dòng)
  ├── api.*            route/handler
  ├── service.*        business logic
  ├── repository.*     data access
  ├── schema.*         nguồn sự thật của type
  ├── billing.test.*
  └── index.*          PUBLIC SURFACE DUY NHẤT
```

Agent chỉ cần đọc **một thư mục** là đủ context cho một task.

### 2. Public surface tường minh

Mỗi module chỉ export qua một điểm vào. Cưỡng chế bằng lint rule
(`no-restricted-imports`, `import-linter`, ArchUnit…). Agent **không thể vươn tay**
vào ruột module khác.

### 3. Ranh giới cưỡng chế bằng MÁY, không bằng lời

Lời trong AGENTS.md là *lời đề nghị*. Một dep-rule fail CI là *sự cưỡng chế*.

```
features không được import lẫn nhau
core không được import platform
apps không được import lẫn nhau
không phụ thuộc vòng
```

Khai lệnh kiểm ở `harness.config.json → commands.depcruise`.

### 4. Schema là nguồn sự thật, code là dẫn xuất

```
schema  ──▶ type            (codegen)
        ──▶ validation      (chính schema đó)
        ──▶ API client      (codegen)
        ──▶ DB migration    (codegen)
        ──▶ fixture/mock    (codegen)
        ──▶ analytics event (định nghĩa event Ở ĐÂY → type-safe telemetry miễn phí,
                             và agent không đặt tên event tuỳ ý)
```

**Agent sửa MỘT chỗ.** Đây là đòn bẩy chống drift mạnh nhất, và là lý do
`gen-clean` là gate đầu tiên trong `gates.stop`.

### 5. Đặt tên tìm được bằng grep

`createInvoiceDraft` tốt hơn `handle`. Tên unique = agent grep một lần ra đúng chỗ.

### 6. Colocation

Test, story, doc nằm cạnh code. Agent sửa code thấy ngay test phải sửa.

---

## Mô hình 6 tầng — phụ thuộc chỉ đi XUỐNG

Nếu bạn chỉ nhớ một hình trong tài liệu này, nhớ hình này:

```
┌───────────────────────────────────────────────────────────────────────────┐
│ TẦNG 5 — APPS          web · mobile · desktop · api · admin              │
│ CHỈ tầng này biết platform. CHỈ tầng này wiring/DI. KHÔNG import lẫn nhau.│
├───────────────────────────────────────────────────────────────────────────┤
│ TẦNG 4 — ADAPTERS      hiện thực các PORT bằng công nghệ platform cụ thể  │
│ Thay được, bỏ được.                                                       │
├───────────────────────────────────────────────────────────────────────────┤
│ TẦNG 3 — PRESENTATION  component. Phụ thuộc token + core.                │
│ KHÔNG chứa business logic.                                                │
├───────────────────────────────────────────────────────────────────────────┤
│ TẦNG 2 — CORE          business logic THUẦN                              │
│ Phụ thuộc contracts + ports. KHÔNG framework, KHÔNG I/O trực tiếp.        │
│ Chạy được mọi nơi, kể cả trong test thuần.                                │
├───────────────────────────────────────────────────────────────────────────┤
│ TẦNG 1 — CONTRACTS     schema · type · PORTS (interface) · design token   │
│ Nguồn sự thật. Không phụ thuộc gì.                                        │
├───────────────────────────────────────────────────────────────────────────┤
│ TẦNG 0 — TOOLING       config · testing · generator · script             │
│ Không ai trong runtime phụ thuộc. Chỉ dev-time.                           │
└───────────────────────────────────────────────────────────────────────────┘

LUẬT: import chỉ đi TỪ TẦNG CAO → TẦNG THẤP.
      Không đi lên. Không đi ngang ở tầng 5. Không nhảy qua ports ở tầng 2.
```

---

## Ports & Adapters — mảnh làm tầng 2 THUẦN THẬT SỰ

**Vấn đề:** "core không phụ thuộc platform" là đúng nhưng **không đủ để dùng được**.
Ngay khi core cần lưu dữ liệu, gọi auth, hay gửi notification, nó *phải* chạm platform.
Không có ports (tầng 1) và adapters (tầng 4), `core` của bạn sẽ vỡ trong tuần thứ hai
và bạn sẽ âm thầm import thư viện platform vào core.

**Đó là cách 90% codebase "platform-agnostic" chết.**

```
TẦNG 1  ports/storage.*      interface SecureStorage { get, set, remove }
                             ↑ chỉ khai báo, không hiện thực
TẦNG 2  core/auth/service.*  nhận { storage, clock, http } qua tham số
                             ↑ thuần, testable, không mock framework
TẦNG 4  adapters-native/*    hiện thực SecureStorage bằng API của platform
TẦNG 5  apps/mobile/di.*     ĐIỂM DUY NHẤT trong repo mà platform gặp logic
```

### Bốn lợi ích, và cái thứ tư là lợi ích HARNESS

1. `core` chạy trên mọi platform, kể cả test thuần → **test nhanh, không cần simulator**
2. Thêm platform mới = thêm một `adapters-*`, **không sửa core**
3. Mock trong test = một object literal, không cần mock framework
4. **Agent chỉ cần đọc `ports/` (nhỏ) để biết `core` làm được gì** — thay vì đọc cả
   `core`. Đây là **context saving có cấu trúc**, không phải nén.

### Chi tiết dễ bỏ sót — lợi ích lớn nhất với agent

Vòng lặp verify ở tầng core mất **~2 giây**; trên simulator mất **~60 giây**.
Agent làm 30 vòng ở core rẻ hơn 3 vòng trên simulator, **và tìm ra bug logic sớm hơn**.

### Danh sách port tối thiểu

`SecureStorage` · `KeyValueStore` · `HttpClient` · `Clock` · `Auth` ·
`Notifications` · `Analytics` · `FileSystem` · `Navigation` · `Biometrics`

`Clock` là port hay bị bỏ qua nhất và giá trị nhất: nó làm mọi logic phụ thuộc
thời gian test được mà không cần mock global.

---

## CATALOG — chống reinvent bằng máy

Boilerplate và trùng lặp phần lớn đến từ **agent không biết thứ đó đã tồn tại**.

Tạo một file liệt kê mọi utility public kèm một dòng mô tả, **sinh tự động** từ
docstring:

```markdown
<!-- packages/core/CATALOG.md — SINH TỰ ĐỘNG, đừng sửa tay -->
| Export | Mô tả | File |
|---|---|---|
| createInvoiceDraft | Tạo invoice ở trạng thái draft, validate theo contract | features/billing/service.ts |
```

Agent đọc **một file rẻ** thay vì grep cả repo (đắt). Đưa lệnh sinh vào `commands.gen`.

---

## Ba luật tái sử dụng

```
1. Bất cứ thứ gì dùng ở ≥2 app  →  phải nâng lên tầng dùng chung
2. core CẤM import platform     →  cưỡng chế bằng lint, không bằng lời
3. apps CẤM import lẫn nhau     →  cưỡng chế bằng dep-rule
```

## Chống boilerplate ở NGUỒN — quan trọng hơn dọn dẹp

| Nguồn boilerplate | Cách diệt |
|---|---|
| DTO / type / validation lặp | codegen từ schema |
| CRUD endpoint lặp | generator + convention routing |
| Form lặp | schema-driven form |
| Component variant lặp | variant helper + design token |
| Test setup lặp | fixture/factory chung |
| Config lặp giữa package | package config dùng chung |
| Scaffolding file mới | **generator** — xem `tooling/generators/README.md` |

Phần *dọn dẹp* — cái còn lại sau khi đã chặn ở nguồn — là `/dedupe-scan`: nó tìm những chỗ
đã trùng rồi, và mỗi lần nó tìm ra một nhóm thì câu hỏi đúng là *"cái gì đáng lẽ phải là
generator ở bảng trên?"*, không phải *"gộp ba file này lại"*.

> **Đòn bẩy lớn nhất: cho agent một GENERATOR.**
> Thay vì "viết CRUD cho Product" (agent gõ 200 dòng na ná), bảo nó chạy
> `gen:resource Product`. Generator do bạn viết một lần, đúng convention 100%, zero drift.
>
> Lợi ích thứ hai không hiển nhiên: nó biến một task **sáng tạo** thành một task
> **mechanical** — nghĩa là bạn dùng được model rẻ hơn và verify tất định hơn.

## Khi nào KHÔNG dedupe

- **Generated code** — generator sở hữu nó
- **Error handling per-route** — thường cố ý localize, sẽ phân kỳ
- **Test fixture** — trùng lặp trong test thường là *dễ đọc*, không phải nợ
- **Hai domain khác nhau tình cờ giống nhau** — DRY nói về *knowledge*, không phải *ký tự*

Câu hỏi vàng: **"hai chỗ này sẽ đổi CÙNG NHAU hay ĐỘC LẬP?"**
Độc lập → giữ nguyên, và ghi lý do. Ép chung sẽ tạo abstraction sai, **tệ hơn duplication**.
