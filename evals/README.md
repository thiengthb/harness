# evals/ — gate cho chính harness

Bước 3 của vòng học. **Không có bước này thì cả vòng lặp là mê tín**, và
"cải thiện harness" chỉ là phình harness.

## Bộ eval tối thiểu: 12–20 task

```
├── 6 task ĐẠI DIỆN       "thêm 1 endpoint + test", "thêm 1 màn hình",
│                          "sửa bug từ mô tả", "thêm 1 migration", "refactor 1 module"
├── 4 task ĐÃ TỪNG THẤT BẠI   ← QUAN TRỌNG NHẤT. Lấy từ manual-fixes.log
├── 3 task NGUY HIỂM      chạm auth/payment/prod-adjacent → đo AN TOÀN, không đo tốc độ
├── 2 task DÀI            >30 phút → đo recovery + state
└── 2 task NGOÀI VÙNG     thứ harness chưa được thiết kế cho → đo overfit
```

## Hai loại eval PHẢI tách nhau

```
CAPABILITY EVAL  → tỉ lệ pass thấp, mục tiêu là ĐẨY LÊN
REGRESSION EVAL  → tỉ lệ pass gần 100%, mục tiêu là BẢO VỆ
```

Trộn hai loại → bạn ra quyết định ưu tiên sai.

## Chấm — hai lớp

```
Lớp 1 (tất định, chạy TRƯỚC):  gate pass? test pass? số lần can thiệp người?
                               token? wall-clock? repo có sạch sau khi xong?
                               agent CÓ chạy test trước khi tuyên bố xong không?
Lớp 2 (LLM-judge, chỉ khi lớp 1 không đủ):  rubric cho chất lượng/thẩm mỹ
```

## Ba luật vệ sinh eval

1. **Cách ly mạng khi eval.** Model có thể suy ra là đang bị eval, nhận ra tên
   benchmark, và tìm ra đáp án. Đây là yêu cầu kỹ thuật, không phải tuỳ chọn.
2. **Cố định cấu hình hạ tầng.** Cấu hình tài nguyên container một mình có thể gây
   swing 6+ điểm phần trăm — thường lớn hơn khoảng cách giữa các model. Eval trên
   máy khác nhau = bạn đang đo nhiễu.
3. **Chấm cả quá trình, không chỉ kết quả.** Tới ~23% lần "pass" là **lucky pass**
   (vòng regression, retry mù, thiếu verify). Xếp hạng dịch chuyển tới 5 bậc khi
   chấm theo chất lượng quá trình.

## Nghi thức bắt buộc: deprecation review mỗi lần đổi model

Đây là thứ ngăn harness của bạn thành nghĩa địa.

```
1. Chạy eval với harness ĐẦY ĐỦ        → điểm baseline
2. Chạy eval với harness TRẦN           → điểm floor
   (chỉ init + gate; tắt hết skill/rule/hook không phải an toàn)
3. (baseline − floor) nhỏ → phần lớn harness của bạn là DEAD WEIGHT
4. Bật lại từng mảnh, đo delta từng mảnh. Giữ mảnh có delta dương.
5. Ưu tiên nghi ngờ: negative constraint · ví dụ dùng tool · hướng dẫn lặp lại
   ở nhiều nơi · context reset · "persona" prompt
6. Ghi kết quả vào docs/adr/NNNN-harness-review-<model>.md
```

**Bước 2 — chạy với harness trần — là bước gần như không ai làm, và cho nhiều
thông tin nhất.**

Bằng chứng cho thấy điều này có thật: một cơ chế cần thiết cho model đời trước
(context reset chữa "context anxiety") trở thành **vô ích và phải gỡ bỏ** trên
model đời sau. Không ai gửi thông báo cho bạn khi một mảnh harness hết hạn.

## Chạy

```
node evals/run.mjs                 # chạy toàn bộ
node evals/run.mjs --bare          # với harness trần (deprecation review)
node evals/run.mjs --task 0001     # một task
```
