# 2026-W32 — Gác CHẶN mà không ghi sổ thì bị chọn lọc NGƯỢC

> **ĐÃ SỬA TRỌN VẸN ở 2.17.0** — và không cần DRI, không chạm vùng cấm.
> Bản nháp đầu của mục này đề xuất một *ratchet đếm số hook quên ghi sổ*. Đó là giải pháp sai
> tầng: nó đo mức tuân thủ một quy ước thay vì làm quy ước ấy thành không-thể-quên. Chỗ sửa
> đúng là `block()` ở `tooling/lib/harness.mjs` — **không** thuộc `paths.harness`.
>
> Giữ lại đoạn đó trong mục này (mục "Dạng biểu diễn") vì bước từ *ratchet* sang *sửa tại
> nguồn* mới là bài học, không phải kết quả.

## Triệu chứng

`protect-feature-files.mjs` chặn thật, nhưng `harness-doctor` đọc nó là `? chưa đo`:

```
✓ protect-feature-files.mjs    PreToolUse    chặn được    ? chưa đo
```

Không phải "chưa chạy suite" — suite VỪA chạy trong chính lần doctor đó, và MUTANT test cho hook
này PASS. Nguyên nhân đo được:

```
node -e "<quét mọi lời gọi block() trong .claude/hooks/>"   # 2026-08-06
  8/9  lời gọi block() có telemetry('gate-fails', …) ngay trước
  1/9  KHÔNG —  protect-feature-files.mjs:18
```

Dòng 18 là nhánh `features/_index.json` — **gác single-writer của DRI**, tức nhánh quan trọng
nhất của file. Nhánh còn lại của CHÍNH file đó (dòng 31) thì có ghi sổ. Nên đây không phải một
quy ước chưa tồn tại: nó tồn tại, được tuân thủ 8/9 lần, và trượt đúng một chỗ.

## Vì sao nó nguy hiểm hơn một gác không chạy

Một gác **không chạy** thì sớm muộn có người phát hiện vì nó không chặn. Một gác **chặn mà im**
thì chặn đúng, không ai phàn nàn, và mọi bảng đo đều đọc nó là *chưa bao giờ bắt được gì*.

`/harness-retro` bước 4 **bắt buộc đề xuất cắt bỏ**. Nguyên liệu nó dùng là telemetry. Nên:

> **Gác càng đúng mà càng im thì càng dễ bị cắt.** Đó là chọn lọc ngược — cơ chế dọn rác của
> harness ăn đúng những cái gác đang làm việc lặng lẽ.

Đây là ca thứ hai cùng hình dạng trong một tuần, và cả hai đều ở bước 4 của retro:

| | bộ đếm nói gì | sự thật |
|---|---|---|
| `dcg.mjs` | `301 qua · 3 chặn` ⇒ gác hiệu quả nhất repo | cả 3 lần chặn đều là **chặn nhầm** |
| `protect-feature-files.mjs` | `? chưa đo` ⇒ chưa bắt được gì | nó chặn, chỉ là **không ghi sổ** |

Hai hướng ngược nhau, cùng một gốc rễ: **telemetry không phân biệt được các trạng thái mà quyết
định cắt/giữ phụ thuộc vào.** Ở `dcg` là *bắt đúng* vs *bắt nhầm*; ở đây là *không chặn* vs
*chặn mà im*.

## Lần xuất hiện

- **2026-08-06** — fixlog: `protect-feature-files chặn features/_index.json mà không gọi
  telemetry('gate-fails') trước block() — gác chặn thật nhưng vô hình`.
- **2026-08-06** — `harness-doctor` mục "Nên làm" độc lập chỉ ra cùng file, kèm lý do khác
  (không có dòng nào ở CẢ telemetry thật LẪN telemetry của suite).
- **2026-08-06** — quét toàn bộ `.claude/hooks/`: 1/9 lời gọi `block()` không ghi sổ, và đó
  đúng là file trên.

> **NÓI THẲNG:** ba mục trên là **một lần quan sát nhìn từ ba phía**, không phải ba lần độc lập.
> Ngưỡng ≥2 tồn tại để chặn lạm phát rule từ những bực mình một lần — đây không phải bực mình,
> đây là một bất biến 8/9 kèm chỗ trượt có toạ độ. Cùng lập luận đã dùng ở
> [[2026-W32-dcg-khop-chuoi-khong-khop-lenh]]; DRI quyết.

## Dạng biểu diễn — và một bước đi SAI đáng ghi lại

**Nháp đầu (đã bỏ):** dạng `1` (test/contract) — quét văn bản mọi lời gọi `block()` trong
`.claude/hooks/**`, đòi có `telemetry('gate-fails', …)` gần đó, và đặt **RATCHET = 1** cho chỗ
đang trượt. Lập luận khi ấy: `.claude/hooks/**` thuộc `paths.harness`, nên agent không sửa được
hook, nên đóng *phần đo được* — đúng cách #46 đóng phần đo được của #43.

**Vì sao nó SAI.** Lập luận đó đúng về vùng cấm nhưng sai về **chỗ hỏng**. Quy ước "nhớ ghi sổ
trước khi chặn" trượt 1/9 lần *vì nó là một thứ phải nhớ*. Một ratchet đếm số lần quên không
làm ai bớt quên — nó chỉ làm việc quên **hiện ra**, và vẫn cần một người sửa tay từng chỗ, mãi
mãi, mỗi lần thêm hook mới.

Câu hỏi đáng hỏi không phải *"làm sao đo được ai quên"* mà **"làm sao không còn gì để quên"**.

**Đã chọn: sửa tại nguồn.** `block()` ở `tooling/lib/harness.mjs` tự ghi `gate-fails` kèm tên
gác (suy từ `argv[1]`), và **im nếu chỗ gọi đã tự ghi** — 8/9 hook hiện tại ghi kèm chi tiết mà
chỉ chúng biết (issue nào, nhánh nào), và ghi đè lên đó sẽ làm mọi bộ đếm *"n lần chặn"* sai gấp
đôi. Sau bản vá, **không còn cách nào viết ra một gác câm**, kể cả hook viết sau này.

Và `tooling/lib/` **không** thuộc `paths.harness` — nên toàn bộ việc này làm được mà không cần
DRI. Giả định "phải là DRI" đến từ việc thấy triệu chứng ở một file trong vùng cấm, chứ không
từ việc kiểm nguyên nhân nằm ở đâu. **Kiểm nguyên nhân nằm ở file nào trước khi kết luận cần
quyền gì.**

Test đi kèm khẳng định **hành vi**, không quét văn bản — quét văn bản chỉ đo được "ai nhớ gọi",
mà sau bản vá thì không còn ai cần nhớ:

1. `block()` một mình ⇒ đúng 1 dòng `gate-fails`, có tên gác.
2. Chỗ gọi đã tự ghi ⇒ `block()` im, vẫn đúng 1 dòng, giữ chi tiết riêng của hook.
3. Ca thật: `features/_index.json` ⇒ exit 2 **và** có dòng mang tên `protect-feature-files`.

**Lớp lỗi:** verification

**Tầng:** project (bài học thì `universal`)

**Scope:** `universal` — *"xoá repo này thì mục này còn giá trị không?"* → **còn**.
"Một cái gác không ghi lại việc nó đã chặn sẽ bị cơ chế dọn rác đọc là vô dụng, và bị cắt trước
những cái gác ồn ào hơn" đúng với mọi hệ có gác + có nghi thức cắt bỏ.

**Đặt ở tầng nào của thang độ trễ:** `test-hooks.mjs` — quét tĩnh 9 file, ~vài mili giây.
Không đặt được ở tầng nhanh hơn vì nó phải đọc toàn bộ thư mục hook.

**Chi phí bảo trì:** rất thấp. Không có ratchet để nới, không có cửa sổ dòng để chỉnh, không có
danh sách hook để cập nhật khi thêm hook mới.

**ĐIỀU KIỆN THOÁT:** khi `telemetry` phân biệt được *chặn đúng* với *chặn nhầm* — hôm nay nó
**không**, và đó là lỗ hổng còn lại của cùng lớp vấn đề (xem #43: `dcg` có `3 chặn`, cả 3 đều là
chặn NHẦM, và bộ đếm ghi chúng y hệt một lần bắt đúng). Lúc có được phân biệt đó, ba test hành
vi ở đây nên được viết lại quanh trục mới thay vì giữ nguyên. Trước mốc đó thì đừng thêm bộ đếm
nào nữa cho cùng hình dạng — sẽ lại là đếm sai một thứ đã đếm sai.

---

## Đề xuất CẮT BỎ

- [ ] Không có. Bản vá này **xoá bớt** thứ phải nhớ thay vì thêm; nó không tạo ra bề mặt mới
      nào để sau này phải cắt.
- [ ] Nhưng ghi lại một cảnh báo cho chính tôi: phản xạ đầu tiên là **đếm** vấn đề (ratchet),
      không phải **xoá** nó. Ratchet là công cụ đúng khi chỗ hỏng nằm ngoài tầm với — và
      "ngoài tầm với" phải được KIỂM, không được giả định từ chỗ triệu chứng xuất hiện.
