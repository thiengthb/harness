# Nâng cấp harness cho project đã áp

> Câu hỏi: *"Áp template vào project rồi, sau này template update thì migrate có dễ không?"*
>
> **Có — nếu bạn tôn trọng ranh giới giữa CƠ CHẾ và NỘI DUNG.** Tài liệu này nói
> chính xác cái gì nâng cấp tự động, cái gì không, và tại sao.

## Ba lớp, ba số phận khác nhau

| Lớp | Ví dụ | Khi nâng cấp |
|---|---|---|
| **CƠ CHẾ** — của template | `.claude/hooks/**` · `tooling/**` · `.claude/skills/**` · `.githooks/` · `evals/run.mjs` · `harness-migrations/` | **Tự động cập nhật** (nếu bạn chưa sửa) |
| **NỘI DUNG** — của project | `harness.config.json` · `AGENTS.md §Gotchas` · `features/**` · `knowledge/lessons/**` · `docs/progress/**` · `docs/adr/**` | **Không bao giờ bị đụng** |
| **THAM CHIẾU** — template cải thiện, bạn có thể đã sửa | `docs/CONFLICTS.md` · `docs/ARCHITECTURE.md` · CI workflow · PR template | **Chỉ BÁO có bản mới**, bạn tự quyết |

Ranh giới này là lý do migration dễ. Nếu bạn nhét logic riêng của project vào một
hook, bạn vừa xoá ranh giới đó — và mỗi lần nâng cấp sẽ thành một cuộc merge tay.

## Lệnh

```bash
# Trong project đã áp harness:
node tooling/upgrade.mjs /đường/dẫn/tới/harness-template            # XEM TRƯỚC
node tooling/upgrade.mjs /đường/dẫn/tới/harness-template --apply
```

Luôn xem trước. Luôn commit hết trước khi `--apply` — rollback bằng `git` là mạng lưới cuối.

## Cơ chế: so ba chiều bằng hash

`.claude/harness-manifest.json` lưu hash của mọi file cơ chế **tại thời điểm áp/nâng cấp gần nhất**.

```
hash hiện tại == hash trong manifest  →  bạn CHƯA sửa   →  ghi đè an toàn
hash hiện tại != hash trong manifest  →  bạn ĐÃ sửa     →  GIỮ NGUYÊN, ghi bản template ra <file>.new
file không tồn tại                     →  file mới       →  thêm
```

**Không có ghi đè im lặng.** Đây là khác biệt duy nhất nhưng quan trọng nhất so với
`apply-to.mjs --update` (vẫn còn, nhưng chỉ nên dùng khi bạn chắc chắn chưa sửa gì).

## Migration script — cho thứ copy file không làm được

Đổi tên field trong config, chuyển cấu trúc thư mục, đổi format frontmatter.
Nếu không có chúng, một đổi tên field làm hook đọc `undefined` và **fail âm thầm**.

`upgrade.mjs` tự chạy script trong `harness-migrations/` có `version` nằm trong
khoảng `(version của bạn, version của template]`, theo thứ tự.
Xem `harness-migrations/README.md`.

## Quy trình khuyến nghị

```
1. git status sạch, commit hết
2. node tooling/upgrade.mjs <template>              ← đọc changelog + kế hoạch
3. node tooling/upgrade.mjs <template> --apply
4. git diff                                          ← đọc từng thay đổi
5. Xử lý mọi file .new (merge tay rồi xoá)
6. node tooling/doctor.mjs
7. Cập nhật .claude/whats-new.md cho team           ← nửa team sẽ hành xử theo rule cũ nếu bỏ bước này
8. Commit trên một nhánh riêng, mở PR
```

Bước 8 quan trọng với team: nâng cấp harness là thay đổi hành vi của **mọi agent
của mọi người**. Nó xứng đáng một PR có review, không phải một commit thẳng vào main.

## Nhiều repo — canary trước

```
template main  →  1 repo canary (ít quan trọng) nâng trước
               →  chạy eval set của repo đó
               →  ổn → gắn TAG
               →  các repo khác nâng theo tag
```

**Không bao giờ để nhiều repo pin `main` của template.** Một commit sai làm hỏng
đồng thời tất cả.

## Bốn thứ giúp migration luôn dễ

**1. Đừng sửa file cơ chế — mở rộng nó.**
Cần hành vi riêng? Thêm hook **mới** của project vào `.claude/settings.json` thay vì
sửa hook có sẵn. File mới của bạn không nằm trong manifest → không bao giờ xung đột.

**2. Mọi thứ đặc thù project đi vào `harness.config.json`.**
Đó là lý do file này tồn tại. Hook đọc config; sửa config không bao giờ gây conflict.

**3. Chạy `node tooling/doctor.mjs` định kỳ**, không chỉ khi nâng cấp.
Nó phát hiện drift trước khi drift thành nợ.

**4. Giữ manifest.**
Không có `.claude/harness-manifest.json`, `upgrade.mjs` không phân biệt được
"bạn đã sửa" với "template đã đổi" — và phải ghi đè mù. Đừng gitignore nó.

## Nếu bạn đã lỡ sửa nhiều file cơ chế

```bash
node tooling/upgrade.mjs <template>       # liệt kê file xung đột
```

Với mỗi file trong danh sách, hỏi: **thay đổi này là đặc thù project hay là cải
tiến chung?**

- **Đặc thù project** → chuyển nó ra một hook/script riêng của project, khôi phục
  file gốc. Lần nâng cấp sau sẽ sạch.
- **Cải tiến chung** → đóng góp ngược lên template (`/harness-propose` →
  `/knowledge-promote` → `export`). Rồi khôi phục file gốc.

Cả hai đường đều dẫn tới: **file cơ chế trở lại nguyên bản, và bạn không bao giờ
phải merge tay lần nữa.**
