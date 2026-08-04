---
name: wt
description: Liệt kê, kiểm và dọn worktree của repo này. Dùng khi bắt đầu ngày làm
  việc, khi không rõ mình đang ở đâu, hoặc khi máy chậm/hết ổ cứng.
allowed-tools: [Bash, Read]
disallowed-tools: Write Edit
disable-model-invocation: true
---

# Quản worktree

## 1. Luôn bắt đầu bằng định vị

```
pwd
git branch --show-current
git remote -v
```

Bệnh phổ biến nhất khi chạy 2–4 session song song: **commit vào nhầm repo/nhánh**.
Bật statusline (`.claude/settings.local.json → statusLine`) để nhìn thấy liên tục.

## 2. Xem toàn cảnh

```
node tooling/wt-clean.mjs
```

Báo cáo: đường dẫn | branch | issue | có thay đổi chưa commit | đã merge chưa.

## 3. Dọn

```
node tooling/wt-clean.mjs --apply
```

Chỉ xoá worktree **đã merge vào origin/main VÀ sạch hoàn toàn**
(không thay đổi chưa commit, không commit chưa push).

**Luật cho team: không bao giờ trả lời "giữ" theo phản xạ khi được hỏi.**
Worktree treo là nơi công việc đi chết.

## 4. Ngưỡng

Vượt `limits.maxWorktrees` → cảnh báo. Nguyên nhân thật thường là một trong hai:

- PR đang chờ review quá lâu → vấn đề là **năng lực review**, không phải worktree
- Bạn đang mở quá nhiều task → vượt WIP limit

Cả hai đều không sửa được bằng cách xoá worktree. Xem `docs/WIP.md`.

## 5. Vệ sinh tài nguyên cục bộ

Nhiều session trên **một máy** cạn những thứ này trước cả quota:

| Tài nguyên | Triệu chứng | Sửa |
|---|---|---|
| Cổng dev server | "port already in use" | cấp cổng theo worktree: `PORT=$((3000 + N))` |
| DB local | test session A xoá dữ liệu session B | mỗi worktree một schema: `DB_SCHEMA=wt_<issue>` |
| File watcher (inotify) | HMR chết | `symlinkDirectories` cho node_modules; nâng `max_user_watches` |
| Ổ cứng | hết chỗ sau 6 worktree | `symlinkDirectories`; dọn worktree đã merge |
| Simulator / thiết bị | hai session cài lên cùng simulator | một session mobile tại một thời điểm |
| CPU/RAM | máy đứng | đây thường là trần thật trên laptop — giảm session |
| `.git/index.lock` | mọi session bị chặn | SessionStart hook tự dọn nếu lock cũ > 5 phút |

## 6. Cách ly file bằng sparse checkout

Trong monorepo, khai `worktree.sparsePaths` trong `.claude/settings.local.json`
(**cá nhân**, không phải của team — mỗi người một domain).

File ngoài cone **không được ghi ra đĩa**: agent không thể tự mở rộng tầm nhìn.
Ràng buộc do **filesystem** cưỡng chế, không phải do agent tự giữ.

**Luật kèm theo:** task **xuyên biên giới** (đổi contract, refactor cross-service)
thì tạm bỏ cone hẹp — nó sẽ chặn đúng thứ task cần. Ma sát này là **cố ý**:
nó buộc bạn nhận ra "à, đây là task xuyên biên giới" và đối xử khác đi.
