# Đo độ trễ `PreToolUse`, và phép đo huỷ mục kế tiếp của kế hoạch (v2.82.0)

issue: **KHÔNG CÓ** — Đợt 4 của kế hoạch cô đặc harness.
owner: @thiengthb · branch: `fix/do-do-tre-pretooluse` · worktree: gốc repo · platforms: n/a

<!--
  Neo chống trôi:
    node tooling/gates.mjs --list --timing  → có dòng `PreToolUse <matcher>:` cho MỌI ô
    node tooling/test-hooks.mjs             → 238/238 + 1 n/a, sàn 239
-->

## Đợt 4 có hai mục. Mục ② giết mục ①.

Kế hoạch ghi: **②** đo độ trễ hook, rồi **①** gộp 7 guard thành một dispatcher, `−27ms`.
Thứ tự đó là đúng, và nó đã làm đúng việc của nó.

## Đo cái gì, và đo được gì

Ngân sách của repo chỉ nói về `Stop` và `SubagentStop`. Ô chạy **dày nhất** thì không ai đo:

```
PreToolUse  Write|Edit|NotebookEdit   ← 7 hook, 7 tiến trình Node, MỌI lần sửa file
```

Nó không nằm trong `config().gates`, nên vòng lặp `--timing` không bao giờ đi qua nó. Đúng lớp
khoảng-mù mà v2.81.0 vừa vá ở `entropy-scan` §9b: **một phép đo hiện hữu, đọc như thể nó phủ
hết, mà bỏ trống đúng phần dày nhất.**

## Con số, và vì sao ước lượng cũ sai

```
nối tiếp (tổng)   ~170ms
song song (tường)  ~43ms     ← cái người dùng THẬT SỰ trả
```

Vendor chạy các hook khớp cùng một ô **song song**. Bằng chứng không phải suy luận — nó nằm
sẵn trong `.claude/telemetry/hook-runs.log`:

```
2026-08-15T06:26:30.201Z  block-secrets
2026-08-15T06:26:30.202Z  block-generated-edit     ← cách 1ms
2026-08-15T06:26:30.215Z  protect-integration-branch
```

Mỗi hook chạy một mình tốn 22–29ms. Nếu nối tiếp, hai dòng đầu không thể cách nhau dưới 22ms.

Nên phép gộp mua được **~20ms tường**, và bán đi **7 chế độ hỏng độc lập**: một lỗi trong
dispatcher chung tắt cả bảy lớp gác cùng lúc (`lessons/0004` — gác hỏng thì phải chặn; ở đây
gác hỏng nghĩa là *bảy* gác hỏng). Không đáng, và lý do đó giờ nằm trong comment của
`hookTiming()` chứ không nằm trong một file kế hoạch mà không ai mở lại.

## Bản đầu của CHÍNH phép đo này sai, và sai về phía dễ chịu

Tôi viết `wall = max(per_hook)` — câu trả lời "đúng lý thuyết" cho song song. Số thật:

```
max(per) = 26ms     tường thật = 43ms     ← báo thấp hơn 40%
```

N tiến trình Node tranh CPU với nhau, và **sai số lớn dần theo số hook** — tức nó tệ nhất đúng
lúc cần nó nhất. Đó là `lessons/0005` (bộ đếm đổ về phía dễ chịu) ở chiều nguy hiểm: ngân sách
báo còn dư trong khi nó đã hết. Bản đang chạy đo bằng `Promise.all` thật, trung vị 3 lượt.

## Hai lần ca test của tôi bị chính repo sửa lưng

1. **Ca ② đòi một bất biến mà ở N=1 nó không có quyền đòi.** `wall ≥ max(per)` đỏ ngay ở ô
   `Bash|PowerShell` (1 hook): tường 23ms < hook 25ms. Ở N=1, song song = nối tiếp = chính hook
   đó, nên ba con số là **ba lần đo cùng một thứ** và chúng lệch vài ms vì nhiễu. Nới bằng một
   hằng số dung sai sẽ làm ca test yếu đi ở cả N≥2 — nên: khoanh đúng chỗ nó có sức (N≥2), và
   **nói ra** chỗ nó không có (`declareNa`), thay vì im lặng bỏ qua.

2. **Guard có sẵn bắt test mới của tôi.** Gọi `gates --list --timing` trên config THẬT thì ở
   repo tiêu thụ nó dựng dev server + trình duyệt cho `e2e`. `HARNESS_CONFIG: UNCONF()` là bắt
   buộc — và phần cần đo vẫn đo đủ, vì `PreToolUse` đọc `settings.json` chứ không đọc config.
   (`lessons/0003`: self-test giả định repo của nó.)

## BẰNG CHỨNG

`test-hooks` **238/238 + 1 n/a · sàn 239** · `test-lib` 62/62 · entropy-scan · doctor ·
`apply-to --audit` — exit 0.

| mutant | ca bị giết |
|---|---|
| ngân sách so với `g.serial` thay vì `g.wall` | `ngân sách PreToolUse KHÔNG so với g.wall` |
| `wall` quay lại `max(per)` | `wall không đến từ một lượt Promise.all` |
| bỏ một ô khỏi vòng lặp `hookTiming` | `không đo ô … nằm ngoài phép đo` |
| `wall` trả một hằng số nhỏ | `tường Xms < hook đắt nhất Yms` |

## KHÔNG LÀM, có lý do

- **Không gộp 7 guard thành dispatcher.** Toàn bộ lý do ở trên. Đây là mục ① của Đợt 4, và nó
  bị huỷ bởi số chứ không bởi ý kiến.
- **Không sửa bảng ngân sách trong `AGENTS.md`.** Vùng cấm — cần `/harness-propose`. Con số mới
  đã tới được người đọc qua chính lệnh mà `AGENTS.md` đang trỏ tới.
- **Không đo `PostToolUse`.** Nó có 1 hook và chạy SAU khi công việc xong, nên nó không nằm
  trên đường tới hạn của agent. Thêm nó vào bây giờ là đo cho đủ bảng, không phải đo để biết.
