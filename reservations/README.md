# reservations/ — advisory lock có TTL

**Bậc 2** của Coordination Ladder. Chỉ dùng cho **vùng nóng**
(`harness.config.json → paths.hot`), không dùng cho mọi file.

## Khuôn

`reservations/<DEV_ID>-<issue>.json`:

```json
{
  "owner": "lan",
  "session": "lan-billing-2",
  "files": [
    "packages/contracts/src/billing.ts",
    "packages/core/src/features/billing/**"
  ],
  "reason": "thêm InvoiceDraft schema",
  "expires": "2026-08-03T16:00:00+07:00"
}
```

## Vì sao TTL là chi tiết quyết định

Nếu agent/người crash, reservation **tự hết hạn** và người khác đi tiếp được,
không cần ai dọn tay.

**Hard lock từ một agent đã chết thì cần người dọn.** Advisory lock có TTL thì
suy giảm nhẹ nhàng. Đây là khác biệt giữa một cơ chế sống được và một cơ chế
mà sau hai tuần mọi người bỏ qua.

TTL mặc định: `harness.config.json → limits.reservationTtlHours`.

## Quy trình 5 bước

```
1. pull main mới nhất
2. ghi reservation (files + TTL)
3. sửa + test
4. commit và push NGAY        ← commit nhỏ co cửa sổ conflict
5. XOÁ reservation
```

Bước 5 hay bị quên. Reservation hết hạn không chặn ai, nhưng nó làm nhiễu —
`/handoff` nhắc bạn xoá.

## Cưỡng chế

`.githooks/pre-commit` → `tooling/check-reservations.mjs` **từ chối commit** nếu
bạn chạm file người khác đã đặt chỗ. Bật bằng `node tooling/init.mjs`.

Khẩn cấp: `git commit --no-verify` — và ghi lý do vào PR.

## So với "labels as locks"

| | reservations/ | label trên issue |
|---|---|---|
| Ai thấy | agent + pre-commit hook | **người**, trên issue tracker |
| Tạo commit | có | không |
| Cưỡng chế | pre-commit | CI workflow |

Dùng cả hai được, nhưng **chọn một làm nguồn sự thật**. Repo này chọn
`reservations/` vì nó cưỡng chế được ở tầng agent.

`labels-as-locks` (một label `lock:contracts`, chỉ một issue được giữ tại một
thời điểm) là biến thể nhẹ nhất của bậc 2–3: chỉ **một vùng** bị serialize,
phần còn lại song song bình thường.
