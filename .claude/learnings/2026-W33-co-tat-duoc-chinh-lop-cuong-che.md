# Learnings — tuần W33, @thiengthb

> Đây là **ĐỀ XUẤT**, chưa phải harness. `.claude/settings.json` và `.claude/hooks/` là vùng cấm.
> DRI quyết định promote → `/knowledge-promote`.

## Sáu cách tắt lớp cưỡng chế của chính harness, không tầng nào chặn

**Nguồn phát hiện:** nghi thức `claude-code-drift`, rà Claude Code 2.1.229–231 (2026-08-13).
Mục changelog 2.1.229:

> *Changed `/commit-push-pr` so git/gh commands with dangerous flags (`--force`, `--amend`,
> `--no-verify`, etc.) are no longer auto-approved*

Vendor siết đúng lớp `dcg.mjs` tự làm tay. Nó **không** thay thế được `dcg` — phạm vi của nó là
slash-command của vendor, và repo này không dùng (`rg "commit-push-pr"` trên `.claude/` + `docs/`
⇒ **0**). Nhưng câu hỏi ngược lại mới đáng giá: **harness có phủ ba cờ ấy không?**

### Lần xuất hiện

Skill này đòi **≥2 lần độc lập kèm số PR/commit**. Ca này không phải "agent làm sai hai lần" —
nó là **lỗ phủ sóng**, và tôi có thứ mạnh hơn hai giai thoại: **sáu lệnh đo được**, cộng một lần
xuất hiện trước cùng lớp.

**① 2026-08-06 (issue #43, v2.36.0)** — đo: **5/5** biến thể nguỵ trang bằng cú pháp nháy của
shell đi lọt **tầng HAI**, tầng MỘT bắt được. Kết luận đã ghi vào `danger-zones.md`: *tầng hai
best-effort, tầng MỘT là tầng đáng tin.* `test-hooks` sinh ra ratchet `dcg ↔ permissions.deny` từ
đó.

**② 2026-08-13 (hôm nay, không có PR — rơi ra từ nghi thức drift)** — chiều **NGƯỢC LẠI** của
cùng một giả định: thứ vắng mặt ở **CẢ HAI** tầng. Bơm payload thẳng vào `dcg.mjs`
(`exit 2` = chặn):

| lệnh | tầng 1 `permissions.deny` | tầng 2 `dcg.mjs` |
|---|---|---|
| `git commit --no-verify -m "x"` | — | **cho qua** |
| `git commit -n -m "x"` | — | **cho qua** |
| `git push --no-verify` | — | **cho qua** |
| `git config core.hooksPath ""` | — | **cho qua** |
| `git config --unset core.hooksPath` | — | **cho qua** |
| `chmod -x .githooks/pre-commit` | — | **cho qua** |
| *đối chứng:* `git push --force origin main` | CÓ | **CHẶN** |
| *đối chứng:* `git reset --hard HEAD~1` | CÓ | **CHẶN** |

### Thiệt hại, đo được

```
core.hooksPath = .githooks
.githooks/pre-commit  →  node tooling/check-reservations.mjs
                      →  node tooling/precommit-scan.mjs      ← QUÉT SECRET
```

`danger-zones.md` §2 nói *"không đọc, không ghi, không log `.env*`, `*.pem`, key, token"*. Thứ
**cưỡng chế** câu đó khi commit là `precommit-scan`. Sáu lệnh trên tắt nó — ba lệnh đầu tắt một
lần, ba lệnh sau tắt **vĩnh viễn cho clone đó**, im lặng.

### Vì sao không phép kiểm nào thấy — và đây mới là phần đáng promote

`test-hooks.mjs` có ratchet đối chiếu **tầng HAI với tầng MỘT** (*"N điều cấm CHỈ có `dcg` đứng
sau"*, ratchet 8). Phép kiểm đó so hai danh sách **với nhau**. Thứ vắng mặt ở cả hai thì **theo
định nghĩa** nó không thấy được — không phải vì viết ẩu, mà vì hình dạng của phép so.

Đó là lý do lỗ này do **CHANGELOG CỦA VENDOR** chỉ ra, không phải do harness tự tìm. Cùng họ với
`L0007` (bản vá hai chiều mà chỉ có ca cho chiều ồn ào), ở quy mô một **lớp phép kiểm**.

**Lớp lỗi:** `constraint` (lỗ) + `verification` (vì sao không gì thấy).

## Dạng biểu diễn đề xuất

Chọn **(3) computational control**, hai nửa — và chỉ nửa đầu cần người:

**Nửa CƯỠNG CHẾ (vùng cấm ⇒ DRI làm).** Tầng MỘT là tầng đáng tin, nên deny rule trước:

```json
"Bash(git commit --no-verify:*)",
"Bash(git commit -n:*)",
"Bash(git push --no-verify:*)",
"Bash(git config core.hooksPath:*)"
```

Kèm rule `dcg.mjs` khớp theo CHƯƠNG TRÌNH (`git`) + đối số, vì tầng MỘT khớp theo **tiền tố**:
`git commit --no-verify -m x` khớp, nhưng `git commit -m x --no-verify` **không**. Đây đúng là
giới hạn `danger-zones.md` đã khai; hai tầng cần cả hai, không phải một.

> **Bẫy `-n`, phải khai trước khi ai đó viết rule:** `git commit -n` = bỏ qua hook, nhưng
> `git push -n` = **dry-run**, hoàn toàn vô hại. Một rule chặn `-n` cho mọi lệnh `git` là guard
> bắn nhầm (`L0002`) vào một lệnh người ta dùng để *an toàn hơn*. Rule phải biết subcommand.

**Nửa PHÁT HIỆN (không vùng cấm ⇒ làm được ngay, chờ DRI duyệt).** Trong `tooling/test-hooks.mjs`:
suy ra yêu cầu **từ chính repo**, không từ một danh sách phải nhớ —

```
nếu core.hooksPath được đặt VÀ có hook nào trong đó
  thì các cách tắt hook đó phải bị chặn ở tầng MỘT (đo bằng cách BƠM payload vào dcg, như bảng trên)
```

Nó **tự tắt** khi repo thôi dùng git hook — không ai phải nhớ gỡ.

**Vì sao không dùng dạng rẻ hơn:**

- **(1) test/contract** một mình: test *phát hiện* được lỗ, nhưng **không ngăn** được lệnh. Cưỡng
  chế phải ở tầng MỘT. Test là nửa còn lại, không phải cả bài.
- **(2) generator**: không có gì để sinh.

**Tầng:** project (`.claude/settings.json` + `.claude/hooks/`).
**Scope:** `universal` — *"repo nào cài git hook thì cờ bỏ-qua-hook phải bị chặn ở tầng cưỡng
chế"* đúng ở mọi project áp harness này, không phụ thuộc stack.

## Điều kiện thoát

Bỏ được khi **một trong hai** điều sau đúng:

1. Vendor cưỡng chế ở tầng của họ — lớp permission nhận biết cờ bỏ-qua-hook như một hành vi cần
   duyệt (2.1.229 mới làm cho `/commit-push-pr`; mở rộng ra mọi lệnh Bash là điều kiện thoát).
2. Repo thôi dùng git hook (`core.hooksPath` không đặt) — lúc đó **phép kiểm phải tự tắt**, và nó
   được thiết kế để tự tắt.

Rà lại: **2026-11-13** (3 tháng), hoặc sớm hơn nếu `claude-code-drift` thấy mục về permission của
lệnh Bash.

## Canary khi được duyệt

Theo đúng `/harness-propose` §6 — deny rule sai làm hỏng việc thật của người:

```
sửa qua .claude/settings.local.json  →  dùng thử 2 ngày  →  node evals/run.mjs
  →  CI parity 3 OS  →  PR + cập nhật .claude/whats-new.md  →  merge
```

Ca canary bắt buộc, vì nó là ca **bắn nhầm** dễ xảy ra nhất: `git push -n` (dry-run) và
`git commit --amend` trên commit **chưa đẩy** phải **vẫn chạy được**.

## KHÔNG đề xuất chặn `--amend`, và lý do phải ghi ra

Vendor gộp `--amend` chung nhóm với `--force`/`--no-verify`. Ở đây thì **không**: thiệt hại của
`--amend` chỉ hiện thực hoá khi force-push, mà force-push **đã bị chặn ở tầng MỘT**. Sửa commit
chưa đẩy là 95% việc thật với `--amend` — chặn cả nhóm là chặn đúng nhóm hợp lệ, cùng lỗi mà
`danger-zones.md` §3 đã tránh với migration chưa merge.
