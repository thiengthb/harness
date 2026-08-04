---
name: research-first
description: Trước khi implement một capability không tầm thường, tìm giải pháp đã
  có (thư viện, OSS, SaaS, code trong chính repo) thay vì tự viết. Dùng khi bắt đầu
  feature mới, khi cần capability chưa có trong repo, hoặc khi ước lượng > 200 dòng code.
allowed-tools: [Read, Grep, Glob, Bash, WebSearch, WebFetch]
disallowed-tools: Write Edit
---

# Research-first: tìm trước khi xây

## Bước 0 — Tìm TRONG repo trước

Trước khi tìm ra ngoài, tìm trong nhà:

```
rg -n "<khái niệm>" --type-add 'src:*.{ts,tsx,js,py,go,kt,swift}' -t src
```

- Đọc public surface của các package dùng chung (`index.*`, `CATALOG.md` nếu có)
- Xem issue tracker: có ai đang làm rồi không?

**Nếu đã có: MỞ RỘNG cái có sẵn, không tạo cái mới song song.**
Đây là nguồn trùng lặp số 1 trong repo có agent.

## Bước 1 — Khảo sát bên ngoài

Giao cho subagent `researcher` để **không làm bẩn context chính** — đây là ca kinh
điển của "đọc nhiều, kết luận ít".

- Docs chính thức của các lib ứng viên (dùng nguồn cập nhật, không dựa vào trí nhớ model)
- Code search: ai đã giải quyết vấn đề này
- Registry: download trend, last publish, open issue nghiêm trọng
- Bài so sánh, post-mortem

## Bước 2 — Bảng chấm điểm (bắt buộc)

| Ứng viên | License | Last release | Maintainers | Mức dùng | Issue nghiêm trọng | Kích thước | Effort tích hợp | Rủi ro |
|---|---|---|---|---|---|---|---|---|

## Bước 3 — Cây quyết định

1. Có lib/SaaS đúng chuẩn, license OK, maintain tốt → **DÙNG**
2. Gần đúng, cần chỉnh → **DÙNG + adapter layer.** Không fork nếu tránh được
3. Cần fork/vendor → theo quy trình vendoring bên dưới
4. Không có gì hợp → mới tự viết, **và GHI ADR nói rõ lý do**

## Bước 4 — KHÔNG BAO GIỜ tự viết

- Crypto / hashing / mã hoá
- Authentication / session / OAuth / SSO
- Payment / bất cứ thứ gì chạm PCI
- Date-time & timezone math
- Parser (URL, email, HTML, CSV, markdown)
- Rate limiter phân tán, distributed lock
- PDF / office render
- i18n plural rules

Với các mục này, quyết định "tự viết" **phải có người duyệt**.

## Quy trình vendoring

1. Kiểm license (MIT/Apache-2/BSD OK; GPL/AGPL phải hỏi người; **không license = KHÔNG DÙNG**)
2. Copy vào `vendor/<tên>/` kèm `ORIGIN.md`: URL nguồn, commit SHA, ngày, license,
   **lý do fork**, **danh sách thay đổi**
3. Commit bản **GỐC trước** (commit riêng), rồi commit thay đổi sau
   → mọi diff của bạn so với upstream đều nhìn thấy được
4. Chạy scan bảo mật + supply chain trên code vendor
5. Tạo issue định kỳ "theo dõi upstream `<tên>`"

## Đầu ra bắt buộc

Một block ngắn trong spec hoặc ADR:

- Các lựa chọn đã xét
- Lựa chọn cuối + lý do
- Effort ước lượng: tích hợp vs tự viết
- Rủi ro & **kế hoạch thoát** nếu lib bị bỏ rơi
