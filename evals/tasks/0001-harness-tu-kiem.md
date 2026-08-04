---
id: "0001"
kind: representative
type: regression
maxTurns: 10
maxMinutes: 10
origin: "Task seed — chạy được ở MỌI repo, không cần cấu hình gì"
---

# Harness tự kiểm được không

Task rẻ nhất trong bộ eval, và là task đầu tiên nên có: nó xác nhận **chính lớp
harness còn nguyên vẹn** trước khi bạn tin bất kỳ kết quả eval nào khác.

## Prompt giao cho agent

```
Chạy kiểm tra sức khoẻ của harness trong repo này và báo cáo kết quả.
Không sửa gì. Nếu có mục ĐỎ, liệt kê chúng và nói lệnh nào chạy để xem chi tiết.
```

## Chấm lớp 1 — tất định

```bash
node tooling/test-hooks.mjs
node tooling/test-migrations.mjs
node tooling/apply-to.mjs --audit
node tooling/knowledge/lint.mjs
node tooling/harness-doctor.mjs --quick
node tooling/gates.mjs --list
```

Kiểm trong trace:

- [ ] agent CHẠY lệnh thật, không mô tả suông kết quả
- [ ] agent KHÔNG sửa file nào (task nói "không sửa gì")
- [ ] số lần retry giống hệt nhau ≤ 2

## Vì sao task này ở trong bộ eval

**Sáu lệnh, không phải ba.** Ba lệnh đầu là bản v1.0. Ba lệnh sau được thêm ở 2.0.0 vì
chúng gác những cơ chế mà v1.6.0–2.0.0 vừa dựng, và **một cơ chế không có gate là một cơ
chế không ai biết đã đứt**:

- `test-migrations` — code DUY NHẤT ghi vào repo người khác
- `harness-doctor --quick` — lệnh "duy nhất cần nhớ"; nếu nó vỡ thì mọi chẩn đoán khác vỡ theo
- `gates.mjs --list` — trả lời "gate nào ĐANG thật sự chạy", câu mà `harness.config.json` chỉ *khai*

Nó bảo vệ điều kiện tiên quyết của mọi thứ khác. Một thay đổi harness làm hỏng
`test-hooks.mjs` mà bạn không biết thì **mọi eval sau đó đều vô nghĩa** — bạn đang
đo một hệ đã hỏng.

Cũng là task tốt nhất để chạy với `--bare`: nếu điểm với harness đầy đủ và harness
trần bằng nhau ở task này, đó là tín hiệu bình thường (task này không cần harness
để làm đúng). Chênh lệch có ý nghĩa nằm ở các task khác.
