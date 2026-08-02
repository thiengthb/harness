---
issue: ABC-000
owner: "@___"
last-verified: YYYY-MM-DD
platforms: [core, web, api]
---

# <tên feature>

> **Trước khi viết spec này, hỏi: viết được 8 test case fail thay vào đó không?**
> Nếu được, **làm cái đó** — một test suite chạy được là spec tốt hơn ba trang văn xuôi,
> vì agent verify được nó.
>
> Thứ tự chất lượng reference:
> `test suite > code thật để port > contract/schema > HTML mockup > rubric > screenshot > văn xuôi`
>
> File này chỉ nên tồn tại cho phần **không** biểu diễn được bằng các dạng trên.

## Mục đích

Một câu. Người dùng làm được gì mà trước đó không làm được.

## NGOÀI scope

<!-- Mục này quan trọng ngang mục trên. Không có nó, agent sẽ mở rộng scope
     một cách hợp lý-nghe-được và bạn sẽ có một PR chạm 8 module. -->

- ...

## Acceptance criteria — VERIFY ĐƯỢC BẰNG MÁY

<!-- Không phải "hoạt động tốt". Mỗi dòng phải map được sang một assertion. -->

- [ ] Given ... / When ... / Then ...
- [ ] Given ... / When ... / Then ...

## Contract

Schema / interface / endpoint bị chạm: `...`
Đổi public surface? → nếu có, **liệt kê consumer** và sửa **cùng PR**.

## File dự kiến chạm

<!-- Để phát hiện chồng lấn TRƯỚC khi bắt đầu — xem /claim bước 3. -->

- ...

## Bước verify E2E

<!-- Đây là mục kết thúc spec. Chép thẳng sang `steps` trong features/<id>.json. -->

1. ...
2. ...
3. Tải lại / khởi động lại — xác nhận trạng thái còn (persist)

## Rủi ro & rollback

- Rủi ro chính:
- Cách rollback:
- Có feature flag không?
