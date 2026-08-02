# Rubric: <tên>

> Rubric là cách bạn **xác minh GU của mình** — thứ chủ quan mà check tất định
> không với tới.
>
> **Nhưng hỏi trước khi viết rubric:** có biến được thành check tất định không?
> "Reject migration nào drop column mà không có backfill" *nghe* như việc của LLM,
> nhưng là một AST/grep rule tất định. **Luôn ưu tiên computational control.**
>
> Rubric để trong repo (không nhúng vào file agent) để **dùng lại được và version được**.

---

## Dùng khi

<!-- Điều kiện cụ thể. Không có điều kiện rõ ràng → rubric này sẽ không bao giờ chạy. -->

## Trục chấm

| Trục | 1–3 | 4–6 | 7–8 | 9–10 |
|---|---|---|---|---|
| **<trục 1>** | <mô tả cụ thể> | | | |
| **<trục 2>** | | | | |

Mô tả từng mức phải **cụ thể tới mức hai người chấm ra cùng điểm**.
"Chất lượng tốt" không phải mô tả — đó là ý kiến.

## Điều kiện pass

Mọi trục ≥ 7 **VÀ** không có blocking issue.

## Bằng chứng bắt buộc

Mỗi điểm phải kèm `file:dòng` hoặc screenshot. **Điểm không có bằng chứng = không hợp lệ.**

## Calibrate

Vài vòng đầu, LLM-judge sẽ **quá hiền**: nó tìm ra vấn đề thật rồi tự nhủ
"cũng không to tát lắm". Chấm tay 3–5 mẫu, so với điểm của judge, và chỉnh mô tả
mức điểm cho tới khi khớp.

**Đừng nới thang để dễ pass** — judge yếu thì mọi thứ pass, và bạn mất luôn cơ chế.
