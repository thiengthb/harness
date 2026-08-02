---
name: dedupe-scan
description: Quét code trùng lặp và đề xuất refactor. Dùng trước khi tạo module mới,
  sau khi implement feature lớn, hoặc khi review nợ kỹ thuật.
allowed-tools: [Bash, Read, Edit, Grep, Glob]
---

# Dedupe scan

> **Chống boilerplate ở NGUỒN quan trọng hơn dọn dẹp.** Skill này là **lưới an toàn
> cuối**, không phải chiến lược chính. Thứ tự đúng:
>
> ```
> 1 GENERATOR  →  2 CODEGEN từ schema  →  3 design system  →  4 package chung  →  5 dedupe-scan
> ```
>
> Detector bắt trùng lặp **sau khi** nó tồn tại; generator **ngăn nó tồn tại**.
> Xem `docs/ARCHITECTURE.md §Chống boilerplate ở nguồn`.

## Bước 0 — Tìm trước khi tạo

Chạy **trước** khi viết module mới, không phải sau:

```
rg -n "<khái niệm>" --glob '!**/node_modules/**' --glob '!**/*.gen.*'
```

Đọc `CATALOG.md` (nếu repo có) — một file rẻ, thay cho grep cả repo (đắt).

**Đã có → MỞ RỘNG cái có sẵn, không tạo cái mới song song.**
Đây là nguồn trùng lặp số 1 trong repo có agent.

## Bước 1 — Đo

Dùng detector của stack bạn (jscpd, PMD CPD, `similarity-ts`, SonarQube, Pylint R0801…).
Loại trừ: `node_modules`, `dist`, `*.gen.*`, `migrations`, `vendor`.

Ghi con số **baseline** trước khi sửa gì. Không có baseline thì không biết mình
đang tiến hay lùi.

## Bước 2 — Phân loại (agent PHẢI biết để không dedupe bậy)

| Type | Mô tả | Xử lý |
|---|---|---|
| 1 — Exact | giống hệt | extract ngay |
| 2 — Renamed | khác tên biến/type | extract + parameterize |
| 3 — Gapped | thêm/bớt vài dòng | cân nhắc Strategy / Template Method |
| 4 — Semantic | khác code, cùng logic | thường cần thiết kế lại |

## Bước 3 — Câu hỏi vàng, hỏi cho TỪNG cặp

> **"Hai chỗ này sẽ thay đổi CÙNG NHAU hay ĐỘC LẬP?"**

Độc lập → **GIỮ NGUYÊN**, và ghi lý do vào file.

DRY nói về **knowledge**, không phải **ký tự**. Ép chung hai domain tình cờ giống
nhau sẽ tạo abstraction sai — và **abstraction sai tệ hơn duplication**.

## KHÔNG dedupe những thứ này

- **Generated code** — generator sở hữu nó
- **Error handling per-route** — thường cố ý localize, sẽ phân kỳ
- **Test fixture** — trùng lặp trong test thường là *dễ đọc*, không phải nợ
- **Hai domain khác nhau tình cờ giống nhau**

## Bước 4 — Refactor, MỖI LẦN MỘT CẶP

| Tình huống | Cách |
|---|---|
| hàm giống hệt ở nhiều file | nâng lên tầng dùng chung (xem mô hình 6 tầng) |
| hàm gần giống | parameterize hoặc generic |
| config block lặp | tách file config chung |
| component UI lặp | nâng lên design system |
| boilerplate CRUD lặp | **viết generator** — đừng extract, hãy ngăn nó sinh ra |

Commit **từng refactor riêng**. Không big-bang: một refactor dedupe lớn không
revert được từng phần.

## Bước 5 — Verify

Chạy test. Chạy lại detector. **Duplication phải giảm VÀ test phải xanh.**
Chỉ một trong hai thì chưa xong.

## Cảnh báo: đừng để agent "dedupe theo điểm số"

Tối ưu một con số sẽ dẫn tới hack con số đó. Cơ chế chống:

- Mỗi clone **bị bỏ qua có chủ ý** phải ghi **lý do** vào file
- Số clone `wontfix` được **báo cáo riêng**, không được ẩn vào "đã giảm duplication"

Một report nói "duplication 12% → 4%" mà 6% là `wontfix` bị giấu thì tệ hơn không
có report.
