# 2026-W32 — Luật "đừng sửa file trên nhánh tích hợp" được viết ở 2 chỗ, không chỗ nào cưỡng chế

> **ĐỀ XUẤT, chưa sửa.** Cần `.claude/hooks/` + `.claude/settings.json` — cả hai trong
> `paths.harness`, nên đây là đường hợp pháp.

## Triệu chứng

Luật đã được viết ra **hai lần**, rõ ràng, ở hai artefact người-đọc-đầu-tiên:

- `AGENTS.md` §"Làm việc trong repo dùng chung": *"**Một issue = một nhánh = một worktree.**"*
- `/claim` bước 1: *"Đang ở nhánh `main`? → **dừng, tạo nhánh trước khi sửa gì.**"*

**Không có gì cưỡng chế nó.** Sửa file trên nhánh tích hợp đi qua trơn tru, không một
dòng cảnh báo.

## Lần xuất hiện — cùng một agent, cùng một ngày, hai lần

- **2026-08-06**, trước commit `8634ecc` (PR #41) — sửa `tooling/lib/harness.mjs`
  (hàm `repoRole`) khi đang ở `main`, rồi mới `git checkout -b fix/khong-mang-lich-su-…`.
  Thay đổi "đi theo" sang nhánh mới dưới dạng file chưa commit.
- **2026-08-06**, trước commit `2cb7e1e` (PR #42) — tạo `tooling/overlap-scan.mjs` và sửa
  4 file khác khi đang ở `main`, rồi mới `git checkout -b feat/goi-y-skill-nguoi-goi`.

Bằng chứng: `git reflog` — hai dòng `checkout: moving from main to <nhánh>` xảy ra **sau**
khi cây làm việc đã bẩn.

Lần này **may**: cả hai lần tôi tự nhớ ra và tạo nhánh trước khi commit. Chế độ hỏng thật
là lần **không** nhớ — và lúc đó nó là một commit thẳng lên nhánh tích hợp, hoặc tệ hơn,
một `git add -A` cuốn theo file của phiên khác. Đúng sự cố `sakubun` mà `rituals.mjs` đã
ghi trong header của nó: *"hai phiên song song cùng commit lên một nhánh, và một `git add -A`
cuốn theo file sản phẩm của phiên kia."*

**Lớp lỗi:** state

## Vì sao đây là chỗ đúng để cưỡng chế

Đây cũng là câu trả lời cho yêu cầu *"cơ chế tự hiểu"* mà DRI nêu 2026-08-06: làm sao
harness biết một việc đang bắt đầu, mà không cần đoán ý định từ câu chữ.

Câu trả lời: **đừng đoán ý định — bắn theo HÀNH ĐỘNG.** "Ghi file đầu tiên trên nhánh
tích hợp" là một sự kiện **tất định**, quan sát được, và nó xảy ra **đúng khoảnh khắc** một
việc thật sự bắt đầu. Không cần phân loại "người dùng vừa nói thêm tính năng hay chỉ đang
hỏi" — phép phân loại đó là inferential control, thứ `AGENTS.md` bảo phải hỏi
*"có biến thành check tất định được không?"* trước khi dùng. Ở đây **có**.

## Dạng biểu diễn đề xuất

Chọn: **`3` (computational control — hook `PreToolUse` trên `Write|Edit`)**

**Vì sao không dùng dạng rẻ hơn:**

- **`1` test/contract** — không áp dụng được. Không có "hành vi đúng" nào để test hoá; đây
  là một sự kiện lúc chạy, không phải một tính chất của code.
- **`2` generator** — không áp dụng.
- **`5` gotcha 1 dòng trong AGENTS.md** — **đã có, và đã thất bại**. Đó chính là bằng
  chứng ở trên: luật nằm sẵn ở AGENTS.md *và* `/claim`, và vẫn bị vi phạm hai lần trong
  một ngày bởi một agent đã đọc cả hai. Thêm một dòng thứ ba là làm đúng thứ mà
  `rituals.mjs` đã đo là không hiệu quả (*"một nhắc nhở nói mọi thứ ở mọi lúc thì không nói
  gì ở lúc nào"*).

**Hình dạng đề nghị** (chi tiết thuộc về người thi hành):

- Chặn `Write|Edit` khi `currentBranch() === integrationBranch`, kèm thông điệp nêu **cách
  đi tiếp** (`/claim`, hoặc `git checkout -b <type>/<issue>-<slug>`) — không chỉ nêu lỗi.
- **Cửa thoát bắt buộc, có ghi log**: sửa tài liệu/changelog thẳng trên nhánh tích hợp là
  việc hợp lệ và hay gặp. Không có cửa thoát thì người ta tắt hook, và lúc đó ta mất cả
  guard lẫn tín hiệu. Ghi `telemetry('gate-fails', …)` cho **cả** lần chặn lẫn lần dùng
  cửa thoát — nếu cửa thoát bị dùng mọi lúc thì guard sai, và số đo phải nói ra điều đó.
- `declareFailMode(2, …)` — nó thuộc nhóm "lịch sử chung", fail-CLOSED (v2.12.0).

**Tầng:** project · **Scope:** `universal` — mọi repo dùng nhánh tích hợp đều cần.

**Đặt ở tầng nào của thang độ trễ:** `PreToolUse` — rẻ (một lệnh `git branch --show-current`),
và **phải** ở đây: mọi tầng chậm hơn (pre-commit, CI) chỉ biết **sau khi** file đã bị sửa,
tức sau khi thiệt hại phối hợp đã xảy ra.

**Chi phí bảo trì dự kiến:** thấp — không có bảng pattern nào phải nuôi.

**ĐIỀU KIỆN THOÁT:** khi `reservations/` và `docs/progress/` cho thấy `/claim` đã thành thói
quen (≥5 lần dùng thật), guard này chuyển từ *chặn* sang *nhắc*. Và nếu telemetry cho thấy
cửa thoát bị dùng nhiều hơn nhánh chặn, **guard sai — cắt nó**, đừng nới nó.

---

## Rider — KHÔNG phải đề xuất, chỉ là một dòng cấu hình bị khoá

`harness.config.json → paths.ui` hiện **không tồn tại**. Đó là điều kiện cần để `/verify-ui`
có nghi thức nhắc: trigger sẽ là *"diff chạm `paths.ui` mà chưa có ảnh bằng chứng mới hơn
commit cuối"* — cùng phép so hai mốc đã dựng cho `/pre-merge` ở v2.13.0.

Mục này **không đạt ngưỡng ≥2 lần** và tôi không giả vờ là nó đạt: không có sự cố nào cả.
Nó chỉ là một khoá cần mở, và `harness.config.json` thì chỉ DRI mở được. Đưa vào đây để nó
đi cùng một lần duyệt thay vì phải mở cửa hai lần.

Sau khi có `paths.ui`, phần nghi thức trong `tooling/rituals.mjs` tôi làm được — không cần
đề xuất riêng.
