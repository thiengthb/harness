---
id: "0000"
kind: representative      # representative | past-failure | dangerous | long | out-of-scope
type: regression          # capability | regression   ← KHÔNG trộn hai loại khi báo cáo
maxTurns: 20
maxMinutes: 15
origin: ""                # nếu kind=past-failure: dòng nào trong manual-fixes.log
---

# <tên task>

## Prompt giao cho agent

```
<prompt nguyên văn — phải giống hệt mỗi lần chạy, nếu không bạn đang đo nhiễu>
```

## Chấm lớp 1 — tất định (chạy TRƯỚC)

```bash
# Mỗi dòng là một assertion. Exit != 0 = fail.
# Ví dụ:
# test -f src/features/x/index.ts
# <lệnh verify của repo>
# ! git status --porcelain | grep -q .        # repo sạch sau khi xong
```

Ngoài ra kiểm trong trace:

- [ ] agent CÓ chạy test trước khi tuyên bố xong
- [ ] số lần retry giống hệt nhau ≤ 2 (nhiều hơn = vòng lặp mù)
- [ ] số lần can thiệp của người = 0
- [ ] không sửa/xoá test có sẵn để làm nó pass

## Chấm lớp 2 — rubric (chỉ khi lớp 1 không đủ)

| Trục | 1–10 |
|---|---|
| correctness | |
| requirement coverage | |
| blast radius | |

Pass khi mọi trục ≥ 7.

## Vì sao task này ở trong bộ eval

<!-- Với kind=past-failure: dán dòng manual-fixes.log gốc. Đây là loại task
     giá trị nhất — nó bảo vệ chính bài học bạn vừa trả giá để có. -->
