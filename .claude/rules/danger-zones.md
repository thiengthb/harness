---
owner: "@dri"
added: 2026-08-03
expires-review: 2027-08-03
why: "Ba nhóm negative constraint DUY NHẤT được phép tồn tại toàn cục (xem .claude/rules/README.md LUẬT 3)"
exit-condition: "Không bao giờ. Đây là ba nhóm được miễn trừ khỏi luật cắt negative constraint."
---

# Ba nhóm nguy hiểm

Rule này **không có `paths`** — cố ý. Đây là 3 nhóm duy nhất đáng trả thuế context
ở mọi request. Mọi negative constraint khác phải bị cắt (xem `/entropy-sweep`).

## 1. Production

- Agent **chỉ** được apply/deploy lên staging. **Người bấm nút production.**
- Không `--auto-approve`, không context `prod`, không connection string production.
- MCP database trỏ staging/local. Nếu buộc phải trỏ prod: **read-only**.

## 2. Secret

- Không đọc, không ghi, không log `.env*`, `*.pem`, key, token, connection string có mật khẩu.
- Cần một giá trị bí mật? → đọc qua biến môi trường. Không hardcode, không "tạm thời".
- Secret **không reachable** từ nơi chạy code do model sinh.

## 3. Lịch sử chung

- Không force push (`--force-with-lease` trên nhánh của chính mình thì được).
- Không `reset --hard`, không `clean -fd`, không rebase nhánh người khác đã checkout.
- Không sửa lịch sử `main`.
- **Không sửa migration ĐÃ MERGE.** Migration đã merge là lịch sử chung của _database_:
  đồng đội đã apply nó, staging đã apply nó. Sửa nó không báo lỗi — nó làm DB lệch
  nhau im lặng, và làm hỏng checksum của Flyway/Liquibase/Alembic với thông báo khó
  hiểu. Muốn đổi thì viết migration MỚI.
  Migration **chưa merge** thì sửa thoải mái — đó là 95% việc bạn làm với migration,
  và một guard chặn cả nhóm đó là guard bắn nhầm.

---

## Cưỡng chế: HAI TẦNG, và tầng nào mạnh hơn thì nói rõ

**Tầng MỘT — `permissions.deny` trong `.claude/settings.json`.** Vendor cưỡng chế, trước cả
khi hook chạy. Đây là tầng đáng tin. Bản 2.1.223 của Claude Code vừa vá đúng lớp lỗi nguỵ
trang lệnh ở tầng này.

**Tầng HAI — hook** (`dcg.mjs`, `block-secrets.mjs`, `protect-migrations.mjs`,
`protect-harness.mjs`). Chúng thêm ba thứ tầng một không có: **giải thích tại sao**, **cách
đi tiếp**, và **telemetry**. Chúng KHÔNG thay được tầng một.

`dcg.mjs` là regex trên ngữ pháp shell, và **nó best-effort — đọc như vậy**. Từ 2.36.0 nó
khớp theo LỆNH (bóc heredoc, cắt theo `; && || |`, bỏ nháy, và mỗi rule khai nó nói về
CHƯƠNG TRÌNH nào) thay vì so chuỗi thô. Cái nó vẫn **không** bắt được:

- biến shell — `F=--force; git push $F` cần thực thi mới biết giá trị;
- `eval`, command substitution, `base64 -d | sh`;
- bất cứ gì ngoài ngữ pháp shell đơn giản.

Đo 2026-08-06 (issue #43): trước 2.36.0, **5/5** biến thể nguỵ trang bằng nháy đi lọt tầng
hai — và tầng MỘT bắt được chúng. Đó là lý do thứ tự hai tầng quan trọng hơn sức mạnh của
từng tầng. `tooling/test-hooks.mjs` đối chiếu mỗi điều cấm của `dcg` với `permissions.deny`
và giữ một ratchet cho phần chưa phủ — con số đó **chỉ được giảm**.

Rule này tồn tại để **giải thích tại sao**, không phải để cưỡng chế —
mọi thứ chỉ tồn tại dưới dạng lời nhắc sẽ bị bỏ qua bởi người đang gấp,
và người đang gấp luôn tồn tại.
