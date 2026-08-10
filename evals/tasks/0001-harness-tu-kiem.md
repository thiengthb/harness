---
id: "0001"
kind: representative
type: regression
maxTurns: 10
maxMinutes: 10
origin: "Task seed — chạy được ở MỌI repo, không cần cấu hình gì"
---

# Harness tự kiểm được không

> **Ngân sách ở trên vẫn là SỐ ĐOÁN — task DUY NHẤT trong bộ chưa đo được.** Lượt đo
> 2026-08-10 (#144) đặt trần rộng cho cả bốn task; ba task kia ra số, task này **chạm rate
> limit sau 1.5 phút** nên không có `num_turns` nào để đọc. Giữ nguyên `10 / 10` và nói ra
> rằng nó chưa đo, thay vì suy từ ba task kia: chúng nặng hơn task này, nên một con số suy ra
> sẽ rộng quá và cảnh báo `budget.alertAtPercent` mất tác dụng ở đúng task rẻ nhất.
>
> Lượt 2026-08-10 sáng cho thấy `10 lượt` **đủ** để task này ra 2043 byte kết luận thật — nên
> đây là "chưa đo", không phải "đang bó". Đo lại khi rate limit mở.

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

**Task này KHÔNG so được ở chế độ `--bare`** — và đây là ca mẫu của lý do runner phải
có tiền kiểm. Đo 2026-08-08 (v2.43.0), `--bare --task 0001`: **4/6 assertion thành
`n/a`** vì chúng đọc chính lớp harness vừa bị gỡ.

```
n/a  node tooling/test-hooks.mjs · test-migrations.mjs · apply-to.mjs --audit
n/a  node tooling/harness-doctor.mjs --quick
```

Không có tiền kiểm, bốn dòng đó ĐỎ ở lần chạy trần và XANH ở lần đầy đủ, rồi phép trừ
ghi chênh lệch đó vào cột *"giá trị của harness"* — trong khi agent không liên quan gì.
Bản trước của mục này nói ngược lại (*"task tốt nhất để chạy với --bare"*); nó viết khi
`--bare` chưa gỡ gì, nên chưa có gì để mâu thuẫn. Chênh lệch có ý nghĩa nằm ở các task khác.
