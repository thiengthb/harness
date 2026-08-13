# `budget.plan` rò xuống consumer và TẮT phép so trần (v2.77.0)

issue: **KHÔNG CÓ** — phát hiện từ `git status` của một cây làm việc bị bỏ lại, không từ issue.
owner: @thiengthb · branch: `fix/plan-thua-ke-tat-tran` · worktree: gốc repo · platforms: n/a

<!--
  Neo chống trôi:
    node tooling/test-hooks.mjs                              → 286/286, sàn 285
    node tooling/rituals.mjs --all | grep capo-report
    node tooling/harness-doctor.mjs | grep -A2 'NGÂN SÁCH'
-->

## Nó bắt đầu từ một file sửa dở, không từ một cái test đỏ

Cây gốc còn một file chưa commit từ phiên trước (2026-08-13 09:50): `harness.config.json`,
`budget.plan` đổi `metered` → `flat`. Một dòng.

Loại trừ trước khi đi tiếp — vì "gác có lỗ" là kết luận đắt:

```
gác còn sống?   → bơm payload Edit thẳng vào protect-harness.mjs   ⇒ exit 2, chặn đúng
có trong sổ?    → harness-edits.log dòng cuối là 2026-08-05        ⇒ KHÔNG có dòng nào 09:50
```

Nên: **sửa tay trong editor**, không đi qua tool, nên hook không thấy và sổ không có. Đó là
GIỚI HẠN của sổ, không phải lỗ của gác — và đáng ghi ra, kẻo lần sau có người đọc
`harness-edits.log` như một sổ đầy đủ.

## Vì sao một dòng config đáng một bản vá

`apply-to.mjs:48` chép `harness.config.json` xuống **mọi consumer**. Field bên cạnh
(`monthlyUsdCap`) đã có gác cho đúng đường đó — `template-cap`, #92. `budget.plan` thì không có
gác nào. Và nó rò **nặng hơn**:

```
consumer · cap $50 · chi thật $500/30 ngày

  plan metered         →  over, 1000%              ← gác nổ
  plan flat (thừa kế)  →  flat-limited, percent=null   ← cap không so với gì cả
```

Cap sai mang theo một con số sai. `plan` sai **tắt hẳn phép so** — trên đúng cái lớp
`docs/ECONOMICS.md` gọi là *"lớp duy nhất gây thiệt hại tài chính TRỰC TIẾP"*.

Và `setup.mjs` **không hỏi** `plan`. Field này không có bên ghi nào: đường duy nhất nó vào config
là sửa tay — tức đúng con đường mà sổ không nhìn thấy.

## ĐÃ LÀM

### Gác `template-plan` — phân biệt theo NGUỒN, không theo giá trị

`configPlan` (thô, từ config) đi cạnh `plan` (đã hợp nhất với env) vào `budgetStatus`.

| vai | khai ở | kết quả |
|---|---|---|
| template | config | `template-plan` ⇒ `due` |
| template | env (`HARNESS_BUDGET_PLAN`) | đo bình thường |
| consumer | config | đo bình thường |
| template | cả cap lẫn plan | `template-cap` — cap kêu trước |

Hai hàng đầu là cả bản vá: **cùng một `plan: 'flat'` đã hợp nhất, hai kết quả khác nhau.** Một
hàng thôi thì mutant *"kêu bất kể nguồn"* sống — và nó sống theo chiều bắn nhầm vào người khai
đúng (`L0007` + `L0002`).

Vai `consumer` không kêu là **chủ ý**: ở đó `plan` không chảy đi đâu nữa, và một repo solo khai
gói của chính mình trong config là hợp lệ. Kêu ở đó là kêu vào 99% ca đúng.

### Dọn cái đã sinh ra phát hiện — giữ ý định, đổi chỗ khai

`$comment_plan` đã nói đúng chỗ từ trước: gói cước là thuộc tính của **người trả tiền**. Nên
`HARNESS_BUDGET_PLAN=flat` vào `.claude/settings.local.json` (gitignored, theo máy), rồi mới trả
`harness.config.json` về `metered`. Thứ tự đó có lý do: đảo lại thì có một khoảng nghi thức đọc
sai gói và đòi `--usd`.

Env sống ngay, không cần khởi động lại — đo được.

## THỨ TÌM RA KHI MUTATION-TEST BẢN VÁ TRÊN, và nó lớn hơn bản vá

Năm mutant. Hai cái đầu chết ngay. **Hai cái sau KHÔNG chết:**

| mutant | kết quả đầu |
|---|---|
| `rituals` bỏ nhánh `template-plan` | suite **XANH** |
| `harness-doctor` bỏ dòng hiển thị | suite **XANH** |

Đúng cái bẫy đã tốn tôi một lượt sáng nay, nên kiểm trước khi kết luận: **mutant có được dựng
lên không?** Có — `rg -c` xác nhận cả hai lần. Nên cái mù là **test**.

`MODES` — danh sách mà hai ca *"doctor có đủ dòng"* và *"rituals phân nhánh đủ"* đối chiếu — là
một **mảng khai tay 12 phần tử**. Mode thứ 13 vào codebase với **đúng 0 coverage**, trong khi hai
ca vẫn xanh và vẫn in một con số đọc như độ phủ: *"đủ 11 mode"*.

Đây là `v2.74.0` lần nữa (con số không khớp câu nói), ở dạng nguy hiểm hơn: ở đó con số nói sai
về **trạng thái**; ở đây nó nói sai về **chính độ phủ của phép kiểm**.

Nay `MODES` bóc từ nguồn `budgetStatus` bằng regex trên `mode: '…'`, kèm **sàn 13**. Sàn không
phải cho chắc: `MODES` rỗng làm **cả hai** ca `filter(...).length === 0` ⇒ xanh vô căn cứ. Sai
theo chiều dễ chịu, `L0005`. Mutant M5 (đổi mốc bóc) xác nhận sàn bắt được.

## BẰNG CHỨNG

Sàn **284 → 286** (`286/286 exit 0`) · doctor 0 · `test-evals` 0 · evals 0 · harness-size 0.

**Một bản ghi cũ phải sửa lại.** Progress doc của `v2.76.0` ghi *"evals 0"*. Sai: tôi đọc mã
thoát qua một ống dẫn (`node evals/run.mjs | tail; echo $?` trả mã thoát của `tail`), nên con số
0 đó là của `tail`. Đo lại không qua ống dẫn: **exit 1**, và đỏ từ trước lô này — xem mục dưới.

Đo end-to-end **trên đúng trạng thái đã gây ra phát hiện** (trước khi dọn file bẩn), cả hai bên
đọc đều nổ:

```
rituals  →  FAIL  budget.plan = "flat" nằm trong REPO TEMPLATE … TẮT phép so trần
doctor   →  ⚠️     budget.plan = "flat" nằm trong REPO TEMPLATE …
```

Cùng trạng thái đó, **trước** bản vá, đọc thành `flat-limited` — *"8 lần chạm rate limit"*. Nghe
như vấn đề mức dùng, và không một chữ nào nói rằng config đang sai.

| mutant | ca bị giết |
|---|---|
| `templateLeak` bỏ nhánh `configPlan` | 2/12 ca gói phẳng (`template-plan` × 2) |
| gác đọc `plan` đã hợp nhất | 2/12 — kêu vào ca khai bằng **env** |
| `rituals` bỏ nhánh | `rituals capo-report không phân nhánh cho mode: template-plan` |
| `doctor` bỏ dòng | `harness-doctor thiếu dòng cho mode: template-plan` |
| mốc bóc `MODES` trôi | `chỉ bóc được 0 mode … sàn 13` |

## Đèn đỏ cuối cùng của bảng, và nó không cần dashboard

`capo-report` đỏ suốt phiên trước với câu *"cần `--usd` từ dashboard billing"*. Sau khi gói được
khai đúng chỗ, nó đọc là gói phẳng — nơi mẫu số là **lần chạm trần**, harness tự đếm:

```
CAPO-TRẦN = 0.05 lần chạm trần / kết quả được chấp nhận (8 lần · 151 kết quả · 30 ngày)
```

Bảng nghi thức: **hết đỏ**.

## ĐIỀU KIỆN TIÊN QUYẾT: bộ eval đỏ sẵn, vì chính nó hỏng

Không thuộc mục đích của PR này, nhưng không có nó thì không ra được dòng "evals 0" ở trên —
nên nó đi cùng, ở commit riêng.

Đo trên `main` sạch (`c534fc8`), một cây worktree tạm: eval `0007` `import('./tooling/lib/harness.mjs')`
rồi gọi `m.mergeBaseline`. Hàm đó ở `tooling/rituals.mjs`, và **chưa bao giờ** ở lib —
`git log -S 'export function mergeBaseline' -- tooling/lib/harness.mjs` trả về **rỗng**. Nên:

```
TypeError: m.mergeBaseline is not a function
  ⇒ cả assertion chết  ⇒  ✗ EVAL — 1 FAIL, exit 1
```

Task `0007` chấm *"agent có viết ca cho CHIỀU CÒN LẠI không"*. Một crash làm nó đo một thứ khác
hẳn — và đọc từ ngoài thì **không phân biệt được** với "agent làm sai".

Vì sao không ai thấy: CI chạy `evals/run.mjs --dry`. Đúng — chiều thật cần mạng và agent thật.
Nhưng hệ quả là assertion **không bao giờ được thực thi ở CI**, nên một assertion trỏ sai module
là vô hình vĩnh viễn ở tầng duy nhất chạy mỗi PR.

Vá ở chỗ CI **có** chạy: `test-evals.mjs ㉜` đối chiếu tĩnh mọi `m.NAME(` với export thật của
module được import — **20 lời gọi**, sàn 10. Mutant M6 (trả `0007` về module sai) bị giết kèm
đúng tên hàm và đúng tên file.

Đây là `AGENTS.md` §Verification ở dạng nguyên bản: *"ưu tiên computational control trước
inferential control"*. "Tên này có được export không" là câu hỏi tất định — đừng để nó chờ một
lần chạy có mạng mới trả lời.

## KHÔNG LÀM, có lý do

- **`capo-report.mjs --help` không phải cờ** — nó chạy với mặc định 7 ngày **và ghi sổ**. Tự
  chứng minh: lần chạy đó làm kỳ đo sau in `WARN … KHÔNG so được`. Cùng lớp lỗi `fixlog`
  v2.72.0, nhưng ở đây có hậu quả **ghi state mà nghi thức đọc**. Đo breadth: **8 CLI** trong
  `tooling/` vừa nhận cờ vừa ghi sổ mà không từ chối cờ lạ. Là PR riêng — một PR một mục đích.
- **Không kêu ở vai `consumer`** — xem trên.
- **Không sửa câu trong AGENTS.md về `harness-edits.log`** ("mọi lần ghi vùng cấm tự vào sổ").
  Sổ chỉ thấy lệnh qua tool; sửa tay thì không. Câu đó rộng hơn cơ chế, nhưng `AGENTS.md` là
  vùng cấm ⇒ `/harness-propose`.
