# Learnings — tuần W32, thiengthb (phiên 2026-08-08 chiều)

<!-- ĐỀ XUẤT, chưa phải harness. DRI quyết định promote → /knowledge-promote. -->

## Mọi bản vá dạng "ĐỪNG ĐẾM cái này" đều thiếu ca khoá chiều SỬA QUÁ TAY

**Lần xuất hiện** (3 lần, 2 PR, cùng một phiên — và lần thứ ba tôi suýt lặp lại y hệt):

- **PR #117 (#104)** — `measured` thôi tin `Boolean(agent)`, để một task 0 assertion ra khỏi
  mẫu số. Hai ca đầu tôi viết (⑬⑭) đều đòi **mẫu số CO LẠI**. Cả hai vẫn xanh với
  `measured = false` cứng — tức với một bản vá làm **tỉ lệ tính trên tập rỗng**. Phải thêm ca
  ⑮ (*"task có ≥1 assertion chạy được vẫn phải ở trong mẫu số"*) mới bắt được.
- **PR #118 (#91)** — `--bare` gỡ lớp harness. Ca đầu chỉ đòi *"cây trần KHÔNG còn `AGENTS.md`
  / `.claude`"*. Nó vẫn xanh khi `BARE_STRIP` gỡ **sạch cả `tooling/`** — mà gỡ `tooling/` thì
  lần chạy trần đo *"harness còn tồn tại không"* thay vì *"agent có hành xử khác không"*. Phải
  thêm vế *"vẫn PHẢI thấy `tooling` và `harness.config.json`"* vào cùng ca ⑰.
- **PR #118 (#91), lần thứ ba** — phép trừ `full − bare`. Tiền kiểm loại các assertion đo lớp
  harness, nên hai lần chạy có **hai mẫu số khác nhau**. Trừ hai tỉ lệ đó cho ra một con số
  không nói về cái gì cả. Ca ⑳ (*"giao rỗng ⇒ `?`, không bịa hiệu số"*) là ca duy nhất bắt
  được, và tôi chỉ viết nó vì vừa trả giá hai lần trước đó trong cùng phiên.

**Lớp lỗi:** `verification` — bộ đo có ca cho chiều đúng, không có ca cho chiều sửa quá tay.

## Vì sao nó khó thấy hơn vẻ ngoài

Một bản vá *"đừng đếm cái này"* luôn ra đời từ một sự cố cụ thể: một task xanh giả (#104), một
chỉ số 0 giả (#91). Người viết test đang **nhìn về phía sự cố đó**, nên mọi ca họ nghĩ ra đều
có dạng *"cái sai kia không còn xuất hiện nữa"*. Bản vá cực đoan nhất — **loại bỏ tất cả** —
thoả mãn mọi ca đó một cách hoàn hảo.

Và nó **không có triệu chứng**. Mẫu số co về 0 thì tỉ lệ hoặc biến mất, hoặc in `100% (0/0)`.
Không có gì đỏ. Lớp eval trở thành vô dụng **trong im lặng**, đúng chế độ hỏng mà cả lớp eval
sinh ra để chống.

Đây là mặt còn lại của bài học đã có:
`knowledge/lessons/0002-guard-ban-nham.md` nói *"guard bắn nhầm thì bị tắt"*. Bài này nói
**guard bắn quá rộng thì không ai tắt nó — nó chỉ thôi đo gì cả**, và im lặng thì không ai
biết để tắt.

## Hình dạng chung, và nó lặp lại được

Mọi thay đổi động tới **mẫu số** hoặc tới **tập được đếm** đều có hai chiều nói dối:

```
chiều A (dễ nhớ)   đếm thứ KHÔNG nên đếm   → tỉ lệ đẹp giả, hoặc xấu giả
chiều B (hay quên) BỎ ĐẾM thứ nên đếm      → tỉ lệ tính trên tập rỗng, im lặng
```

`#93` là chiều A theo hướng hoảng. `#104` là chiều A theo hướng dễ chịu. Cả hai đều có issue,
đều có người viết, đều được sửa. **Chiều B chưa từng có issue nào** — vì không ai mở issue cho
một con số không xuất hiện.

## Dạng biểu diễn đề xuất

```
1 test/contract  2 generator  3 computational-control  4 verification-skill
5 gotcha 1 dòng  6 skill      7 rule cứng
```

Chọn: **`1` (contract) + `3` (computational control)** — không phải rule cứng. Một dòng
*"nhớ viết ca chiều ngược"* trong `AGENTS.md` là đúng loại chỉ thị bị bỏ qua bởi người đang gấp.

Hai nửa:

- **Nửa rẻ, làm được ngay:** trong `tooling/test-evals.mjs` (và mọi suite đụng tới mẫu số),
  mỗi nhóm ca đổi `measured`/`skip`/`strip` phải có **ít nhất một ca đòi tập KHÔNG rỗng** —
  và ca đó phải bị giết bởi mutant *"loại bỏ tất cả"*. Đã làm ở ⑮ ⑰ ⑳.
- **Nửa cưỡng chế, cần bàn:** mutant `measured = false` / `BARE_STRIP = []` / `skip = mọi thứ`
  là **mutant tổng quát** — chúng không phụ thuộc nội dung bản vá, chỉ phụ thuộc *"suite này
  có đụng tới mẫu số không"*. Nên nó tự động hoá được: một danh sách mutant chuẩn cho mọi
  suite đo tỉ lệ, chạy trong `harness-doctor`, và ratchet như `hooks-without-mutant`.

**Tầng:** `project` → ứng viên `user` sau khi chạy đủ 2 tuần.

**Scope:** `universal`. Test *"xoá repo này thì mục còn giá trị không?"* — còn: bất cứ bộ đo
nào có khái niệm *"không tính vào mẫu số"* (coverage có `ignore`, lint có `disable`, CI có
`allow-failure`) đều mang đúng lỗ hổng này.

**Thang độ trễ:** đặt ở **CI / `harness-doctor`**, không ở `Stop`. Chạy một bộ mutant là hàng
chục giây tới vài phút — vượt ngân sách 30 giây của `Stop`, và nó không cần chạy mỗi lượt.

**Chi phí bảo trì:** thấp nhưng **không bằng 0**. Mutant tổng quát phải biết suite nào "đo tỉ
lệ" — đó là một danh sách người phải cập nhật, tức chính dạng nợ mà `harness-size.mjs` đang
đếm. Nếu DRI thấy danh sách đó là cái giá quá cao, **nửa rẻ vẫn đáng làm một mình**: ba ca
⑮ ⑰ ⑳ đã tồn tại và đã được đo là giết mutant thật.

## Ghi chú cho lần retro

`fixlog` chưa có mục nào cho nhóm này — cả ba lần đều **tôi tự bắt trong lúc viết test**, không
lần nào thành một lỗi phải sửa tay. Đó là lý do nó không tự nổi lên qua `/harness-retro`:
**vòng học chỉ thấy thứ đã gây đau**, còn đây là thứ suýt gây đau và im lặng. Nếu nhóm này đáng
promote, nó phải vào qua đường này, không qua đường đếm fixlog.
