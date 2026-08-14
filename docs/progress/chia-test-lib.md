# Tách test hàm thuần khỏi bộ test ship xuống consumer (v2.80.0)

issue: **KHÔNG CÓ** — Đợt 2 của kế hoạch cô đặc harness.
owner: @thiengthb · branch: `fix/chia-test-lib` · worktree: gốc repo · platforms: n/a

<!--
  Neo chống trôi:
    node tooling/test-hooks.mjs   → 231/231, sàn 231
    node tooling/test-lib.mjs     → 61/61,   sàn 61
    node tooling/apply-to.mjs --audit → exit 0
-->

## Kế hoạch nói "đừng ship test-hooks". Đo xong thì KHÔNG được làm thế.

Ý định ban đầu của ③ là bỏ `test-hooks.mjs` khỏi `MECHANISM_PATHS`. Đo bán kính ảnh hưởng:

```
.github/workflows/ci.yml         : node tooling/test-hooks.mjs      ← workflow này SHIP
evals/tasks/0005 0006 0007 0008  : node tooling/test-hooks.mjs      ← eval task SHIP
```

Bốn eval task đang ship khẳng định **suite đó chạy xanh**. Bỏ ship file ⇒ bộ eval của **mọi**
consumer đỏ ⇒ hỏng đúng cơ chế mang tri thức sang repo khác (`knowledge/lessons/` + `evals:`).

Nên bộ test ship **không phải sơ suất — nó là mối nối chịu lực**. Đảo hướng: **giữ tên, giữ
ship, chuyển RUỘT ra ngoài.**

## Ranh giới, và vì sao nó không tuỳ tiện

| | ai cần | đi đâu |
|---|---|---|
| hành vi của GÁC — hook chặn đúng chưa · gác hỏng có fail-đóng không · `dcg ↔ permissions.deny` | repo tiêu thụ: đó là bản sao **CỦA HỌ**, và họ **sửa được** `settings.json` | ở lại `test-hooks.mjs` |
| HÀM THUẦN của lib — `budgetStatus` · `parseFlags` · `stuckRituals` · `verdictLine` … | không ai ở phía consumer: `lib` đến từ template, CI template kiểm nó trên 3 OS | `test-lib.mjs`, **không ship** |

Tiêu chí một câu: **repo tiêu thụ có sửa được thứ mà ca này kiểm không?** Sửa được thì họ cần
ca đó. Không sửa được thì ca đó là thuế.

## Cách tách, và bằng chứng nó sạch

Không đọc 5 654 dòng. Dựng bản đồ 58 khối cấp cao (dòng bắt đầu · cỡ · nhãn đầu tiên), phân
loại theo nhãn, rồi cắt bằng script với ranh giới **dòng đúng `{` … dòng đúng `}`**.

> Phép đếm ngoặc cân bằng của bản đầu **sai**: nó đếm cả `{` trong chuỗi và regex, nên khối
> `infraFailure` "dài 238 dòng" thật ra nuốt cả khối kế bên. Bắt được vì script tự kiểm chồng
> lấn và dừng. Một script cắt file mà không tự kiểm chồng lấn là một script viết lại file.

Bằng chứng tách sạch, và nó là một con số chứ không phải lời hứa:

```
trước:  291 khẳng định
sau :   230 (test-hooks) + 61 (test-lib) = 291
```

## KHE GIỮA HAI SUITE — chỗ hỏng thật sự của bản vá này

Sàn tụt 291 → 230 **đúng bằng** phép chuyển. Nên nếu `test-lib.mjs` biến mất khỏi template:
sàn 230 **vẫn đạt**, suite **vẫn xanh**, và 61 ca kia không chạy ở đâu nữa. Đó chính là chế độ
hỏng mà cả hai cái sàn sinh ra để chặn — nó rơi vào **khe giữa** chúng, nơi không sàn nào nhìn.

Đóng khe: `test-hooks` có một ca (`repoRole() === 'template'`) khẳng định file kia **có mặt** và
**được khai `NOT_FOR_CONSUMER`**. Ca đó cũng là thứ làm điều kiện `if [ -f … ]` trong CI trở
thành an toàn thay vì một cửa thoát im lặng — ở template file luôn có, ở consumer vắng mặt là
đúng thiết kế.

## BẰNG CHỨNG

`test-hooks` **231/231 · sàn 231** · `test-lib` **61/61 · sàn 61** · test-evals · doctor ·
harness-size · entropy-scan · knowledge/lint · test-migrations · `apply-to --audit` ·
gates preMerge · evals — **tất cả exit 0**.

| mutant | ca bị giết |
|---|---|
| template mất `test-lib.mjs` | `61 ca hàm thuần đang không chạy ở đâu cả, và không sàn nào thấy` |
| `test-lib` rơi khỏi `NOT_FOR_CONSUMER` | `nó sẽ ship, tức việc tách không giảm được dấu chân nào` |
| một `ok.push` biến khỏi `test-lib` | `60 khẳng định, sàn 61 — một case đã NGỪNG CHẠY` |

Dấu chân repo tiêu thụ: **29 908 → 27 572** (−2 336 trong hai lô của phiên, −7,8 %).

## KHÔNG LÀM, có lý do

- **Không chuyển `rituals.mjs` (471 dòng ca) và `nativeSlotState` (387).** Chúng là ứng viên
  tiếp theo, nhưng chúng đọc trạng thái repo thật chứ không phải hàm thuần — chuyển chúng cần
  một lượt riêng, và lô này đã đủ bề mặt.
- **Không đổi tên `test-hooks.mjs`.** Xem §bán kính ảnh hưởng.
- **Không gộp hai sàn thành một.** Một sàn cho hai file là một sàn không phân biệt được
  "ca chết ở đây" với "ca chuyển sang kia" — đúng cái khe vừa phải đi đóng.
