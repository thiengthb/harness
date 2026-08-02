---
last-verified: 2026-08-03
tokens: CHANGEME/đường/dẫn/tới/tokens
type_scale: [12, 14, 16, 20, 24, 32, 48]
spacing_unit: 4
radius: { sm: 4, md: 8, lg: 16, full: 9999 }
motion: { duration_fast: 120, duration_base: 200, easing: "cubic-bezier(.2,.8,.2,1)" }
---

# DESIGN.md — hợp đồng thiết kế

> Đây là **reference máy đọc được**, không phải moodboard.
> `design-evaluator` đối chiếu diff với file này. Nếu một quy tắc không nằm ở đây,
> nó không tồn tại.

## Nguyên tắc

- **Signature element**: CHANGEME — mô tả **chính xác một thứ** đáng nhớ của sản phẩm này.
- Mọi thứ quanh nó **im lặng và kỷ luật**. Dồn sự táo bạo vào **một chỗ**.
- Cắt bỏ mọi trang trí không phục vụ mục đích. *Trước khi ra khỏi nhà, nhìn gương và bỏ bớt một phụ kiện.*

## Quality floor — không thương lượng

Đây là **điều kiện pass**, không phải điểm cộng:

- [ ] Responsive tới 360px
- [ ] Focus keyboard **nhìn thấy được** ở mọi phần tử tương tác
- [ ] Tôn trọng `prefers-reduced-motion`
- [ ] Contrast đạt AA
- [ ] Mọi state có thiết kế: empty · loading · error · text dài tràn · số 0 · số rất lớn

## Cấm

- Màu / spacing / radius không có trong token
- Hơn 2 font family
- Gradient trang trí không phục vụ hierarchy
- `alert()` / `confirm()` **native** — agent không nhìn thấy chúng qua browser
  automation, nên feature dựa vào chúng hay lỗi âm thầm. Dùng component modal của bạn.

## Token là nguồn sự thật

```
token  ──▶ CSS variables / theme
       ──▶ preset của framework style
       ──▶ theme cho platform native
       ──▶ biến trong design tool
```

**0 mã màu cứng ngoài token.** Cưỡng chế bằng lint/grep rule, không bằng lời:

```bash
# Ví dụ — thêm vào commands.lint hoặc một script riêng
rg -n '#[0-9a-fA-F]{3,8}\b' --glob '!**/tokens/**' --glob '!**/*.gen.*' src \
  && echo "Màu cứng ngoài token. Dùng token." && exit 1 || exit 0
```

Đây là ví dụ hoàn hảo cho nguyên lý **computational control**: một "yêu cầu thẩm mỹ"
biến thành một check tất định. Dark mode và rebrand sau này gần như miễn phí.

## Thứ tự chất lượng của reference

Khi giao thiết kế cho agent, dùng dạng cao nhất khả thi:

```
1 HTML mockup chạy được   ← tốt nhất, agent verify được
2 code thật ở nơi khác để port
3 design token / spec máy đọc được
4 rubric có tiêu chí + điểm    (cho thứ chủ quan — xem docs/rubrics/)
5 screenshot                    (mất thông tin cấu trúc)
6 văn xuôi mô tả                ← tệ nhất
```

## Vòng lặp verify — quan trọng hơn cả skill thẩm mỹ

> **Agent không sửa được cái nó không nhìn thấy.**

```
implement → chụp screenshot → so với thiết kế → LIỆT KÊ khác biệt → sửa
```

Bắt agent **liệt kê** khác biệt thành danh sách trước khi sửa. Không có bước liệt kê,
nó sẽ sửa một thứ và tuyên bố xong.
