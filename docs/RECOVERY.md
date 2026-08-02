# Lớp phục hồi

> Câu hỏi kiểm tra: **giết session giữa lúc chạy, mở session mới — nó có tiếp tục được không?**
>
> Nếu không: mọi thứ agent cần để tiếp tục đang nằm trong **context**, không nằm
> trên **đĩa**. Đó là lỗi thiết kế, không phải xui.

## Bốn tầng chịu lỗi

```
TẦNG 1  RETRY có backoff           → lỗi tạm (network, rate limit)
TẦNG 2  FALLBACK model/tool chain  → model quá tải → model khác; MCP fail → CLI
TẦNG 3  PHÂN LOẠI LỖI              → lỗi tạm vs lỗi logic vs lỗi permission,
                                      mỗi loại một đường xử lý khác
TẦNG 4  CHECKPOINT RECOVERY        → quay về mốc lành gần nhất, KHÔNG về đầu
```

Tầng 3 hay bị bỏ qua nhất: retry một lỗi logic là lãng phí thuần, và nó là nguồn
chính của "vòng lặp mù" mà evaluator phải bắt.

## Điều kiện bất biến quan trọng nhất

> **Mỗi vòng lặp phải kết thúc ở trạng thái repo MERGE ĐƯỢC VÀO MAIN.**

Nó biến "8 giờ chạy" thành **"40 lần chạy 12 phút, dừng được bất cứ lúc nào"**.

Đây là lý do `/handoff` bắt commit mọi thứ, và là lý do gate chạy ở **Stop hook**
chứ không chỉ ở CI.

## Cơ chế cụ thể

**1. Git là hệ thống undo.**
Commit sau **mỗi bước có nghĩa**, không phải mỗi feature. Message mô tả *trạng thái*,
không mô tả *ý định*.

**2. Mọi thứ agent cần để tiếp tục phải nằm TRÊN ĐĨA.**

| Trạng thái | Trên đĩa ở đâu |
|---|---|
| đã làm gì | `git log` + `docs/progress/<issue>.md` |
| còn gì phải làm | `features/<id>.json` (default-FAIL) |
| bước tiếp theo cụ thể | mục `TIẾP THEO` trong nhật ký |
| quyết định đã chốt | `docs/adr/` |
| đang vướng gì, đã thử gì | mục `ĐANG VƯỚNG` trong nhật ký |

**3. Append-only.** Đừng bao giờ để agent *sửa* nhật ký, chỉ *thêm*.
Nhật ký bị viết lại thì mất giá trị làm bằng chứng.

**4. Idempotent commands.** Mọi script trong `tooling/` phải chạy 2 lần cho ra
cùng kết quả. Không có tính chất này thì interrupt-resume không hoạt động.

**5. Kill test — chạy thật, đừng giả định.**

```bash
# Giữa một task dài: giết session, mở session mới, chỉ chạy /claim
# Câu hỏi: nó có biết phải làm gì tiếp không?
```

Đo: **MTTR** — từ lúc phát hiện hỏng tới lúc trở lại trạng thái lành.

---

## Context reset vs compaction — ĐO, đừng cài mặc định

| | Compaction | Context reset |
|---|---|---|
| Cơ chế | tóm tắt lịch sử, giữ session | đập session, dựng lại từ file handoff |
| Khi nào | task trung bình | task nhiều giờ / nhiều ngày |
| Rủi ro | truyền instruction không sạch cho agent kế | mất context ngầm nếu handoff kém |

**Cảnh báo quan trọng:** context reset có thể đã thành **dead weight** với model đời mới.

Bằng chứng: một model đời trước có hiện tượng "vội kết thúc khi gần hết context",
và context reset được thêm vào harness để chữa. Chạy **cùng harness đó** trên model
đời sau, hành vi đó **đã biến mất** — context reset trở thành thứ vô ích phải gỡ đi.

Không ai gửi thông báo cho bạn khi một mảnh harness hết hạn.

**Cách đo:** chạy 3 task dài (>1h) có và không có reset, so tỉ lệ hoàn thành và
chất lượng. Bằng nhau → **gỡ reset, giữ compaction**. Xem `evals/README.md §deprecation review`.

## Khi nào ĐƠN GIẢN HOÁ lớp này

Đây là lớp **không nên gỡ**, nhưng có thể đơn giản hoá khi model ít lỗi hơn:
bớt tầng 1–2, **giữ tầng 3–4**.

Lý do giữ 3–4: model mạnh hơn cũng làm task **lớn hơn**, nên hậu quả của một lần
hỏng ở bước 40/50 vẫn nguyên như cũ.
