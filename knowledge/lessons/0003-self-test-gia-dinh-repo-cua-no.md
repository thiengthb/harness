---
id: L0003
title: Self-test của template phải assert LOGIC, không assert cấu hình của project đích
scope: universal
class: verification
representation: test
status: active
owner: "@dri"
added: 2026-08-04
expires-review: 2027-02-04
occurrences: 10
seen-in:
  - harness
  - sakubun
  - sakubun-test
  - warehouse
evidence:
  - "[warehouse] 2026-08-03, ĐỘC LẬP: `tooling/test-hooks.mjs` bám vào `harness.config.json` mặc định — điền `commands.*` làm 3 case FAIL, và `protect-migrations` dùng fixture `db/migrations` nên VỠ khi project thu hẹp `paths.migrations` về thư mục migration có thật. Template phát hiện lại đúng biến thể đó ngày **2026-08-05** và tự gọi là 'lần thứ tư' — hai ngày sau, trong khi bằng chứng đã nằm trên đĩa. Đây là chi phí ĐO ĐƯỢC của việc chiều LÊN không chạy: nếu pack của warehouse đi lên hôm 08-03, ngưỡng '2 lần độc lập' đã đạt và bản sửa đã hạ cánh sớm hơn hai ngày."
  - "[sakubun-test] 2026-08-03, ĐỘC LẬP: hai mục riêng — `post-edit-lint` case giả định `lintFix` rỗng nên 'đỏ oan ngay sau khi cấu hình project', và `apply-to --audit` chạy ở project đã nhận harness thì 'luôn đỏ, doctor báo CHẶN sai'. Cùng hai ca mà sakubun ghi độc lập cùng ngày."
  - "harness v1.4.0 áp lên project `sakubun`: `tooling/test-hooks.mjs` 49/52 pass. Cả 3 case đỏ đều assert trạng thái CHƯA cấu hình — `stop-gate · gate chưa cấu hình lệnh`, `post-edit-lint · lintFix chưa khai`, `block-secrets · .env.example`. Điền `commands` (việc SỐ 1 mà README yêu cầu) là điều kiện làm chúng đỏ."
  - "Cùng lớp: `apply-to.mjs --audit` đối chiếu HARNESS/SEED với cây file của TEMPLATE, nhưng `doctor.mjs` và `harness-parity.yml` chạy nó ở MỌI project đích — sakubun nhận 'thiếu 351 file', 351 file đó là source của chính nó."
  - "Cùng lớp: `post-edit-lint` case hardcode `file_path: 'src/a.ts'`. sakubun dùng layout app/components/lib, không có `src/`, nên `eslint --fix src/a.ts` → 'No files matching the pattern' → exit 2 → hook chặn ĐÚNG như thiết kế. Test sai, không phải hook sai."
  - "Cùng lớp, 2026-08-04 (v2.0.0): `apply-to.mjs --audit` IGNORE dùng `/^\\.git\\//` — cần dấu `/` cuối. Trong WORKTREE thì `.git` là một FILE, nên audit báo 'bỏ sót .git' và eval 0001 đỏ theo. Mà worktree là trạng thái BÌNH THƯỜNG theo AGENTS.md (một issue = một worktree). Cùng một check, lần thứ hai giả định sai về hình dạng repo."
  - "Cùng lớp, 2026-08-04 (v2.0.0): `limits.prWarnLines/prFailLines` 400/800 hiệu chỉnh cho repo SẢN PHẨM nhưng áp lên chính repo TEMPLATE — nơi mọi thay đổi harness là đa file bắt buộc. Đo 6 release: 3/6 vượt mốc fail, 5/6 vượt mốc warn số file. Gate tự fail chính công việc bình thường của repo nó đang gác."
  - "Cùng lớp, 2026-08-04 (v2.0.0): check CODEOWNERS trong harness-doctor dùng `coText.includes('@dri')` trên CẢ FILE, nên một comment GIẢI THÍCH về placeholder bị tính là DÙNG placeholder. `fmKeys()` cách đó 60 dòng trong cùng file đã có comment 'văn xuôi NHẮC tới một key không phải là KHAI nó' — cùng bài học, hai chỗ, một chỗ đã học."
  - "Cùng lớp, 2026-08-04 (v2.1.0): `snapshot()` trong `test-migrations.mjs` đi theo DANH SÁCH PATH CỨNG (`JSON_FILES` + `.claude/hooks`). Migration 004 là cái đầu tiên chạm một file ngoài danh sách (`.github/workflows/ci.yml`) và nhận `③ idempotent đạt` trong khi ③ chưa từng nhìn vào file nó sửa. Một hợp đồng có PHẠM VI khai một lần rồi không ai khẳng định lại sẽ cho màu xanh RỖNG đúng lúc nó được cần nhất. Sửa: `walk('.')` toàn cây, trừ `.git`."
  - "Cùng lớp, 2026-08-04 (v2.1.0): engine mutant của `test-migrations.mjs` quyết định 'có regex lazy để đột biến không' trên SOURCE ĐẦY ĐỦ, nên một comment GIẢI THÍCH rằng migration cố ý KHÔNG dùng `[\\s\\S]` lazy bị đọc thành code. Đột biến áp vào văn xuôi ⇒ hành vi không đổi ⇒ suite báo `MUTANT SỐNG SÓT` về một migration ĐÚNG. Neo vào CODE, đừng neo vào comment giải thích code — bản sửa quyết định trên bản đã bỏ comment."
artifacts:
  - "tooling/lib/harness.mjs — config() đọc HARNESS_CONFIG"
  - "tooling/test-migrations.mjs — snapshot() đi toàn cây; quyết định mutant trên bản bỏ comment; điều kiện ⑤ do migration tự khai `expect`"
  - "tooling/fixtures/config-unconfigured.json"
  - "tooling/fixtures/config-automemory-in-repo.json"
  - "tooling/test-migrations.mjs — hợp đồng 4 điều kiện + mutant, cho code ghi vào repo KHÁC"
  - "tooling/apply-to.mjs — IGNORE dùng `/^\\.git(\\/|$)/`, dấu `$` là bản sửa"
  - "harness.config.json — `$comment_prLines` ghi phép đo 6 release, không phải con số suông"
  - "tooling/apply-to.mjs — --audit tự bỏ qua khi thấy .claude/harness-manifest.json"
evals:
  - "tooling/test-hooks.mjs (phải xanh 100% trên project ĐÃ cấu hình đầy đủ)"
exit-condition: >
  Không có. Đây là luật thiết kế cho self-test của một template, không gắn với stack nào.
  Xoá khi template không còn self-test nào.
---

## Triệu chứng

Test suite của template xanh 100% **trong repo template** và đỏ ở project đích — mà
project đích không sai gì cả. Nó đỏ vì đã làm đúng điều template dặn: điền
`commands`, chỉnh `paths.secrets`, dùng layout của riêng nó.

Dấu hiệu nhận ra: nhãn của case chứa chữ "chưa" — *chưa cấu hình*, *chưa khai*.
Một test tên là "khi X chưa được cấu hình" mà đọc cấu hình THẬT thì không test logic,
nó test rằng **project vẫn còn trống**.

## Vì sao đắt

Ba tầng, tăng dần:

1. Đỏ giả làm người ta bỏ qua màu đỏ. Sau hai tuần "à cái đó đỏ sẵn rồi", một lỗi
   thật lẫn vào giữa và không ai thấy.
2. Nó dạy **sai hướng**: cách nhanh nhất để test xanh lại là hạ cấu hình về mặc định
   — tức là tháo chính cái gate mà template dựng.
3. Nó xói uy tín của template ở đúng lúc dễ mất nhất: **lần đầu** người ta áp nó.

## Luật

**Self-test của template chỉ được assert thứ template sở hữu.** Cấu hình của project
là INPUT, không phải sự thật để assert.

- Case cần một trạng thái cấu hình → dựng **fixture config** và trỏ vào
  (`HARNESS_CONFIG=tooling/fixtures/config-unconfigured.json`).
- Case cần một file → tạo **file tạm thật**, đừng giả định `src/`, `app/` hay layout nào.
- Check chỉ có nghĩa trong repo template → cho nó **tự nhận ra mình đang ở đâu** và bỏ qua
  (tín hiệu sẵn có: `.claude/harness-manifest.json` chỉ tồn tại ở project ĐÍCH).

## Cách kiểm là đã hết

Không phải "test xanh trong repo template" — nó xanh ở đó từ đầu. Mà là:

```
node tooling/test-hooks.mjs        # trên một project ĐÃ điền commands đầy đủ
node tooling/apply-to.mjs --audit  # trên project đích → bỏ qua, không phải FAIL
```

Cả hai phải xanh **mà không phải sửa gì trong `harness.config.json`**.
