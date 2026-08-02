# Ngày đầu — 30 phút

Mục tiêu: bạn chạy được một lệnh và làm được việc ngay, không cần ai kèm.

## 1. Toolchain

```
mise install          # hoặc nvm/fnm theo .nvmrc
```

Dùng Windows? Đọc bảng ở cuối trang **trước** khi làm gì khác.

## 2. Bootstrap

```
git clone <repo> && cd <repo>
node tooling/init.mjs
```

Script này tự kiểm môi trường và **nói bạn thiếu gì**. Nó cũng là chỗ duy nhất
trong repo biết về khác biệt giữa các hệ điều hành.

Nó tạo `.claude/settings.local.json` cho bạn — **đó là file của bạn**, sửa thoải mái.
Đừng sửa `.claude/settings.json` (file của team; hook sẽ chặn).

## 3. Khởi động Claude Code

```
claude
```

SessionStart hook in cho bạn: vị trí, nhánh, commit gần nhất, reservation của
người khác, và thay đổi harness mới. **Đọc nó.**

## 4. Đọc AGENTS.md — chỉ AGENTS.md

~150 dòng. **Đừng đọc gì khác hôm nay.**

## 5. Làm một issue thật

Claim một issue có label `good-first-agent-task` (luôn có 3–5 cái sẵn: scope hẹp,
có test, không chạm contract).

```
/claim         → dựng worktree, kiểm chồng lấn, tạo nhật ký
/ship-feature  → đi hết vòng đời feature
/pre-merge     → cổng cuối
/handoff       → kết thúc sạch
```

## 6. Mở PR

Auto-review sẽ chỉ ra vài thứ. **Đó là bình thường và đó là mục đích.**

---

## Bạn KHÔNG cần biết hôm nay

- Toàn bộ kiến trúc — agent biết, và AGENTS.md có luật phụ thuộc
- Toàn bộ skill — chúng tự kích hoạt khi cần
- Vì sao có hook X — hỏi DRI nếu bị chặn

## Nếu bị chặn bởi một hook

**Đó là cố ý.** Đọc thông báo, làm theo — hook luôn nói cả *cách sửa*, không chỉ *sai*.

Nghĩ hook sai? → `/harness-propose`, nhắn DRI.
**KHÔNG tự sửa `.claude/settings.json`** (bạn sẽ bị chặn, và đó cũng là cố ý).

Một người lặng lẽ tắt hook = team có hai chuẩn và không ai biết.

---

## Theo hệ điều hành

| Bước | Ubuntu | macOS | **Windows + WSL2** ⭐ | Windows native |
|---|---|---|---|---|
| Toolchain | `mise install` | `mise install` | trong WSL: `mise install` | `winget` + `mise` |
| Cài Claude Code | script chính thức | script chính thức | **trong WSL**, không trên host | script PowerShell |
| Vị trí repo | bất kỳ | bất kỳ | **`~/dev/`** (KHÔNG `/mnt/c`) | `C:\dev\` (KHÔNG OneDrive/Desktop) |
| Bootstrap | `node tooling/init.mjs` | ← | ← | ← |
| Việc thêm | nâng inotify nếu nhiều worktree | — | — | LongPath + Developer Mode + ExecutionPolicy |
| Auto mode / sandbox | có | có | có | **chưa** |

### Vì sao khuyến nghị WSL2 cho Windows

- Auto mode + sandbox hoạt động
- Mọi script/hook/path giống hệt đồng đội → **conflict môi trường gần như biến mất**
- I/O trên `/mnt/c` với `node_modules` **rất chậm** — đây là bẫy phổ biến nhất

Đánh đổi: mất truy cập trực tiếp một số tool Windows-native và phải hiểu hai
filesystem. Chấp nhận được với hầu hết team web/mobile.

### Nếu chọn Windows native — 4 việc bắt buộc

```powershell
# 1. Long Path
Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -Value 1
# 2. Developer Mode (cho symlink) — hoặc chấp nhận fallback copy
# 3. Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
# 4. Đặt repo ở C:\dev\<repo> — KHÔNG Desktop, KHÔNG OneDrive
#    OneDrive sync + node_modules = ác mộng. Nhiều team mất buổi chiều vì cái này.
```

`node tooling/init.mjs` kiểm và cảnh báo cả bốn.
