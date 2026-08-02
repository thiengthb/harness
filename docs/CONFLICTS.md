# Năm loại conflict — và loại tệ nhất không phải loại git bắt được

Sai lầm nhận thức lớn nhất khi một team bắt đầu dùng agent chung: coi "conflict"
là chuyện của git.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. CONFLICT CODE            hai agent sửa cùng file / cùng vùng             │
│    → git BÁO. Bạn thấy được. Đây là loại DỄ NHẤT.                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. CONFLICT NGỮ NGHĨA       merge sạch nhưng KHÔNG COMPILE / sai hành vi    │
│    A đổi signature, B thêm callsite → merge OK, build vỡ trên main          │
│    → git KHÔNG BÁO. Đây là loại NGUY HIỂM NHẤT.                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. CONFLICT HARNESS         5 người cùng sửa AGENTS.md / settings.json      │
│    rule của A làm agent của B hành xử khác → không ai hiểu tại sao          │
│    → không công cụ nào báo. Loại BỊ BỎ QUA NHIỀU NHẤT.                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. CONFLICT TÀI NGUYÊN      quota, rate limit, CI runner, port, DB, thiết bị│
│    → hiện ra dưới dạng "hôm nay agent chậm/lỗi", bị chẩn đoán sai           │
├─────────────────────────────────────────────────────────────────────────────┤
│ 5. CONFLICT MÔI TRƯỜNG      Windows vs Ubuntu vs macOS                      │
│    hook chạy máy A không chạy máy B; CRLF; đường dẫn; case-sensitivity      │
│    → "chạy trên máy tôi thì được"                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Thứ tự ưu tiên phòng chống

Trực giác nói: chống conflict code trước. **Sai.** Thứ tự đúng theo tỉ lệ đau/chi phí:

| Hạng | Loại | Vì sao lên trước | Cơ chế rẻ nhất | Ở đâu trong repo |
|---|---|---|---|---|
| 1 | **Ngữ nghĩa (2)** | lọt qua mọi review bằng mắt và vỡ trên main | contract + typecheck toàn repo trong **merge queue** | `gates.preMerge`, `.github/workflows/ci.yml` |
| 2 | **Môi trường (5)** | làm harness của team *không tồn tại* với một nửa thành viên | hook viết bằng **Node**, không bash | `.claude/hooks/*.mjs`, `harness-parity.yml` |
| 3 | **Harness (3)** | phá lòng tin: "agent hôm nay lạ lắm" | ownership matrix + CODEOWNERS cho `.claude/` | `.github/CODEOWNERS`, `protect-harness.mjs` |
| 4 | **Code (1)** | đau nhưng thấy được, và ~4/5 cặp song song không conflict | partition theo quyền sở hữu file | `worktree.sparsePaths`, `reservations/` |
| 5 | **Tài nguyên (4)** | đau nhưng chẩn đoán được khi biết cần tìm gì | WIP limit + budget per-người | `docs/WIP.md` |

## Nguyên lý gốc

> **Agent không có nhận thức về workspace chung.** Mỗi agent hoạt động độc lập và
> cô lập, không biết có agent khác đang đọc và sửa đúng những file đó. Không có
> lock và không có protocol giao tiếp nào ngăn hai agent sửa cùng một vùng code.

Nghĩa là **mọi cơ chế phòng chống đều là cách khôi phục lại nhận thức mà agent
thiếu** — bằng một trong hai đường:

```
(a) TÁCH VÙNG SỬA của các agent ra   → partition, sparse worktree, ownership
(b) LÀM CHO thay đổi của A LANDING TRƯỚC khi B bắt đầu
                                     → merge queue, nhánh ngắn, serialize
```

**Không có đường thứ ba.** Mọi pattern chống conflict đều là biến thể của (a) hoặc (b).

## Đừng chống quá mức

Dữ liệu (33.596 PR do agent viết, 2.807 repo):

| | Tỉ lệ |
|---|---|
| repo có cặp PR agent co-active (chồng thời gian chính xác) | **40,2%** |
| — nới cửa sổ 1 tuần | 53,4% |
| cặp co-active **cùng một loại agent** có conflict văn bản | **19,8%** (CI 95%: 16,8–23,2%) |
| cặp co-active **khác vendor** | **41,7%** (CI 95%: 33,1–50,9%) |
| file conflict là **source code** (người phải giải) | 84,4% |
| conflict **cấu trúc** (modify/delete 26,8% + add/add 15,1%) | ~42% |

Ba điều rút ra:

1. **~4/5 cặp song song KHÔNG conflict gì cả.** Phản ứng sai phổ biến nhất là
   thấy 20% rồi đi serialize hết mọi thứ, ném đi toàn bộ throughput song song để
   tránh một chi phí *xác suất, và người giải quyết được*.
2. **Trộn vendor làm tỉ lệ conflict tăng ~gấp đôi** — vì các sản phẩm khác nhau áp
   format, cấu trúc, quy ước khác nhau → vùng edit rộng ra mỗi khi chạm cùng file.
   → **Chuẩn hoá MỘT agent cho một repo.** Cho phép khác nhau ở tầng cá nhân
   (editor, keybinding) nhưng thống nhất agent chính.
3. Đây **chỉ là conflict văn bản** — giới hạn dưới bảo thủ. Conflict build và
   conflict ngữ nghĩa **không được đo**. Ma sát thật cao hơn.

## Coordination Ladder — leo từng bậc, dừng ở bậc đủ

```
BẬC 0 — ĐO co-activity          node tooling/coactivity.mjs
        Hiếm → DỪNG. Máy móc phối hợp là overhead thuần.

BẬC 1 — PARTITION THEO QUYỀN SỞ HỮU FILE          ← RẺ NHẤT, mạnh nhất
        Mỗi người/agent một thư mục rời nhau. Song song giữ nguyên 100%.
        Cưỡng chế ở tầng filesystem: worktree.sparsePaths

BẬC 2 — CÁCH LY + ĐẶT CHỖ
        Khi buộc phải chạm vùng chung:
        worktree riêng + advisory reservation có TTL + pre-commit guard
        (reservations/ + tooling/check-reservations.mjs)

BẬC 3 — SERIALIZE — chỉ cho trường hợp không tách được
        Dispatch 1 agent → chờ merge → dispatch tiếp.
        Dành cho: refactor rộng, đổi contract lớn.
        BẬC CUỐI vì nó đánh đổi chính cái throughput làm bạn fan-out.
```

**Khi ladder là SAI (đừng thêm máy móc):**

- Volume thấp — repo ít khi có 2 agent cùng lúc
- Đã có quyền sở hữu file rời nhau — thêm serialize chỉ làm chậm
- **Merge cadence nhanh** — nhánh ngắn + auto-merge tự co cửa sổ chồng lấn xuống
- Một vendor duy nhất — con số 41,7% là của cross-vendor

> Dòng thứ ba đáng in ra dán tường:
> **merge nhanh là cách chống conflict rẻ nhất, và nó không đòi hỏi bất kỳ công cụ mới nào.**

## Chống conflict ngữ nghĩa — bốn tuyến theo ROI

```
TUYẾN 1 — MERGE QUEUE (mạnh nhất, rẻ nhất)
  Rebuild PR trên main mới nhất TRƯỚC khi merge.
  Conflict ngữ nghĩa hiện ra ở đây, không hiện trên main.
  → Cơ chế DUY NHẤT bắt được loại conflict này một cách hệ thống.

TUYẾN 2 — CONTRACT + TYPECHECK TOÀN REPO
  Đổi signature ở tầng contract → typecheck vỡ ở MỌI consumer NGAY.
  Đây là lý do thật của kiến trúc contracts, không phải "code sạch".

TUYẾN 3 — NHÁNH NGẮN (< 1 ngày)
  Cửa sổ chồng lấn tỉ lệ với tuổi nhánh. Nhánh 3 ngày = 3× rủi ro nhánh 1 ngày.

TUYẾN 4 — THÔNG BÁO BREAKING TRƯỚC KHI LÀM
  Đổi public surface → mở issue trước, label `breaking`, ping owner của consumer.
```

## Kỹ thuật rẻ nhất trong cả tài liệu này

> **Chống conflict bằng cách chia file theo người / theo issue, thay vì cùng ghi
> vào một file.**

Áp dụng ở khắp repo này:

| Thay vì | Dùng |
|---|---|
| `claude-progress.txt` | `docs/progress/<issue>.md` |
| `feature_list.json` | `features/<id>.json` |
| `learnings.md` | `.claude/learnings/<năm>-W<tuần>-<tên>.md` |
| một file reservation | `reservations/<dev>-<issue>.json` |

Cả bốn thiết kế "một file cho cả repo" đều là **single-writer**: hoàn hảo khi làm
một mình, là máy sinh conflict khi có 4 người.
