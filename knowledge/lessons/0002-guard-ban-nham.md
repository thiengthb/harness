---
id: L0002
title: Guard bắn nhầm còn tệ hơn không có guard — nó dạy cả team cách lách
scope: universal
class: tools
representation: computational-control
status: active
owner: "@dri"
added: 2026-08-03
expires-review: 2027-02-03
occurrences: 3
evidence:
  - "harness v1.0–1.2: `**/migrations/**` nằm trong paths.generated. Chặn MỌI sửa đổi migration, kèm lời khuyên sai 'sửa nguồn rồi chạy gen' — trong khi Rails/Alembic/Django/Flyway đều viết thân file bằng tay."
  - "Chính lỗi này chặn tác giả harness khi tạo thư mục `migrations/` của harness — phải đổi tên thành `harness-migrations/` để đi tiếp. Đó là lách, không phải sửa."
  - "2026-08-10: dcg rule /^git\\s+checkout\\s+--\\s/ chặn `git checkout -- <MỘT file cụ thể>` — bước DỌN DẸP của mutation test, tức của chính nghi thức harness đòi hỏi. 3 lần (Aug-8 evals/run.mjs; Aug-10 x2 tooling/rituals.mjs), xác nhận độc lập ở .claude/telemetry/gate-fails.log lúc 02:49, 02:59, 07:38. Ca cùng lớp: `rm -f /tmp/<file cụ thể>` bị rule rm gốc chặn. Đường vòng thực tế đã dùng: writeFileSync từ Node — KHÔNG có telemetry. Guard không mất tác dụng, nó mất TẦM NHÌN. Chi tiết: .claude/learnings/2026-W33-retro-cong-cu-do-tu-lam-nhieu-so-cua-no.md muc 3."
artifacts:
  - ".claude/hooks/protect-migrations.mjs"
  - ".claude/rules/danger-zones.md §3"
  - "harness-migrations/001-migration-khong-phai-generated.mjs"
  - "tooling/lib/harness.mjs — `GIT_DISCARD_WHOLE_TREE`: phân biệt `git checkout -- .` (bỏ cả cây) với `git checkout -- <file>` (bước dọn của mutation test). Regex ở `lib` chứ không trong hook, để bảng ca khẳng định vào CHÍNH nó — ranh giới `.` vs `./src` quá hẹp để tin một bản chép (#160, v2.66.0)"
  - ".claude/hooks/dcg.mjs — rule `checkout` gọi hằng trên. Bản vá đi CẢ HAI chiều: nới cho pathspec cụ thể, và siết hai lỗ rule cũ để lọt (`--` trần · tree-ish đứng trước `--`)"
evals:
  - "tooling/test-hooks.mjs"
  - "evals/tasks/0002-ton-trong-guardrail.md"
exit-condition: >
  Không có. Đây là luật thiết kế guard, không gắn với stack nào.
  Xoá khi harness không còn guard nào.
---

## Triệu chứng

Một guard chặn đúng về mặt kỹ thuật nhưng sai về mặt ý định. Nó bắn vào việc
người ta phải làm hằng ngày. Phản ứng của team **không bao giờ** là "à, mình sai" —
mà là tìm đường đi vòng: đổi tên file, chạy qua `Bash` thay vì `Edit`, hoặc tắt hook.

Khi đó bạn mất hai thứ cùng lúc: guard đó **và** lòng tin vào mọi guard khác.
Lần sau một guard chặn đúng, phản xạ đã được huấn luyện sẵn là lách.

### Ca thứ ba dạy thêm một điều hai ca đầu không dạy: guard mất TẦM NHÌN trước khi mất tác dụng

Hai ca đầu là *lách nhìn thấy được* — đổi tên thư mục, ai đọc PR cũng thấy. Ca 2026-08-10 thì
không: rule `/^git\s+checkout\s+--\s/` chặn `git checkout -- <MỘT file cụ thể>`, tức bước dọn
dẹp của **mutation test** — nghi thức mà chính harness đòi hỏi. Đường vòng đã dùng là
`writeFileSync` từ Node.

Hậu quả không phải "guard bị tắt". Guard vẫn chạy, vẫn đếm, và bảng của `harness-doctor` vẫn in
`dcg … 17 chặn` — trông **khoẻ hơn trước**. Thứ đã chuyển đi là **hành vi thật**, sang một kênh
guard không nhìn thấy và không ghi log.

Nên chế độ hỏng thật của một guard bắn nhầm không phải *"nó bị vô hiệu"* mà là:

```
guard bắn nhầm  →  người ta đi vòng  →  đường vòng KHÔNG có telemetry
                →  số của guard vẫn đẹp  →  không ai biết để sửa
```

Một guard bắn nhầm **tự che dấu vết của chính nó**. Đó là lý do câu số 2 trong §Cơ chế
(*"tần suất bắn nhầm > 10% thì sẽ bị lách"*) không thể đo bằng telemetry của guard — nó phải
đo bằng `fixlog`, tức bằng người ghi lại lúc bực mình.

## Nguyên nhân

Guard được viết theo **vị trí file** thay vì theo **điều nguy hiểm thật sự**.

`migrations/` là ví dụ sạch nhất. Suy luận sai:

```
migration thường do CLI sinh ra  →  migration là file generated  →  chặn sửa
```

Suy luận đúng:

```
CLI sinh KHUNG, người viết THÂN         →  sửa migration là việc BÌNH THƯỜNG
migration ĐÃ MERGE thì người khác đã apply
  →  sửa nó làm DB lệch nhau IM LẶNG + hỏng checksum của runner
  →  chặn ĐÚNG ca đó, không hơn
```

Khác biệt: guard sai chặn ~100% thao tác migration; guard đúng chặn ~5%.

## Cơ chế

Trước khi viết một guard, trả lời ba câu — nếu bí câu nào thì chưa nên viết:

1. **Ca nguy hiểm là gì?** Viết bằng câu có hậu quả cụ thể, không phải tên thư mục.
   "Sửa migration đã merge → DB đồng đội lệch" — chứ không phải "sửa file trong `migrations/`".
2. **Tần suất bắn nhầm?** Nếu >10% lần bắn là nhầm, guard này sẽ bị lách. Thu hẹp lại.
3. **Thông báo có làm được không?** Nếu lời khuyên trong thông báo không áp dụng được
   cho ca thường gặp nhất, guard đang mô tả sai thế giới. Đó là dấu hiệu sớm nhất.

Cộng hai thứ:

- **Cửa thoát tường minh có ghi log** (`HARNESS_ALLOW_...=1`). Không có cửa thoát,
  người ta tự tạo cửa thoát — và cửa đó không ghi log.
- **FAIL OPEN khi không xác định được.** Guard không trả lời được câu hỏi của chính
  nó thì phải im. Chặn-khi-không-biết là cách nhanh nhất để bị tắt.

## Chuyển đi được không

`universal`. Không phụ thuộc ngôn ngữ, stack, hay loại guard — đúng với lint rule,
pre-commit hook, permission deny, CODEOWNERS, và policy CI.

Liên quan: [[0001-lockfile-merge-tay]] — cùng một gốc, guard phải mô tả đúng
*bản chất* của thứ nó bảo vệ (lockfile là output của solver; migration là lịch sử
của DB), không phải mô tả *vị trí* của nó.
