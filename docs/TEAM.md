# Vai trò & nhịp làm việc

> **Harness không có chủ thì harness sẽ mục.** Điểm này bị bỏ qua nhiều nhất, và
> phần lớn conflict harness đến từ chỗ "ai cũng sửa được, không ai chịu trách nhiệm".

## Ba mức tổ chức

| Quy mô | Vai trò | Trách nhiệm |
|---|---|---|
| **2–10 người** | **DRI** — một người | Sở hữu cấu hình. Có **quyền quyết** về settings, permission, marketplace, quy ước AGENTS.md — **và có trách nhiệm giữ chúng còn ĐÚNG** |
| **10–50** | **Agent manager** — vai trò lai PM/engineer | Quản cả hệ sinh thái; thường nằm trong Developer Experience |
| **Lớn / có compliance** | **Working group liên chức năng** | Engineering + InfoSec + Governance. Bắt đầu từ tập skill đã duyệt, review bắt buộc, quyền hạn chế, rồi mở rộng khi lòng tin tăng |

**Đội ≤10 người: bạn cần ĐÚNG MỘT DRI, không cần hơn.** Nhưng bạn *thật sự cần* một người.

## Bốn quyết định DRI phải chốt trước ngày đầu

Chưa chốt bốn cái này thì mỗi thành viên sẽ tự chốt theo cách riêng, và bạn sẽ có
5 harness khác nhau trong một repo.

```
QĐ1. Branch strategy + merge policy   → chốt bằng branch protection
QĐ2. Ai sở hữu file nào trong .claude/ → chốt bằng CODEOWNERS
QĐ3. Hook viết bằng gì                 → chốt bằng một quy tắc: Node
QĐ4. WIP limit + trần song song        → chốt bằng CON SỐ trong harness.config.json
```

---

## Nhịp

| Nhịp | Ai | Việc | Thời lượng |
|---|---|---|---|
| hàng ngày | mọi người | `fixlog` khi phải sửa tay việc agent làm | 3 giây/lần |
| hàng ngày | DRI | merge queue có nghẽn? PR agent nào treo >24h? | 5 phút |
| 2 lần/tuần | team | **review capacity check**: PR đang mở / số người review được | 5 phút |
| thứ Sáu | DRI + 1 người | `/harness-retro` — **một đề xuất, một phản biện** | 30 phút |
| 2 tuần | DRI | `/entropy-sweep` + `harness-size.mjs` | 20 phút |
| đổi model | DRI | deprecation review + cập nhật `.claude/whats-new.md` cho team | 1 giờ |

**Vì sao `harness-retro` cần 2 người:** đề xuất harness của một người rất dễ là
**sở thích cá nhân được đóng gói thành "best practice"**. Người thứ hai không đồng
ý thì đề xuất không qua.

---

## Nhịp ngày của một team 4 người

```
09:00–09:15  STANDUP 15 PHÚT — đọc 3 THỨ, không kể chuyện:
             1. Merge queue: có PR nào chặn queue?      → sửa trước mọi việc khác
             2. PR mở > 24h: của ai, vì sao?             → chẻ hoặc đóng
             3. Vùng nóng hôm nay: ai chạm contract?     → thông báo trước
             (Cả ba đều là DASHBOARD, không phải báo cáo miệng)

09:15–09:30  CLAIM — /claim, tạo worktree, ghi reservation nếu chạm vùng nóng

09:30–12:00  BUILD — mỗi người 2 session:
             session 1 = task chính (model mạnh)
             session 2 = task phụ / test / docs (model rẻ hơn)

13:30–15:00  BUILD tiếp

15:00–16:00  ★ KHỐI REVIEW CHUNG — cả team review cùng giờ

16:00–17:00  Merge (auto-merge lo phần lớn) + dọn worktree + fixlog
             Nạp task dài cho agent tự trị chạy đêm (có cap + wall-clock)

Thứ Sáu 16:00  /harness-retro 30 phút
```

### Vì sao khối review chung

PR đang chờ review là **WIP chết**. Review rải rác cả ngày làm mọi người bị ngắt
liên tục **và** PR vẫn chờ lâu. Gom lại một giờ: ít ngắt hơn, chờ ngắn hơn, và
mọi người thấy code của nhau.

Điều cuối quan trọng **gấp đôi** khi phần lớn code do agent viết, vì
**hiểu biết chung về codebase không còn tự sinh ra từ việc gõ code.**

> Đây là đề xuất dựa trên lý thuyết cổ chai, **chưa có bằng chứng thực nghiệm rộng**.
> Nếu bạn thử, đo giúp: thời gian PR chờ review trước/sau, và cảm nhận của team về
> số lần bị ngắt.

---

## Lan kiến thức khi phần lớn code do agent viết

Rủi ro dài hạn ít ai bàn: nếu agent viết code, **con người mất kênh học codebase
truyền thống** (gõ tay). Ba cơ chế bù lại:

| Cơ chế | Cách làm | Lợi ích |
|---|---|---|
| **Review là lớp học** | khối review chung; reviewer khác domain với tác giả 1 lần/tuần | người học codebase qua đọc + hỏi |
| **Làm việc agent ở kênh công khai** | dispatch task qua channel team thay vì terminal riêng | người mới học *cách hỏi*, không chỉ học code. Ai cũng học nhanh hơn khi thấy prompt của người giỏi nhất trong team |
| **`docs/progress/<issue>.md`** | nhật ký quá trình đi cùng PR | reviewer thấy **vì sao**, không chỉ thấy **gì** |

## Onboarding người mới

Mục tiêu: `node tooling/init.mjs` và làm được việc ngay, không cần ai kèm.
Xem [onboarding.md](onboarding.md).

Hai cơ chế kèm theo:

- **Label `good-first-agent-task`** — luôn có 3–5 issue sẵn: scope hẹp, có test,
  không chạm contract
- **Cho agent tự viết bản nháp onboarding** — cho nó đọc repo + git log 3 tháng rồi
  sinh "day 1 guide", rồi bạn cắt. Nhanh hơn viết từ đầu và bắt được **những gì
  agent thấy là khó hiểu** — thường trùng với thứ người mới thấy khó hiểu
