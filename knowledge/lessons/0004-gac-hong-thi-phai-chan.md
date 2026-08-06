---
id: L0004
title: Một cái gác ném lỗi thì CHO QUA — và không tầng đếm nào phân biệt được nó với gác đang làm việc
scope: universal
class: verification
representation: computational-control
status: active
owner: "@ai"
added: 2026-08-05
expires-review: 2026-11-05
occurrences: 5
evidence:
  - "PR #37 (v2.12.0) — tiêm `null.x` ngay sau `import` vào 4 gác của 3 nhóm nguy hiểm; cả 4 chuyển từ exit 2 (chặn) sang exit 1 (LỌT) với đúng payload chúng phải chặn"
  - "PR #38 — hồ sơ bài học; ghi lại cả 3 lần tự đi vào bẫy PHẠM VI khi viết chính bản vá"
  - "fleet @ 2026-07-31 — repo độc lập, quét hook-practice, phát biểu cùng luật: 'For a protection hook, an error should mean block, not allow'. Cơ chế `declareFailMode` lấy từ `fleet/.claude/hooks/_util.mjs` (xem tooling/lib/harness.mjs:355)"
artifacts:
  - "tooling/lib/harness.mjs — declareFailMode(code, why): mỗi hook KHAI chính sách hỏng của mình, lib không áp đặt"
  - "tooling/test-hooks.mjs — khối FAILMODE: tiêm lỗi vào từng hook, assert exit code theo chính sách đã khai; cửa thoát HARNESS_FAIL_OPEN=1 có test riêng"
  - ".claude/hooks/dcg.mjs — declareFailMode(2) fail-CLOSED"
  - ".claude/hooks/block-secrets.mjs — declareFailMode(2) fail-CLOSED"
  - ".claude/hooks/protect-harness.mjs — declareFailMode(2) fail-CLOSED"
  - ".claude/hooks/protect-migrations.mjs — declareFailMode(2) fail-CLOSED"
  - ".claude/hooks/protect-tests.mjs — declareFailMode(2) fail-CLOSED"
  - ".claude/hooks/post-edit-lint.mjs — declareFailMode(1) fail-open nhưng HIỆN RA, không phải 0"
evals:
  - "evals/tasks/0005-gac-hong-thi-chan.md"
exit-condition: "Hết cần khi Claude Code đổi hợp đồng exit code của hook — cụ thể: khi mã 1 trở thành CHẶN thay vì 'lỗi không chặn'. Kiểm bằng cách chạy lại khối FAILMODE trong tooling/test-hooks.mjs (bằng chứng sống, không phải tài liệu); nghi thức `claude-code-drift` nhắc rà ở mỗi lần bump version Claude Code."
---

## Triệu chứng

Một ngoại lệ ở bất cứ đâu trong hook làm tiến trình thoát mã **1**. Claude Code đọc mọi mã
khác 0 và 2 là *"lỗi không chặn"* ⇒ **tool call đi qua**.

Tiêm `null.x` ngay sau `import` — trước mọi phép kiểm — rồi đưa vào đúng payload mà hook
phải chặn:

| hook | payload | sạch | ném lỗi |
|---|---|---|---|
| `block-secrets` | API key thật vào `config.ts` | `exit=2` | `exit=1` ⇒ **LỌT** |
| `dcg` | ép ghi đè lịch sử nhánh chung | `exit=2` | `exit=1` ⇒ **LỌT** |
| `dcg` | xoá đệ quy ở gốc | `exit=2` | `exit=1` ⇒ **LỌT** |
| `protect-harness` | ghi `.claude/settings.json` | `exit=2` | `exit=1` ⇒ **LỌT** |

**Cả bốn cái gác của cả ba nhóm nguy hiểm.**

Và nó im theo một cách riêng: `hookRan()` nằm ở CUỐI hook, nên một crash không ghi dòng
nào, và `harness-doctor` đếm 0. **Ba tình huống đọc giống hệt nhau:** gác đang làm việc ·
gác không được cắm · gác đang crash.

## Nguyên nhân

Lớp `verification`. Hai lỗi ghép lại:

1. **Chính sách hỏng không được khai.** Không hook nào nói nó muốn gì khi chính nó lỗi, nên
   mặc định của runtime (mã 1 = cho qua) trở thành chính sách của mọi hook — kể cả những
   hook mà cho qua là hỏng nhất.
2. **Tầng đếm đo bằng dấu vết ở cuối đường thành công.** `hookRan()` ở cuối hàm chỉ chứng
   minh "chạy hết", nên vắng mặt dấu vết bị gộp với "không có gì để chặn".

## Cơ chế

`declareFailMode(code, why)` — **không áp đặt chính sách, buộc mỗi hook KHAI chính sách của
mình bằng một dòng.** Đây là phần tinh tế mà một bản sửa đồng loạt làm sai:

- **Gác bất biến cứng** (`dcg`, `block-secrets`, `protect-harness`, `protect-migrations`,
  `protect-tests`) → `2`: hỏng thì CHẶN.
- **Hook cố vấn** (`post-edit-lint`, `session-start`, …) → `1`: tool đi qua *và* lỗi hiện ra
  trong transcript. Ép chúng về `0` **tệ hơn không làm gì** — tầng đếm sẽ ghi một số 0 sạch
  sẽ cho một hook đang hỏng.

**Cửa thoát bắt buộc:** mọi hook import cùng một lib, nên một lỗi trong lib làm MỌI hook
fail-closed cùng lúc (`harness.config.json` sai cú pháp là ca thực tế nhất).
`HARNESS_FAIL_OPEN=1`, được ghi log. Một lỗ hổng được khai báo thì cãi lại được; một vụ khoá
cứng im lặng thì chỉ còn cách đi đọc mã nguồn lúc đang gấp.

## Chuyển đi được không

`universal`. Nó không nói gì về stack, về ngôn ngữ, hay về repo này — nó nói về **hợp đồng
exit code giữa một cái gác và cái runtime gọi nó**. Mọi repo dùng hook của Claude Code đều
có chính xác hợp đồng đó. Bằng chứng: `fleet` đi tới cùng luật một cách độc lập, từ một
đường khác (quét hook-practice), trước harness năm ngày.

## Hệ luận — và nó lớn hơn bài học chính

> **Harness có 24 script tự-kiểm và không cái nào tìm ra được điều này, vì mỗi cái trong số
> đó mã hoá CHÍNH ý niệm của harness về thứ cần kiểm.**

Đây là **giới hạn cấu trúc của tự-kiểm**, không phải một lỗ hổng trong bộ công cụ. `fleet`
phát biểu nó sau khi một validator bên ngoài (`agnix`) tìm ra 10/38 `SKILL.md` của họ có
YAML frontmatter sai chuẩn nghiêm — vô hình với bộ nạp dễ tính của Claude Code, **và vô hình
với cả mười công cụ của họ**.

Hệ quả hành động: **một oracle bên ngoài, dù chỉ chạy MỘT lần, mua được thứ không lượng
test nội bộ nào mua được** — không phải vì nó giỏi hơn, mà vì nó sai chỗ khác.

Chưa promote thành bài học riêng: nó chưa có `artifacts` (một nghi thức "chạy oracle ngoài"
chưa tồn tại), nên theo `knowledge/README.md` nó vẫn là ghi chú, không phải tài sản. Ứng
viên L0005 khi có cơ chế.
