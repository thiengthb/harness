# Nhật ký team

<!--
  CHỈ DRI GHI. Một người ghi = không bao giờ conflict.
  Dành cho thứ ảnh hưởng CẢ TEAM: đổi harness, đổi contract lớn, sự cố.
  Việc của từng issue đi vào docs/progress/<issue>.md.
-->

## 2026-08-03 — Harness baseline v1

Dựng harness đầy đủ. Xem `.claude/whats-new.md`.

Bốn quyết định đã chốt (ADR baseline của lớp harness — ở repo template, không ship):

1. **Branch strategy**: trunk-based, nhánh < 1 ngày, merge queue bắt buộc
2. **Ownership `.claude/`**: DRI, cưỡng chế bằng CODEOWNERS + `protect-harness` hook
3. **Hook viết bằng Node `.mjs`**, không bash — Parity Contract
4. **WIP limit**: xem `harness.config.json → limits.maxSessionsPerPerson`
