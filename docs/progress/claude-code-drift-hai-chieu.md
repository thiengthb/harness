# claude-code-drift: drift có hai chiều, phép so thì không (v2.73.0)

issue: **KHÔNG CÓ** — lỗi tự lộ ra khi chạy `rituals.mjs --all` trên một máy tụt hậu.
owner: @thiengthb · branch: `fix/claude-code-drift-hai-chieu` · worktree: gốc repo · platforms: n/a

<!--
  Neo chống trôi:
    node tooling/test-hooks.mjs                → 276/276, sàn 276
    node tooling/rituals.mjs --all | grep claude-code   → `ok`, không phải `due`
-->

## Vì sao lô này tồn tại

Nó **không** đến từ một issue. Nó đến từ việc pull một repo tụt hậu 100 commit rồi chạy bảng
nghi thức — tức đúng cái hình dạng mà một phép so không có chiều cần để lộ ra, và là hình dạng
không xảy ra trên máy nào luôn ở mũi nhọn.

## Lỗi

`reviewedVersion` là sự thật **của repo** (được commit, máy khác có thể đã ghi). Version đang
chạy là sự thật **của máy này**. Hai đại lượng khác chủ ngữ thì lệch được cả hai chiều — nhưng
`rituals.mjs` so bằng `!==`.

```
sổ đã rà 2.1.228  (máy khác, 2026-08-12)
máy này chạy 2.1.222
⇒ "Claude Code đã đổi 2.1.228 → 2.1.222: đọc changelog bản mới…"
```

Không có bản mới nào. Việc đúng là **không làm gì**.

## Vì sao không dừng ở "một dòng chữ sai"

Ở chiều lùi, hành động **duy nhất** tắt được đèn là chạy `--reviewed-claude-code` — và nó hạ
`reviewedVersion` đã commit xuống `2.1.222`, vứt một bản rà của đội để làm xanh một mục trên máy
mình. `2.1.223`–`228` sau đó đọc thành *"chưa ai rà"*, trong khi bản ghi của chúng vẫn nằm ngay
trong `history`.

Đó là `L0008` đúng nghĩa: *tín hiệu TỚI HẠN phải TẮT ĐƯỢC bằng hành động nó đề nghị* — mà hành
động nó đề nghị ở đây gây thiệt hại.

## Ba sửa

1. `versionCmp()` **lên `lib` và được export**. Nó vốn khoá trong `releaseTagGap()`; hai bản
   chép của cùng một phép so sẽ trôi khỏi nhau. Trả `null` khi không so được — không phải `0`.
2. Nghi thức phân biệt **ba** chiều: tiến ⇒ `due` · lùi ⇒ `ok` **kèm câu cản** lệnh rà · không
   so được ⇒ `?`.
3. `mergeBaseline()` coi `reviewedVersion` là một **đỉnh**. Rà bản cũ hơn: mốc giữ nguyên,
   `history` vẫn nhận bản ghi. `reviewedAt` đi **cùng** `reviewedVersion`.

## Bằng chứng

Sàn **273 → 276** · suite `276/276 exit 0` · doctor exit 0.

Cả hai chiều đều mutation-test — vì chiều ① ồn (dòng chữ sai) còn chiều ③ lặng (một con số âm
thầm tụt lại, không triệu chứng), và `L0007` nói đúng về ca đó:

| mutant | giết ca |
|---|---|
| `drift` quay về `!==` | 3 ca `claude-code-drift` |
| `keepPrev = false` | 2 ca `mergeBaseline` |

Refactor `releaseTagGap` sang `versionCmp` chạy **trước** khi thêm ca mới, và suite giữ nguyên
`273/273` — nên nó là refactor thuần, không giấu thay đổi hành vi nào.

## Một điều đáng ghi về quy trình

Ở lượt trước tôi kết luận sai rằng lỗi này phải đi qua `/harness-propose` vì nó là *"lần thứ 2
của lớp #194"*. Kiểm lại thì `#194` — **cùng lớp lỗi, cùng loại file** — được sửa bằng một PR
thường. `/harness-propose` gác **tầng quản trị** (`.claude/settings.json`, hook, rule,
`AGENTS.md`, `harness.config.json`), không gác `tooling/`. Áp nhầm cái gác đó biến một bug sửa
được trong một buổi thành một thứ chờ DRI.

Và ngưỡng `≥2` của skill đó cũng không đạt theo `fixlog`: cả ba ứng viên đều `1×`. Bước 1 của
skill nói thẳng — *"chưa đủ 2 lần → ghi fixlog rồi thôi"*.

## Còn mở

`/harness-retro` ↔ `/knowledge-promote` vẫn không thể cùng xanh. `1×` trong fixlog, nên **chưa
đủ ngưỡng** — để nguyên trong sổ, không đẩy lên.
