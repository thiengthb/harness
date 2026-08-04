# 2026-W32 — `dcg.mjs` quét cả THÂN HEREDOC, nên viết tài liệu về lệnh nguy hiểm bị chặn

> **ĐỀ XUẤT, chưa sửa.** `dcg.mjs` nằm trong `paths.harness`; đây là đường hợp pháp
> (`/harness-propose`). Gặp thật **HAI lần trong MỘT phiên** 2026-08-04 khi làm v2.0.0 —
> tức là đã qua ngưỡng *"≥2 lần độc lập"* của `knowledge/README.md`:
>
> 1. `cat > …/settings.json <<'EOF'` — fixture chứa dòng deny rule của chính template.
> 2. `cat > msg.txt <<'MSGEOF'` — **commit message** mô tả phát hiện này. Chặn ngay lúc
>    đang viết văn bản *về* cái bẫy, bằng chính cái bẫy.
>
> Ca 2 đáng chú ý hơn ca 1: nó nói rằng **mọi commit message nhắc tới một lệnh nguy hiểm**
> đều không viết được qua shell. Trong một repo mà changelog và bài học *phải* nêu tên
> lệnh nguy hiểm để giải thích guard, đó không phải ca hiếm — đó là công việc hằng ngày.

## Chuyện gì xảy ra

Đang tạo fixture cho `tooling/test-migrations.mjs` bằng heredoc:

```
cat > tooling/fixtures/migration-2.0.0/.claude/settings.json <<'EOF'
{ "permissions": { "deny": ["Bash(git push --force:*)"] } }
EOF
```

`dcg.mjs` chặn:

```
⛔ BỊ CHẶN: lệnh phá hoại trong repo dùng chung (ghi lại lịch sử chung).
   → dùng `git push --force-with-lease` trên nhánh của chính bạn.
```

Không có lệnh nào bị chạy. Chuỗi `Bash(git push --force:*)` là **nội dung file** —
chính là dòng deny rule mà `settings.json` của template đang có.

## Vì sao nó xảy ra

`toolCommand(input)` trả về **toàn bộ** `tool_input.command`, và với heredoc thì thân
file nằm ngay trong chuỗi đó. `DENY` regex `/git\s+push\s+[^|;&]*(-f\b|--force(?!-with-lease))/`
khớp. Hook không có cách phân biệt *"lệnh sẽ chạy"* với *"dữ liệu đi kèm lệnh"*.

## Vì sao nó nghiêm trọng hơn một lần bất tiện

Nó chặn đúng ba loại việc mà repo này **cần** làm thường xuyên:

1. Viết **fixture** chứa deny rule (đúng ca tôi gặp).
2. Viết **tài liệu** về lệnh nguy hiểm — `danger-zones.md`, `BRANCH-PROTECTION.md`,
   chính changelog này.
3. Viết **test** cho `dcg.mjs`. Trớ trêu: sửa `dcg` bằng shell thì `dcg` chặn.

Và gợi ý của nó (*"dùng `--force-with-lease`"*) là **vô nghĩa trong ngữ cảnh này** —
không có push nào cả. Một guard bắn nhầm kèm gợi ý sai là đúng
`knowledge/lessons/0002-guard-ban-nham.md`: nó dạy người ta rằng guard là thứ để lách.

## Ba lựa chọn, và đánh đổi

| | Cách | Đánh đổi |
|---|---|---|
| A | **Không sửa gì.** Dùng tool `Write` cho nội dung file, đừng dùng heredoc | Không mất phủ sóng nào. Nhưng chỉ đúng với agent — người vẫn gõ heredoc, và họ sẽ `--no-verify`/tắt hook |
| B | Cắt thân heredoc trước khi so khớp (`<<'EOF' … EOF`) | Mở một đường lách thật: `bash <<'EOF'\ngit push --force\nEOF` chạy được |
| C | Chỉ so khớp **đoạn trước** dấu chuyển hướng đầu tiên (`>`, `>>`, `<<`) khi lệnh mở đầu bằng `cat`/`tee`/`printf` | Hẹp và giải thích được. Vẫn hở nếu ai đó `cat` rồi `&& git push --force` |

## Đề xuất

**A cho agent (ngay), C cho người (cần bàn).** Lý do không chọn B: nó biến một lần
bất tiện thành một lỗ thật, và `dcg` là lớp *ngữ nghĩa* — thứ sandbox không phủ được.

**Nếu chọn C thì bắt buộc kèm test**, cả hai chiều, trong `tooling/test-hooks.mjs`:

- `cat > x.md <<'EOF'\ngit push --force\nEOF` → **OK** (đang ghi tài liệu)
- `bash <<'EOF'\ngit push --force\nEOF` → **BLOCK** (đang chạy)
- `cat > x.md <<'EOF'\nfoo\nEOF && git push --force` → **BLOCK** (nối lệnh thật)

Không có case thứ ba thì bản sửa tự mở lỗ mà không ai thấy.

## Điều kiện thoát

Khi `dcg.mjs` bị thu hẹp sau khi bật sandbox (xem ADR 0002 §Hệ quả): phần `rm -rf` và
lệnh cấp hệ thống chuyển xuống tầng OS, `dcg` chỉ còn giữ **ngữ nghĩa**
(`git push --force`, `DROP TABLE`, `kubectl --context prod`). Lúc đó bề mặt so khớp nhỏ
lại và ca này có thể tự hết — **kiểm lại trước khi viết code cho C.**
