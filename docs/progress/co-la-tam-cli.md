# Cờ lạ ở CLI ghi sổ — và con số 8 hoá ra là 29 (v2.78.0)

issue: **KHÔNG CÓ** — phát hiện rơi ra từ lô `v2.77.0`, khi tôi gõ `capo-report.mjs --help`.
owner: @thiengthb · branch: `fix/co-la-tam-cli` · worktree: gốc repo · platforms: n/a

<!--
  Neo chống trôi:
    node tooling/test-hooks.mjs                → 290/290, sàn 290
    node tooling/capo-report.mjs --help        → exit 0, KHÔNG ghi sổ
    node tooling/wt-clean.mjs --one            → exit 1 (cờ MA, tài liệu sai từ lâu)
-->

## Bug tự chứng minh trong lúc tôi đo một thứ khác

Ở lô trước tôi gõ `node tooling/capo-report.mjs --help` để xem cách dùng. Nó **chạy phép đo với
mặc định `--days 7` và ghi một mục vào sổ**. Rồi lệnh thật ngay sau đó:

```
node tooling/capo-report.mjs --days 30
  WARN kỳ trước đo trên cửa sổ 7 ngày, kỳ này 30 — KHÔNG so được
```

Một lần gõ nhầm: đổi cửa sổ đo, ghi vào sổ **mà nghi thức đọc**, và làm mất một kỳ dữ liệu xu
hướng. Không triệu chứng nào ở lúc gõ.

Đây là `fixlog` #198 (v2.72.0) ở một CLI khác — nhưng nặng hơn một bậc, và chỗ nặng hơn đáng
nói: ở đó cờ lạ ghi một dòng **sai**; ở đây nó ghi một dòng **đúng thể thức** về một phép đo
người dùng không yêu cầu. Không có gì trông sai để mà nghi.

Nguyên nhân chung: mọi CLI đọc cờ kiểu *"tìm cái tôi biết"* (`argv.indexOf`, `argv.includes`).
Kiểu đó **không có chỗ nào để một cờ lạ hạ cánh** — nó rơi thẳng vào nhánh mặc định.

## ĐÃ LÀM

`parseFlags` (thuần, trả `{unknown, help}`) + `guardFlags` (lớp mỏng: in rồi thoát). Luật:

- `--` chấm dứt phép quét (POSIX);
- token ngay sau cờ-có-giá-trị được bỏ qua — `--usd -5` là **giá trị**, không phải cờ lạ;
- `--days=30` bị coi là LẠ. Cải thiện, không phải hạn chế: không CLI nào ở đây đọc dạng `=`, nên
  hôm nay nó **im lặng** rơi về mặc định;
- `--help`/`-h` ⇒ liệt kê cờ, exit 0; cờ lạ đi kèm `--help` ⇒ vẫn exit 1.

**`fixlog.mjs` KHÔNG dùng chung, có chủ ý.** argv của nó là NỘI DUNG tự do, nên
`fixlog ghi chú về --force` phải đi lọt. Hai ngữ nghĩa khác nhau thì hai luật khác nhau — ghi ra
ở cả hai file kẻo có người "gom cho gọn".

## Con số 8 → 16 → 29, và vì sao phép kiểm phải là PHÉP QUÉT

Tôi đếm tay ba lần và sai hai lần:

| lần | cách đếm | kết quả | thứ bỏ sót |
|---|---|---|---|
| ① | `for f in tooling/*.mjs`, lọc "có ghi + có cờ" | **8** | mọi thứ ngoài `tooling/` |
| ② | quét rộng hơn, vẫn bằng tay | **16** | 9 file dùng `args = process.argv.slice(2)` |
| ③ | để SUITE quét | **29** | — |

Cái bỏ sót nặng nhất ở lần ① là `evals/run.mjs`: ngoài `tooling/`, **có ghi state**, và **CI chạy
nó**. Nếu tôi dừng ở "8 CLI" như tiêu đề công việc, lớp này coi như chưa vá.

Nên phép kiểm không phải một danh sách phải nhớ cập nhật — nó là một **phép quét**: mọi file đọc
`process.argv` phải gọi `guardFlags`. Sáu ngoại lệ đều KHAI LÝ DO tại chỗ (`fixlog` nội dung tự
do · `doctor.mjs` alias chuyển tiếp nguyên argv · `lib` là nơi định nghĩa · hai fixture · chính
suite này).

## MỘT LẦN TÔI CHỌN SAI TẦNG, và suite trừng phạt ngay

Bản test đầu của tôi spawn **cả 16 CLI × 2 chiều**. Suite đi từ ~25s lên **quá 500s và bị giết
hai lần**. Tôi suýt đọc đó là "chậm". Đo lại: nó **treo**, không chậm — `overlap-scan` gọi
`gh pr list`, `knowledge/consumers` đụng remote. Tức là tôi vừa kéo **mạng** vào suite tất định.

Bản vá chống-harness-cản-việc tự biến thành harness cản việc — đúng thứ `AGENTS.md`
§Verification đặt ngân sách 30 giây để chặn.

Chẻ hai tầng, và cần **cả hai**:

```
TĨNH   — mọi file đọc argv phải gọi guardFlags        → bắt "chưa cắm", O(ms), phủ 29/29
HÀNH VI— 4 CLI đại diện, spawn thật, hai chiều        → bắt "cắm rồi nhưng spec sai"
                                                        và "guard đặt SAU lần ghi đầu"
```

Bốn cái đại diện không phải mẫu ngẫu nhiên: `capo-report` (thiệt hại đo được) · `rituals` (guard
nằm TRONG khối main vì module bị import nơi khác) · `setup` (cái duy nhất ghi
`harness.config.json`) · `evals/run` (ngoài `tooling/`, và là cái tôi bỏ sót lần đếm đầu).

Suite sau khi chẻ: **12,55 giây**.

## Một phép đo của tôi vô nghĩa, và tôi suýt tin nó

Vòng lặp probe đầu tiên báo cả 8 CLI đều exit 1 **ở cả hai chiều** — kể cả đường thường. Suýt kết
luận "bản vá chặn quá tay". Thật ra: zsh **không tách từ** khi khai triển biến, nên
`set -- $spec; node "$f"` truyền cả chuỗi `"evals/run.mjs --dry"` làm TÊN FILE. Mọi dòng exit 1
chỉ là *"không tìm thấy file"*.

Cùng họ với lỗi `$?`-sau-ống-dẫn ở lô trước. Luật rút ra: **truyền đối số trực tiếp cho hàm
shell, đừng nhồi cả lệnh vào một biến rồi trông vào word-splitting** — nó khác nhau giữa
bash/zsh, và chế độ hỏng của nó đọc GIỐNG HỆT bug thật.

## BẰNG CHỨNG

Sàn **289 → 290** (`290/290 exit 0`) · doctor · harness-size · gates preMerge · precommit-scan
· knowledge/lint · entropy-scan · test-migrations · test-evals · apply-to --audit · evals —
**tất cả exit 0**.

| mutant | ca bị giết |
|---|---|
| `parseFlags` không quét (`unknown` luôn rỗng) | 4/12 ca thuần + `guardFlags` mã thoát |
| bỏ cửa thoát POSIX `--` | ca `[-- --nope]` |
| cờ-có-giá-trị không nhảy qua giá trị | ca `--days -5` và `--close --nope` |
| gỡ guard khỏi `capo-report` | tầng hành vi: `exit 0 ≠ 1` |
| gỡ guard khỏi `knowledge/export` | tầng tĩnh: nêu đúng tên file |
| mốc quét `process.argv` trôi | `chỉ thấy 0 CLI … sàn 24` |

Đo hai chiều trên **19 CLI** ngoài suite (offline được): cờ gõ nhầm ⇒ exit 1 kèm câu ở stderr;
đường thường ⇒ exit 0 như cũ. Mọi lời gọi tự động trong `.github/`, `.claude/hooks/`,
`.claude/settings.json` đều đối chiếu với spec — **không cái nào bị chặn oan**.

## Hai cờ MA lộ ra

Guard biến "im lặng không làm gì" thành "nói ra", và hai lệnh trong tài liệu của chính repo này
lộ là cờ chưa bao giờ tồn tại:

- `.claude/whats-new.md`: `upgrade.mjs --from <template>` → sửa thành `<template> --apply`.
- `.claude/learnings/2026-W32-…`: `wt-clean.mjs --one` → **để nguyên**. File learnings là bản ghi
  CÓ NGÀY của một lần học; sửa nó là viết lại lịch sử. Cờ đó nay tự báo khi ai gõ.

## KHÔNG LÀM, có lý do

- **Không đưa `fixlog` về dùng chung `parseFlags`** — xem trên.
- **Không guard `doctor.mjs`** — alias 2.x chuyển tiếp NGUYÊN argv sang `harness-doctor.mjs`, nơi
  đã có guard. Thêm ở đây là hai spec phải giữ đồng bộ, và cái thứ hai sẽ lệch.
- **Không đưa 29 CLI vào tầng hành vi** — xem §chọn sai tầng.
