---
name: pre-merge
description: Cổng cuối trước khi mở PR trong repo dùng chung. Dùng trước khi tạo
  pull request, hoặc khi PR bị CI đỏ và cần kiểm lại toàn bộ.
allowed-tools: [Bash, Read, Edit, Glob, Grep]
---

# Pre-merge

Bất kỳ bước nào đỏ: **DỪNG, báo cáo, KHÔNG mở PR.**

## 1. Đồng bộ với main

```
git fetch origin && git rebase origin/main
```

Rebase nhánh **của chính mình** — an toàn. Không bao giờ rebase nhánh người khác đã checkout.

## 2. Gate

Chạy từng lệnh trong `harness.config.json → gates.preMerge`, theo thứ tự:

| Gate | Vì sao |
|---|---|
| `gen-clean` | quên chạy gen = file generated lệch nguồn, build sau ghi đè |
| `typecheck` | **TOÀN REPO**, không chỉ package đang sửa |
| `lint` | |
| `test` | |
| `build` | |
| `depcruise` | ranh giới module — chặn cả agent lẫn người |
| `e2e` | **mọi platform trong scope của feature** |

`typecheck` toàn repo là tuyến phòng thủ chính chống **conflict ngữ nghĩa**:
bạn đổi signature, người khác thêm callsite, hai diff không chạm dòng nào giống
nhau → git merge sạch → build vỡ trên main. Typecheck toàn repo biến lớp bug đó
thành computational control.

## 3. Ảnh hưởng ngang

```
git diff origin/main --name-only
```

Có chạm `paths.publicSurface` không?

- [ ] Liệt kê **mọi consumer** bị ảnh hưởng trong mô tả PR
- [ ] Gắn label `breaking`
- [ ] **Sửa consumer trong CÙNG PR.** Không bao giờ để "sửa sau trong PR khác" —
      atomic change là lợi thế lớn nhất của monorepo và cũng là lợi thế bị bỏ lỡ nhiều nhất

## 4. Kích cỡ

```
git diff origin/main --shortstat
```

Vượt `limits.prWarnLines` (trừ generated/lockfile) → **đề xuất chẻ**, và nói rõ chẻ thế nào.
Vượt `limits.prFailLines` → CI sẽ fail, phải chẻ.

Một PR = một mục đích. Agent rất hay gộp "sửa lint + thêm feature + đổi config".

## 5. Feature file

```
node tooling/check-feature-integrity.mjs origin/main
```

## 6. Điền PR template

Mục **Bằng chứng** phải có output thật. Nếu bạn không điền được mục đó,
nghĩa là bạn chưa verify — và bạn phát hiện điều đó **trước** khi review, không phải sau.

## 7. Tự kiểm lần cuối

- [ ] Không có file `.gen.*` trong diff
- [ ] Không có `.env`, secret, connection string
- [ ] Không có `console.log` / `TODO` bỏ quên trong code mới
- [ ] Commit message theo Conventional Commits, có `Refs:` và `Co-Authored-By:` nếu agent viết phần lớn
