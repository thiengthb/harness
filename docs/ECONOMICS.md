# Lớp kinh tế

> **Lớp DUY NHẤT trong harness có thể gây thiệt hại tài chính trực tiếp.**
>
> Câu hỏi kiểm tra: *nếu agent chạy sai 4 giờ liên tục lúc 3h sáng, cái gì dừng nó?*
> Nếu câu trả lời là "tôi thức dậy và thấy" — bạn chưa có lớp này.

## Năm guardrail

Cấu hình ở `harness.config.json → budget`. Cưỡng chế ở tầng gateway/CI, **không phải
ở tầng lời nhắc**.

| # | Guardrail | Config | Vì sao |
|---|---|---|---|
| 1 | **Loop / step limit** | `maxTurnsPerRun` | agent lặp vô hạn cùng một sửa đổi là chế độ hỏng có thật |
| 2 | **Tool-call cap** | `maxToolCallsPerRun` | và cap riêng cho tool đắt |
| 3 | **Token budget / run** | (theo tool) | **cứng**, không phải cảnh báo |
| 4 | **Wall-clock timeout** | `maxWallClockMinutes` | biến task 8h thành task 8h, không thành task 30h |
| 5 | **Per-project budget + alert bất thường** | `monthlyUsdCap`, `alertAtPercent` | một project lỗi không đốt ngân sách cả portfolio |

Trong CI headless, `--max-turns` là **guardrail bắt buộc**. Không có nó, một job
lỗi có thể chạy tới hết quota.

## CAPO — chỉ số quan trọng nhất

```
CAPO = (tổng chi phí trong kỳ) / (số kết quả ĐƯỢC CHẤP NHẬN trong kỳ)

"được chấp nhận" = merge vào main VÀ không bị revert trong 7 ngày
```

```bash
node tooling/capo-report.mjs --days 7 --usd 120
```

**Vì sao CAPO tốt hơn "token đã dùng":** token là **input**, không phải giá trị.
Một run tốn 3× token nhưng ra PR merge được ngay còn **rẻ hơn** 3 run rẻ mà bạn
phải sửa tay.

**Cách đọc:** nếu CAPO đi lên *trong khi bạn đang "cải thiện harness"* →
harness của bạn đang **phình**, không đang tốt lên. Đối chiếu ngay với
`node tooling/harness-size.mjs`.

## Model tiering — quyết định harness, không phải quyết định tiết kiệm

| Việc | Loại model | Vì sao |
|---|---|---|
| Viết rulebook, kiến trúc, quyết định | **mạnh nhất** | một quyết định sai nhân lên 1000 file |
| Review, chấm điểm, adversarial | **mạnh nhất** | judge yếu → mọi thứ pass |
| Dịch/áp dụng mechanical theo rulebook | nhỏ hơn / rẻ | rulebook đã chứa trí tuệ |
| Classify, format, tóm tắt ngắn | rẻ nhất | không cần suy luận |

Khai ở `budget.modelTiering`. Nguyên lý: **model mạnh nhất đi vào chỗ QUYẾT ĐỊNH,
model rẻ đi vào chỗ THỰC THI mechanical.**

## Sáu chỉ số "harness có đang tốt lên"

| Chỉ số | Đo bằng | Xu hướng tốt |
|---|---|---|
| First-try acceptance rate | % task đúng ngay lần đầu | ↑ |
| Can thiệp / feature | số lần bạn phải chỉnh giữa đường | ↓ |
| Sửa tay / tuần | `node tooling/fixlog.mjs --list` | ↓ |
| Thời gian tới green | từ bắt đầu task tới gate xanh | ↓ |
| **CAPO** | `node tooling/capo-report.mjs` | ↓ hoặc phẳng |
| **Kích thước harness** | `node tooling/harness-size.mjs` | **phẳng hoặc ↓** |

Chỉ số cuối là chỉ số ngược trực giác — dán nó lên tường.
**Một harness đang tốt lên thường đang nhỏ đi**, vì mỗi bài học được đẩy xuống
dạng biểu diễn rẻ hơn (test, generator, hook) thay vì tích thành văn bản.

## Cạm bẫy: chỉ đo tốc độ ship

> Tốc độ tăng trước, chất lượng tụt sau, và độ trễ giữa hai thứ đó **dài hơn một sprint**.
> Bạn sẽ thấy "team nhanh gấp đôi" trong 3 tuần rồi trả nợ trong 3 tháng.

Luôn đo **cặp đôi**: tốc độ **và** (CAPO + tỉ lệ revert 7 ngày + thời gian PR chờ
review + số lần cùng một bug quay lại).

## Bảng theo dõi tối thiểu

Một bảng tính là đủ. Cập nhật thứ Sáu:

| Tuần | Project | Chi phí | PR merge | PR revert | CAPO | Sửa tay | Kích thước harness |
|---|---|---|---|---|---|---|---|

Ba tín hiệu đọc từ bảng:

- **Sửa tay cao + harness lớn** → harness đang phình mà không giải quyết vấn đề thật
- **CAPO tăng ở mọi project cùng lúc** → thường do một thay đổi ở tầng org (plugin,
  marketplace, model) → rollback tag
- **Sửa tay nhiều hơn PR merge** → agent đang tạo nợ nhanh hơn team trả → giảm WIP
