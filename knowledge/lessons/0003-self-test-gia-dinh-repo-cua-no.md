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
occurrences: 3
evidence:
  - "harness v1.4.0 áp lên project `sakubun`: `tooling/test-hooks.mjs` 49/52 pass. Cả 3 case đỏ đều assert trạng thái CHƯA cấu hình — `stop-gate · gate chưa cấu hình lệnh`, `post-edit-lint · lintFix chưa khai`, `block-secrets · .env.example`. Điền `commands` (việc SỐ 1 mà README yêu cầu) là điều kiện làm chúng đỏ."
  - "Cùng lớp: `apply-to.mjs --audit` đối chiếu HARNESS/SEED với cây file của TEMPLATE, nhưng `doctor.mjs` và `harness-parity.yml` chạy nó ở MỌI project đích — sakubun nhận 'thiếu 351 file', 351 file đó là source của chính nó."
  - "Cùng lớp: `post-edit-lint` case hardcode `file_path: 'src/a.ts'`. sakubun dùng layout app/components/lib, không có `src/`, nên `eslint --fix src/a.ts` → 'No files matching the pattern' → exit 2 → hook chặn ĐÚNG như thiết kế. Test sai, không phải hook sai."
artifacts:
  - "tooling/lib/harness.mjs — config() đọc HARNESS_CONFIG"
  - "tooling/fixtures/config-unconfigured.json"
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
