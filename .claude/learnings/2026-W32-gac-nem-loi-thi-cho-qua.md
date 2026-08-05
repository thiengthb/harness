# 2026-W32 — Một cái gác ném lỗi thì CHO QUA, và không gì báo

> **Đã áp — v2.12.0, 2026-08-05.** Xem `HARNESS-CHANGELOG.md §2.12.0`, PR #37.
> Nguồn: đợt nghiên cứu repo `fleet` (`/home/thien/projects/fleet`), 2026-08-05.

## 1. Điều đã đo được

Một ngoại lệ ở bất cứ đâu trong hook làm tiến trình thoát mã **1**. Claude Code đọc mọi
mã **khác 0 và 2** là *"lỗi không chặn"* ⇒ **tool call đi qua**.

Tiêm `null.x` ngay sau `import`, trước mọi phép kiểm, rồi đưa vào đúng payload mà hook
phải chặn:

| hook | payload | sạch | ném lỗi |
|---|---|---|---|
| `block-secrets` | API key thật vào `config.ts` | `exit=2` | `exit=1` ⇒ **LỌT** |
| `dcg` | force push lên nhánh chung | `exit=2` | `exit=1` ⇒ **LỌT** |
| `dcg` | xoá đệ quy ở gốc | `exit=2` | `exit=1` ⇒ **LỌT** |
| `protect-harness` | ghi `.claude/settings.json` | `exit=2` | `exit=1` ⇒ **LỌT** |

**Cả bốn cái gác của ba nhóm nguy hiểm.** Và nó im theo một cách riêng: `hookRan()` nằm ở
CUỐI hook, nên một crash không ghi dòng nào, và `harness-doctor` đếm 0 — **ba tình huống
đọc giống hệt nhau**: gác đang làm việc · gác không được cắm · gác đang crash.

Phát biểu ngoài của cùng luật, `fleet` tìm được trong đợt quét hook-practice 2026-07-31:
*"For a protection hook, an error should mean block, not allow."*

## 2. Bài học THẬT — và nó không phải mục 1

Mục 1 là một bug, sửa xong là hết. Bài học chuyển đi được nằm ở chỗ khác:

> **Harness có 24 script tự-kiểm và không cái nào tìm ra được điều này, vì mỗi cái trong
> số đó mã hoá CHÍNH ý niệm của harness về thứ cần kiểm.**

Đó là **giới hạn cấu trúc của tự-kiểm**, không phải một lỗ hổng trong bộ công cụ. `fleet`
phát biểu nó sau khi một validator bên ngoài (`agnix`) tìm ra 10/38 `SKILL.md` của họ có
YAML frontmatter sai chuẩn nghiêm — vô hình với bộ nạp dễ tính của Claude Code, **và vô
hình với cả mười công cụ của họ**:

> *"fleet có mười công cụ đo, 33 suite xanh và năm bộ dò tái phát, và không cái nào tìm ra
> được, vì mỗi cái trong số đó mã hoá chính ý niệm của fleet về thứ cần kiểm."*

**Hệ quả cho harness:** một oracle bên ngoài — dù chỉ chạy MỘT lần — mua được thứ không
lượng test nội bộ nào mua được. Không phải vì nó giỏi hơn, mà vì nó sai chỗ khác.

Tôi đã tái hiện phép đo YAML đó trên harness: **0/12 SKILL.md hỏng**. Nhưng một số xanh
từ một máy đo chưa được chứng minh thì vô giá trị, nên tôi dựng mutant
(`description: Trên \`nuc\`: upsert…`) và máy đo bắt đúng, cùng thông báo lỗi `agnix` đưa ra.

## 3. Phần tinh tế mà một bản sửa đồng loạt làm sai

**Không phải hook nào cũng nên fail-closed.** Chặn-khi-lỗi chỉ đúng ở nơi hook cưỡng chế
một bất biến cứng. Với hook **cố vấn**, `exit 1` vốn ĐÃ là kết quả đúng — tool đi qua *và*
lỗi hiện ra trong transcript. Ép chúng về `0` **tệ hơn không làm gì**: tầng đếm ghi một số
0 sạch sẽ cho một hook đang hỏng.

Nên `declareFailMode(code, why)` không áp đặt chính sách. Nó buộc mỗi hook **KHAI** chính
sách của mình bằng một dòng.

**Và một cửa thoát được khai báo là bắt buộc.** Mọi hook import cùng một lib, nên một lỗi
trong lib làm MỌI hook fail-closed cùng lúc — `harness.config.json` sai cú pháp là ca thực
tế nhất. `HARNESS_FAIL_OPEN=1`, được ghi log. Một lỗ hổng được khai báo thì cãi lại được;
một vụ khoá cứng im lặng thì chỉ còn cách đi đọc mã nguồn lúc đang gấp.

## 4. Ba lần tôi tự đi vào đúng cái bẫy mình vừa đọc

Ghi lại vì cả ba là **lỗi PHẠM VI, không phải lỗi logic** — và đó là chỗ phải nhìn trước
tiên khi một check kêu oan. (Lần thứ tư của cùng luật trong repo này.)

1. **Test spawn `harness-doctor`** để kiểm hộp đen — mà `harness-doctor` **CHẠY chính
   `test-hooks.mjs`** (dòng 25). Đệ quy lẫn nhau, suite treo >120 giây. Sửa: tách phán đoán
   thành hàm THUẦN (`governanceDrift` / `prohibitionText`), đúng `knowledge/lessons/0003`.
2. **Tên skill bị nhận là đường dẫn.** `/harness-propose` có dấu `/` nên bộ lọc `/[/.]/`
   nhận nó vào.
3. **Khoá config bị nhận là đường dẫn — từ chính ghi chú giải thích check.**
   `paths.harness` có dấu chấm. Cùng lớp với *"neo vào CODE, đừng neo vào comment giải
   thích code"*, mà repo này đã gặp ba lần trước đó.

Và một lần nữa ở mức tệ hơn: khi tôi bổ sung 3 lớp vào điều cấm, dòng đó **gói xuống hai
dòng**, và check lọc theo TỪNG DÒNG nên báo 4 lớp *đang nằm trong file* là thiếu. `fleet`
đã ghi lại đúng ca này **trước đó**, nguyên văn:

> *"three prohibitions reported missing while all three sat in the file, wrapped. A check
> that answers 'missing' for something present is worse than no check, because its output
> looks like a finding."*

**Tôi đọc câu đó rồi vẫn đi vào.** Nên bài học không phải "gói dòng thì phải chuẩn hoá" —
mà là: **đọc một bài học không cài đặt được nó**. Chỉ một test cài đặt được. Ca gói dòng
giờ là một assertion trong `test-hooks.mjs`.

## 5. Điều kiện thoát

Mục 1 hết giá trị nếu Claude Code đổi hợp đồng exit code (ví dụ: mã 1 thành chặn). Kiểm
bằng cách chạy lại ca tiêm lỗi trong `test-hooks.mjs` — nó là bằng chứng sống, không phải
tài liệu. Nghi thức `claude-code-drift` sẽ nhắc rà lại ở lần bump version tiếp theo.
