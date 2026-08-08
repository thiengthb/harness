---
id: L0007
title: Một bản vá có HAI chiều sai, và bộ ca test chỉ được viết cho chiều ồn ào — chiều còn lại không có triệu chứng nào
scope: universal
class: verification
representation: test
status: active
owner: "@ai"
added: 2026-08-08
expires-review: 2026-11-08
occurrences: 4
evidence:
  - "PR #117 (v2.42.4) — `measured` thôi tin `Boolean(agent)` để một task 0 assertion ra khỏi mẫu số. Hai ca đầu (⑬⑭) đều đòi mẫu số CO LẠI, và cả hai vẫn xanh với `measured = false` cứng — tức với một bản vá làm tỉ lệ tính trên TẬP RỖNG. Phải thêm ⑮ mới bắt được"
  - "PR #118 (v2.43.0) — `--bare` gỡ lớp harness khỏi một clone dùng một lần. Ca đầu chỉ đòi *cây trần KHÔNG còn `AGENTS.md`/`.claude`*, và nó vẫn xanh khi `BARE_STRIP` gỡ sạch cả `tooling/` — lúc đó lần chạy trần đo *harness còn tồn tại không* thay vì *agent có hành xử khác không*. Phải thêm vế ngược vào ⑰"
  - "PR #118 (v2.43.0) — phép trừ `full − bare`. Tiền kiểm loại các assertion đo chính lớp harness, nên hai lần chạy có HAI MẪU SỐ khác nhau; ca đầu chỉ đòi *có in ra một hiệu số*. Phải thêm ⑳: giao rỗng ⇒ `?`, không bịa ra một hiệu số"
  - "PR #121 (v2.44.1) — `mergeBaseline` giữ khoá của cơ chế khác. Ca đầu chỉ đòi `nativeEvents` sống sót, và nó vẫn xanh khi `...prev` đặt SAU bốn khoá của bản rà — lúc đó `history` cũ thắng bản ghi mới: cùng một lỗi, đổi nạn nhân. Phải thêm ca ②"
artifacts:
  - "tooling/test-evals.mjs — ⑮ *task có ≥1 assertion chạy được vẫn vào mẫu số* (chốt chống `measured=false`); ⑰ vế hai *vẫn PHẢI thấy `tooling` và `harness.config.json`* (chốt chống gỡ quá tay); ⑳ *giao rỗng ⇒ `?`* (chốt chống trừ trên hai mẫu số)"
  - "tooling/test-hooks.mjs — `mergeBaseline` ca ② *bản rà MỚI thắng, không bị `...prev` ghi đè ngược*; `rateLimitHitsIn` ca *`0` ≠ `null`* và ca *trả về SỐ, không phải chuỗi nối object*"
  - "tooling/lib/harness.mjs — `mergeBaseline()` và `rateLimitHitsIn()` tách thành hàm THUẦN, vì một phép hợp nhất/đếm nằm lẫn trong IO thì không có chỗ đặt ca cho chiều thứ hai"
evals:
  - "evals/tasks/0007-va-hai-chieu-thieu-mot-chieu.md"
exit-condition: "Khi một bộ mutant TỔNG QUÁT chạy tự động cho mọi suite đụng tới mẫu số hoặc phép hợp nhất — `measured = false` · strip-list rỗng · `skip` mọi thứ · `...prev` đảo chỗ — và nó bắt buộc mọi bản vá loại này phải có ít nhất một ca bị mutant đó giết. Lúc đó *nhớ viết ca chiều ngược* thôi là một việc phải nhớ, và bài học này retire. Mốc đo: `harness-doctor` có một ratchet kiểu `hooks-without-mutant` cho nhóm này, và ratchet đó về 0."
---

## Triệu chứng

Một bản vá được viết ra từ một sự cố cụ thể: một task xanh giả, một chỉ số 0 giả, một phép đo
bị xoá. Người viết ca test đang **nhìn về phía sự cố đó**, nên mọi ca họ nghĩ ra đều có dạng
*"cái sai kia không còn xuất hiện nữa"*.

Và bản vá **cực đoan nhất** — loại bỏ tất cả, giữ tất cả — thoả mãn hết chúng một cách hoàn hảo.

| bản vá | ca viết ra (chiều A) | bản vá cực đoan vẫn xanh vì |
|---|---|---|
| `measured` bỏ `Boolean(agent)` | mẫu số CO LẠI | `measured = false` ⇒ tỉ lệ trên tập rỗng |
| `--bare` gỡ lớp harness | cây trần không còn `AGENTS.md` | gỡ sạch cả `tooling/` |
| phép trừ `full − bare` | có in ra một hiệu số | hai lần chạy có hai MẪU SỐ khác nhau |
| `mergeBaseline` giữ khoá cơ chế khác | `nativeEvents` sống sót | `...prev` đặt sau ⇒ nuốt bản ghi mới |

Bốn lần trong **một phiên**, và cả bốn đều được bắt bởi cùng một động tác: chạy một mutant làm
**tất cả theo một chiều**, rồi hỏi *"suite có đỏ không?"*.

## Nguyên nhân

Lớp `verification`, nhưng không phải ở chỗ quen thuộc: phép đo không sai — **bộ ca của nó
không đối xứng**.

Một thay đổi động tới mẫu số, tới tập được giữ, hay tới thứ tự hợp nhất luôn có hai chiều
nói dối. Chúng **không đối xứng về độ ồn**:

```
chiều A   đếm/giữ thứ KHÔNG nên   → số sai, và nó ồn: có người mở issue
chiều B   BỎ ĐẾM/BỎ GIỮ thứ nên   → mẫu số rỗng, bản ghi mới bị nuốt — KHÔNG có triệu chứng
```

`#93` là chiều A theo hướng hoảng. `#104` là chiều A theo hướng dễ chịu. Cả hai đều có issue,
đều có người viết, đều được sửa. **Chiều B chưa từng có issue nào** — vì không ai mở issue cho
một con số không xuất hiện, hay cho một dòng lịch sử không được ghi.

Đây là mặt còn lại của `L0002`: guard **bắn nhầm** thì bị TẮT (ai cũng thấy); guard **bắn quá
rộng** thì không ai tắt — nó chỉ thôi đo gì cả, và im lặng thì không ai biết để tắt. Và nó là
họ hàng gần của `L0005`: ở đó bộ đếm đổ về phía dễ chịu, ở đây **bộ ca test** đổ về phía dễ
nghĩ ra.

## Cơ chế

Hai nửa, và nửa rẻ đã đủ đứng một mình.

**① Mỗi nhóm ca đụng tới mẫu số / tập được giữ / thứ tự hợp nhất phải có ít nhất một ca đòi
chiều NGƯỢC** — và ca đó phải bị giết bởi mutant *"làm tất cả theo một chiều"*. Đã hiện thực
ở 5 ca trong `artifacts`, mỗi ca đã được đo là giết một mutant thật:

```
measured = false            → giết ⑮
BARE_STRIP = []             → giết ⑰ ⑱ ⑲ ⑳
trừ KHÔNG theo giao         → giết ⑳
...prev đặt SAU bốn khoá    → giết mergeBaseline ②③
```

**② Điều kiện tiền đề: phép hợp nhất/đếm phải là HÀM THUẦN.** `rateLimitHitsIn` sống được
trong trạng thái hỏng suốt 30 phút vì nó nằm lẫn trong một IIFE có IO và một `catch` trần —
**không có chỗ nào để đặt ca cho chiều thứ hai**. Tách ra `lib` là điều kiện, không phải trang
trí: một bản vá không test được ở chiều B thì bài học này không áp được cho nó.

Nửa **chưa** làm, cố ý: một bộ mutant **tổng quát** chạy trong `harness-doctor` với ratchet.
Nó khả thi — bốn mutant ở trên không phụ thuộc nội dung bản vá, chỉ phụ thuộc *"suite này có
đụng tới mẫu số không"*. Cái giá là **một danh sách suite phải cập nhật tay**, tức đúng dạng nợ
mà `harness-size.mjs` đang đếm. Xem `exit-condition`.

## Vì sao KHÔNG phải một rule cứng

Dạng rẻ hơn có tồn tại và đã dùng: **test** (dạng 1). Một dòng *"nhớ viết ca chiều ngược"*
trong `AGENTS.md` là đúng loại chỉ thị bị bỏ qua bởi người đang gấp — và người đang gấp luôn
tồn tại. Nó cũng không chuyển được sang model đời sau, trong khi 5 ca test thì chuyển được
nguyên vẹn.

## Ghi chú cho lần retro

Nhóm này **không nổi lên qua `/harness-retro` được**. Cả bốn lần đều là *tự bắt trong lúc viết
test*, không lần nào thành một lỗi phải sửa tay, nên `fixlog` không có mục nào. Vòng học chỉ
thấy thứ **đã gây đau**; đây là thứ **suýt** gây đau.

Nếu bạn nhận bài học này từ repo khác (`status: candidate`): dấu hiệu để biết repo bạn cũng có
nó là tìm mọi bản vá gần đây có từ *"không tính"*, *"bỏ qua"*, *"giữ lại"*, *"hợp nhất"* trong
tiêu đề, rồi chạy đúng một mutant: làm **tất cả** theo chiều bản vá đó, và xem suite có đỏ không.
