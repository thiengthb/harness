# Version đã phát hành mà không ai pin được

không có issue — phát hiện trong lúc kiểm trạng thái sau nhóm #129 · branch: `fix/tag-phat-hanh-thieu` · platforms trong scope: n/a

## Phát hiện

```
tag mới nhất:        v2.45.1
harness.version:     2.67.0
⇒ 24 version đã merge vào main mà KHÔNG có tag
```

`knowledge/README.md` viết rõ: *"Repo khác pin theo **tag/sha, không bao giờ theo `main`** — một
commit sai ở `main` làm hỏng đồng thời mọi repo của bạn."* Và `upgrade.mjs --ref <tag>` là đường
**duy nhất** để làm điều đó.

Nên: cơ chế chuyển giao có đủ mọi thứ trừ **cái mốc để trỏ vào**. Mọi cải tiến từ v2.46.0 tới
nay — 24 version, gồm cả ba lô guard hôm nay — chưa repo con nào với tới được.

## Vì sao không ai thấy: check cũ chỉ hỏi MỘT CHIỀU

`harness-doctor` đã có một check về tag, và nó in xanh mỗi lần:

```
✓  72 tag phát hành đều nằm trên main
```

Câu đó **đúng**, và nó đọc như một lời khai về *phát hành*. Nhưng nó chỉ hỏi *"tag ĐANG CÓ có
trỏ vào thứ nằm trên main không?"* — tức nó không biết gì về version **không có tag nào**. Một
repo tag đúng 3 version và bỏ quên 24 version vẫn được nó khen.

Cùng hình dạng với mọi lỗi lớp `L0005` trong repo này: một phép đo trả lời nửa câu hỏi, và **in
ra như thể trả lời cả câu**.

## Đã làm

| # | Thay đổi | File |
|---|---|---|
| 1 | `releaseTagGap()` — THUẦN; so bằng SỐ; `null` khi không đo được | `lib/harness.mjs` |
| 2 | Dòng ⚠️ ngay dưới check tag cũ + `advice` nêu lệnh sửa | `harness-doctor.mjs` |
| 3 | 6 khẳng định, gồm ca `2.9.0` vs `2.10.0` | `test-hooks.mjs` |

**So bằng SỐ, không bằng chuỗi** là ca chịu lực: `'2.9.0' > '2.10.0'` theo thứ tự từ vựng, và
một phép so sai ở đây báo *"không có gì trễ"* **đúng lúc có** — chiều im lặng.

**Version mới hơn `harness.version` KHÔNG tính là trễ.** Không có vế đó thì bốn PR đang mở
(#190–#193, đã có mục changelog, chưa merge) bị đếm là "trễ tag", và con số đó vô nghĩa.

## Chưa làm: TẠO tag

35 tag còn thiếu, đã có bản đồ version → commit **chính xác**. Không tự tạo, hai lý do:

1. Tag là **lịch sử chung** — `danger-zones.md §3`. Sửa sai thì phải `push --delete`, và đó là
   thứ tôi không làm một mình.
2. Ba version cũ (`1.0.0`–`1.3.0`) có thể chưa bao giờ được phát hành ra ngoài; tag lại chúng
   hôm nay là khai một lịch sử không có thật. **Người quyết mốc nào đáng là một bản phát hành.**

### Bản đồ lấy từ lịch sử `harness.version`, KHÔNG từ commit message

Đây là chỗ suýt sai. Cách hiển nhiên là grep message tìm `(vX.Y.Z)`:

```
grep:  v2.54.0 → 6d80ced      v2.55.0 → 6d80ced      ← CÙNG một commit
thật:  v2.54.0 → e3411c19     v2.55.0 → 6d80ceda     ← hai commit khác nhau
```

Message của một commit nhắc tới version nào là chuyện của người viết message; **giá trị trong
`harness.version` tại commit đó** thì không. Một cái tag đặt nhầm chỗ tệ hơn hẳn một cái tag
thiếu — chính check cũ ở doctor ra đời từ ca đó (v2.7.7, 2026-08-05).

Lệnh đã sinh sẵn: `git tag v<x.y.z> <sha>` × 35, rồi `git push --tags`.

## Bằng chứng

```
node tooling/test-hooks.mjs      → exit 0 · 235 PASS · 0 FAIL · 0 n/a
  PASS  releaseTagGap   so bằng SỐ (2.9.0 < 2.10.0) · version chưa merge không tính là trễ ·
                        chưa-đo-được ≠ 0
node tooling/harness-doctor.mjs  → exit 0
  ✓   72 tag phát hành đều nằm trên main
  ⚠️   tag mới nhất là v2.45.1 nhưng main đang ở 2.67.0 — 24 version KHÔNG PIN ĐƯỢC
```

Hai dòng đứng cạnh nhau là cố ý: dòng trên là câu trả lời cũ, dòng dưới là nửa câu hỏi nó không
hỏi.

## Không bump version — và đó là quyết định, không phải quên

`2.68.0`–`2.71.0` **đã bị bốn PR đang mở giữ chỗ** (#190–#193). Bump ở đây tạo hai `2.68.0`
khác nhau, hoặc — nếu nhảy lên `2.72.0` rồi merge trước — làm `harness.version` trên main **đi
lùi** khi stack merge sau.

Nên lô này đi kèm version của lần bump kế tiếp. `harness.version` và mục changelog mới nhất vẫn
khớp nhau ở `2.67.0`, nên check nhất quán của suite vẫn xanh.

## Xét cắt bỏ (bắt buộc mỗi lô)

Xét gộp hai dòng tag thành một — **KHÔNG**. Chúng trả lời hai câu khác nhau (*"tag có trỏ đúng
chỗ?"* và *"version có tag không?"*), và gộp lại thì lại đúng lỗi vừa tìm ra: một dòng đọc như
thể nó phủ cả hai.
