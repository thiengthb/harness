# Nghi thức: con số phải khớp câu nói (v2.74.0)

issue: **KHÔNG CÓ** — ba defect đến từ việc dùng chính harness trong một phiên dài, không từ issue.
owner: @thiengthb · branch: `fix/nghi-thuc-so-khop-cau` · worktree: gốc repo · platforms: n/a

<!--
  Neo chống trôi:
    node tooling/test-hooks.mjs                          → 281/281, sàn 281
    node tooling/rituals.mjs --all | grep -E "handoff|promote"
    node tooling/harness-doctor.mjs | grep "skill NGƯỜI GÕ"
-->

## Vì sao ba cái này đi cùng một lô

Không phải vì tiện. Cả ba là **cùng một chế độ hỏng**: nghi thức nói ra một câu mà con số đằng
sau nó không nói.

```
① đếm FILE, câu nói "ứng viên promote"
② đo `ahead`, câu nói "sẽ mất khi đổi máy"
③ đếm lệnh NGƯỜI GÕ, câu nói "skill được dùng"
```

Không cái nào sai *về trạng thái*. Cả ba sai *về điều chúng dạy người đọc*. Tách ra thì cái thứ
ba đọc như chuyện vặt về chữ nghĩa; đứng cạnh nhau thì thấy đó là một lớp.

## ĐÃ LÀM

### ① `/knowledge-promote` — đếm ứng viên, không đếm file

`/harness-retro` **bắt buộc** ghi file vào `.claude/learnings/`, và mục này đếm file ở đó mới
hơn bài học mới nhất. Chạy đúng hai nghi thức theo đúng thứ tự ⇒ đèn đỏ y như lúc bắt đầu.
Ghi sổ 2026-08-05, còn nguyên tới 2026-08-13.

Cửa ra: `promote: <lý do>` trong frontmatter. **Mặc định vắng = vẫn là ứng viên** — 17 file
learnings hiện có không đổi hành vi. `promoteDeclined()` ở lib là hàm thuần, dùng
`parseFrontmatter` có sẵn chứ không viết parser thứ hai.

Dạy cửa đó ở ba chỗ nó được dùng: `_TEMPLATE.md`, `/harness-retro` bước 5, và số file đã khai
in ra trong `why` của mục xanh.

### ② `/handoff` — thêm đại lượng khớp với câu nói

`ahead` (chưa vào nhánh tích hợp) ≠ `unpushed` (chưa ở remote nào). Chỉ cái sau mới "biến mất
khi đổi máy". Đo được ngay trong phiên: sau khi push nhánh + mở PR #198, mục đỏ nói 2 commit
sắp mất trong khi cả 2 đang trên remote.

`git rev-list --count HEAD --not --remotes`, không dùng `@{upstream}..HEAD` — nhánh chưa có
upstream thì `@{u}` **ném lỗi**, mà đó đúng là ca cần đo nhất.

"Đã đẩy, chưa merge" **vẫn `due`**, chỉ đổi câu. Sửa lời nói dối, không tắt tín hiệu.

### ③ Bộ đếm skill — điểm mù phải đi kèm con số

`/entropy-sweep` đề xuất **bỏ** skill không được dùng, và dữ liệu duy nhất là sổ chỉ thấy lệnh
NGƯỜI GÕ. Đo trực tiếp: gọi qua công cụ `Skill` không tạo mục nào. Ở repo này **3/12 skill model
gọi được**.

Loại trừ trước khi kết luận: ô **có** đăng ký trong `settings.json`; `native-surface` xác nhận
sự kiện **có** trong binary (31 sự kiện, tập không đổi so với 2.1.228). Nên là ngữ nghĩa sự
kiện, không phải dây điện.

Đường **ghi** không vá được từ đây (`settings.json` + `observe.mjs` là vùng cấm ⇒
`/harness-propose`). Đường **đọc** thì vá được, và đã vá: `blindTo` đi kèm mọi lần đọc, doctor
in `skill NGƯỜI GÕ … (KHÔNG thấy: …)`, và `/entropy-sweep` đòi bằng chứng thứ hai.

## BẰNG CHỨNG

Sàn **276 → 281** · `281/281 exit 0` · doctor 0 · migrations 0 · evals 0 · gates 0.

Ba mutant, mỗi cái chỉ giết ca của chính nó:

| mutant | ca bị giết |
|---|---|
| `promoteDeclined` luôn `null` | 1/6 ca `promoteDeclined` |
| `atRisk` quay về `ahead` | `handoff`: *"commit ĐÃ ở trên remote mà vẫn bảo biến mất"* |
| bỏ `blindTo` | 2 ca `slotCounters` |

Ca ② dựng **hai trạng thái cùng `ahead: 2`, khác đúng ở `unpushed`**. Một ca thôi thì mutant
sống — đó là `L0007` áp vào chính lô này.

## MỘT LẦN TÔI SAI, ghi lại vì nó tốn một lượt

Thêm `unpushed` làm **3 ca test cũ chuyển sang `?`**, và tôi suýt đọc đó là "bản vá sai". Không
phải: `collect()` nay luôn trả khoá đó, nên fixture thiếu nó là fixture **cũ**, và nhánh `?`
đang hoạt động đúng như thiết kế (`null` = chưa đo ≠ bằng 0). Sửa fixture, không sửa code.

Nói cách khác: suite đỏ vì bản vá làm **đúng** việc nó hứa. Đọc nhầm chiều này một lần nữa thì
sẽ có người gỡ đúng phép kiểm `== null` mà ca ③ tồn tại để giữ.

## KHÔNG LÀM, có lý do

- **Không cắm `PreToolUse` để đếm skill model gọi.** Cần `settings.json` + `observe.mjs`, cả hai
  là vùng cấm ⇒ `/harness-propose`, tức việc của người. Ghi ra đây để nó không bị quên.
- **Không đụng 8 dòng rác của suite test trong `gate-fails.log`.** Đó là viết lại bằng chứng, và
  nghi thức tiêu thụ nó đã được `--close` kèm lý do.
