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

---

Ba nhóm này được **cưỡng chế bằng máy** ở `.claude/hooks/dcg.mjs`,
`block-secrets.mjs`, và `permissions.deny` trong `settings.json`.

Rule này tồn tại để **giải thích tại sao**, không phải để cưỡng chế —
mọi thứ chỉ tồn tại dưới dạng lời nhắc sẽ bị bỏ qua bởi người đang gấp,
và người đang gấp luôn tồn tại.
