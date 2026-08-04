# <ISSUE-ID> — <tiêu đề>

issue: <URL đầy đủ tới issue>   ← BẮT BUỘC. Đây là bản ghi YÊU CẦU GỐC, nguyên văn.
owner: @___ · branch: ___ · worktree: ___ · platforms trong scope: ___

<!--
  VÌ SAO `issue:` LÀ BẮT BUỘC, VÀ VÌ SAO KHÔNG CÓ KHỐI "DÁN YÊU CẦU VÀO ĐÂY".
  Mọi mục dưới đây đều là DIỄN GIẢI của agent về yêu cầu. Nếu diễn giải trôi ngay
  từ đầu, file này sẽ đóng lại bằng cách đối chiếu công việc với chính cái trôi đó
  — và pass. Đó là lỗi mà không mục nào khác trong harness bắt được.
  Neo chống trôi của repo này là GitHub issue: nó bất biến, có DoR bắt buộc
  acceptance criteria verify được bằng máy, và `/claim` đã đọc nó. Chép lại yêu cầu
  vào đây là tạo bản sao thứ hai của một sự thật — một khối để TRỐNG còn tệ hơn
  khối vắng mặt, vì lúc đóng file nó TRÔNG như đã thoả mãn.
  Đổi scope về sau: ghi vào một mục session mới, KHÔNG sửa dòng `issue:`.
-->

## Trước mỗi lô công việc — trả lời và GHI VÀO ĐÂY, có ngày

<!--
  VÌ SAO KHỐI NÀY NẰM TRONG FILE NÀY CHỨ KHÔNG PHẢI MỘT SKILL.
  Đây là artefact mà người thi hành THẬT SỰ mở. Một luật nằm trong skill mà không ai
  mở đúng lúc thi hành thì ĐỌC NHƯ LÀ ĐÃ CÓ PHỦ SÓNG. Ghi cả khi câu trả lời là
  "không đổi" — một lô không ghi gì thì về sau không phân biệt được với một lô đã
  bỏ qua bước này.
-->

1. Tiền đề của lô này còn đúng không? File này là ảnh chụp; repo đã đi tiếp.
2. **Nó đã được xây rồi chưa?** `rg` trước khi viết. Nghiên cứu một bài toán đã giải
   là lỗi đắt nhất ở đây, vì phía sau không có gì kiểm lại tiền đề.
3. Mọi con số lô này hứa hẹn là **suy ra** hay **đoán**?
4. Đo ở CÂY NÀO? Trong worktree, số có thể vắng mặt hợp lệ do `sparsePaths`.

<!--
  MỘT FILE MỘT ISSUE. Nhiều session cùng issue thì cùng file.
  APPEND-ONLY — không bao giờ sửa mục cũ. Nhật ký bị viết lại thì mất giá trị.

  Ba lợi ích:
  (a) hai issue song song không bao giờ conflict
  (b) file sống cùng nhánh nên nó merge cùng PR
  (c) reviewer đọc được QUÁ TRÌNH, không chỉ diff — đây là kênh lan kiến thức
      mà diff không cung cấp, và nó quan trọng gấp đôi khi phần lớn code do agent
      viết, vì hiểu biết chung về codebase không còn tự sinh ra từ việc gõ code.
-->

## <YYYY-MM-DD HH:mm> (session 1, <tên>)

- **ĐÃ LÀM**
  - ... (kèm số PR/commit)
- **TIẾP THEO**
  - ... (câu lệnh/bước CỤ THỂ, không phải "hoàn thiện tiếp")
- **ĐANG VƯỚNG**
  - ... + đã thử gì rồi
- **QUYẾT ĐỊNH đã chốt**
  - ... (nếu có → cân nhắc viết ADR)
