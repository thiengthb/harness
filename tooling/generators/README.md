# tooling/generators/

> **Đòn bẩy lớn nhất chống boilerplate — và nó không phải là công cụ dedupe.**

## Vì sao generator quan trọng hơn detector

```
detector  bắt trùng lặp SAU KHI nó tồn tại
generator NGĂN nó tồn tại
```

Nhưng lợi ích thứ hai mới là lợi ích harness, và nó không hiển nhiên:

> Generator biến một task **sáng tạo** ("viết CRUD cho Product" — agent gõ 200 dòng
> na ná, mỗi lần lệch một chút) thành một task **mechanical**
> ("chạy `gen:resource Product`").
>
> Nghĩa là: **model rẻ hơn làm được, và verify tất định hơn.**

Generator do bạn viết một lần → đúng convention 100% → zero drift.

## Golden path

Đội tốt nhất **không** cho agent (hay người) tự do vô hạn. Họ định nghĩa **một cách
chuẩn** để làm mỗi việc lặp lại, và đóng gói thành generator + skill.
Tự do chỉ dành cho phần **thực sự mới**.

## Nên có generator cho

| Việc | Vì sao |
|---|---|
| feature slice mới | ép đúng cấu trúc vertical slice ngay từ đầu |
| endpoint mới | route mỏng + contract + test + client, một lệnh |
| màn hình mới | wiring + navigation + test đúng convention |
| migration mới | template có sẵn chỗ ghi rollback plan |
| package mới | config, tsconfig/pyproject, test setup, public surface |
| ADR mới | đánh số tự động, khuôn có sẵn mục "phương án đã loại" |

## Ba tính chất bắt buộc

1. **Idempotent** — chạy 2 lần cho cùng kết quả. Agent retry là chuyện thường;
   generator không idempotent sẽ tạo file rác ở lần thứ hai.
2. **Fail rõ ràng** — đã tồn tại thì báo và dừng, đừng ghi đè im lặng.
3. **Error message nói CÁCH SỬA**, không chỉ nói SAI.

## Nối vào harness

```jsonc
// harness.config.json
"commands": {
  "gen": "<lệnh chạy toàn bộ codegen + generator>"
}
```

`gen` nằm trong `gates.stop` dưới dạng `gen-clean`: chạy `gen` rồi kiểm `git diff`
rỗng. Đây là cách rẻ nhất để cưỡng chế "sửa nguồn, không sửa file generated" —
nó bắt được lỗi mà mọi review bằng mắt sẽ bỏ qua.

## Cạm bẫy

- **Generator sinh code rồi người sửa tay** → drift quay lại. Output của generator
  phải hoặc là *file bạn sở hữu và tiếp tục sửa* (scaffold), hoặc là *file generated
  read-only* (codegen). **Đừng lẫn hai loại** — và nếu là loại hai, thêm nó vào
  `harness.config.json → paths.generated` để hook chặn agent sửa.
- **Generator quá thông minh** → không ai hiểu output. Scaffold nên đọc như code
  người viết.
