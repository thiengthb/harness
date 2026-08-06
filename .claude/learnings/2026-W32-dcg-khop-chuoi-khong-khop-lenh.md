# 2026-W32 — `dcg.mjs` khớp CHUỖI, không khớp LỆNH — nên né được bằng cú pháp nháy

> **ĐỀ XUẤT, chưa sửa.** `dcg.mjs` nằm trong `paths.harness`; đây là đường hợp pháp.
>
> Gốc rễ chung của hai triệu chứng ngược nhau đã ghi trong tuần này:
> **âm tính giả** (mục này) và **dương tính giả** (`2026-W32-dcg-quet-than-heredoc.md`).
> Cả hai là cùng một nguyên nhân: hook nhận một *chuỗi* và giả vờ nó là một *lệnh*.

## Triệu chứng

`dcg.mjs` không chặn những lệnh mà shell thực thi **y hệt** dạng nó chặn.

Đo 2026-08-06 bằng cách spawn hook thật với payload `PreToolUse`/`Bash`
(script: `scratchpad/dcg-probe.mjs`, telemetry chuyển sang tmpdir):

| kết quả | lệnh |
|---|---|
| CHẶN | dạng thẳng, không nguỵ trang — **mốc, đúng** |
| **LỌT** | bọc một token bằng nháy kép |
| **LỌT** | chèn một cặp nháy rỗng vào giữa một cờ |
| **LỌT** | chèn một cặp nháy đơn rỗng vào giữa một token |
| **LỌT** | cho cờ đi qua một biến shell |
| **LỌT** | bọc đường dẫn `/` bằng nháy kép ở lệnh xoá đệ quy |
| CHO QUA | `git status` — **mốc, đúng** |

**5/5 biến thể nguỵ trang lọt.** Mốc hai đầu đều đúng, nên đây không phải hook hỏng —
nó đang làm **đúng thứ nó được viết để làm**, và thứ đó không đủ.

## Lần xuất hiện

- **2026-08-06** — bảng đo ở trên, 5/5. Đây là **một** lần quan sát, không phải hai.
- **2026-08-06** — Claude Code 2.1.223 vá **đúng lớp lỗi này ở tầng permission của vendor**:
  *"a crafted command could hide parts of itself from permission checks"* và
  *"commands padded with tabs or invisible Unicode"*. Tìm ra qua nghi thức
  `claude-code-drift` (commit `2cb7e1e`, v2.15.0).

> **NÓI THẲNG: mục này KHÔNG đạt ngưỡng "≥2 lần xuất hiện độc lập" của bước 1.**
> Tôi vẫn nêu, và DRI quyết định — với lập luận: ngưỡng ≥2 tồn tại để chặn **lạm phát
> rule từ những bực mình một lần**. Đây không phải bực mình; đây là một **bảng đo cho
> thấy một cái gác không làm được việc nó tuyên bố**. Hai loại bằng chứng khác nhau,
> và áp cùng một ngưỡng cho cả hai là dùng sai cái ngưỡng.
> Nếu DRI thấy ngược lại: đóng mục này, không sửa gì, và **sửa `danger-zones.md`** —
> vì phần dưới đây vẫn đúng bất kể quyết định thế nào.

## Mức nghiêm trọng THẬT — thấp hơn nó nghe

`settings.json → permissions.deny` **đã** có `Bash(git push --force:*)`,
`Bash(git push -f:*)`, `Bash(git reset --hard:*)`, `Bash(rm -rf /:*)`,
`Bash(terraform apply *-auto-approve:*)`. Đó là **tầng một**, do vendor cưỡng chế — và
tầng một chính là thứ **vừa được vá trong 2.1.223**.

Nên hôm nay: **tầng một bắt được cái tầng hai bỏ lọt.** Phòng thủ nhiều lớp đang làm
đúng việc, chỉ là ngược thứ tự người ta tưởng.

Rủi ro còn lại, theo thứ tự:

1. **Tài liệu nói quá.** `.claude/rules/danger-zones.md` viết ba nhóm nguy hiểm được
   *"cưỡng chế bằng máy ở `.claude/hooks/dcg.mjs`"*. Câu đó **đo được là yếu hơn nó đọc**.
   Đây là thiệt hại lớn nhất và rẻ nhất để sửa.
2. **Repo con tuỳ biến `permissions.deny`** rồi tin vào `dcg` là hở thật — và
   `settings.json` là lớp SEED, `upgrade` không bao giờ ghi đè nó.
3. **Prompt injection.** Nội dung từ web/issue/dependency bảo chạy một lệnh nguỵ trang.
   Đúng mô hình đe doạ vendor vừa cứng hoá.

## Vì sao KHÔNG nên vá regex

`dcg` là regex; đầu vào là **ngữ pháp shell**. Cuộc đua này không thắng được: mỗi lần bịt
một hình dạng nguỵ trang lại có hình dạng khác. Và mỗi vòng đua làm regex phức tạp hơn,
tức **dương tính giả nhiều hơn** — đúng triệu chứng đã ghi ở mục heredoc. Hai triệu chứng
kéo regex về hai hướng ngược nhau: chặt hơn để bắt nguỵ trang, lỏng hơn để tha văn bản.

## Dạng biểu diễn đề xuất

Chọn: **`1` (test/contract)** — kèm một thay đổi **cấu hình**, không phải thay đổi hook.

Cụ thể, ba việc theo thứ tự rẻ dần:

1. **Test đối chiếu hai tầng.** Mỗi mục trong `DENY` của `dcg.mjs` phải có một mục
   tương ứng trong `settings.json → permissions.deny`. Đây là check tất định, chạy trong
   `test-hooks.mjs`, và nó trả lời đúng câu *"cái gác này có thật không"* — bằng cách hỏi
   tầng nào đang thật sự cưỡng chế. Có tiền lệ: `governanceDrift` trong `harness-doctor`
   đã đối chiếu "điều cấm viết ra" với "điều guard cưỡng chế" theo đúng kiểu này.
2. **Bổ sung `permissions.deny`** cho những mục `DENY` chưa được tầng một phủ:
   `git clean -fd` · `git checkout --` · `git branch -D` nhánh chung · `DROP TABLE` ·
   `kubectl/helm --context prod` · `shutdown/mkfs/dd` · fork bomb.
3. **Sửa `danger-zones.md`** cho đúng sự thật: tầng một là `permissions.deny`
   (vendor cưỡng chế), `dcg` là tầng hai — **giải thích + ghi telemetry**, best-effort.

**Vì sao không dùng dạng rẻ hơn:** không có dạng nào rẻ hơn `1`. Vì sao không dùng dạng
`3` (sửa hook): xem mục "Vì sao KHÔNG nên vá regex" — nó là dạng ĐẮT HƠN mà lại không
giải quyết được vấn đề, và nó làm dương tính giả tệ đi.

**Lớp lỗi:** verification

**Tầng:** project (nhưng bài học thì `universal`)

**Scope:** `universal` — *"nếu xoá repo này, mục này còn giá trị không?"* → **còn**.
"Một guard khớp regex trên chuỗi lệnh thì né được bằng cú pháp của shell, nên nó là lớp
ngữ nghĩa chứ không phải ranh giới cưỡng chế" đúng với mọi repo có hook kiểu này.

**Đặt ở tầng nào của thang độ trễ:** test chạy trong `test-hooks.mjs` (đã có, ~vài giây).
Không đặt được ở tầng nhanh hơn vì nó phải đọc cả hai file cấu hình.

**Chi phí bảo trì dự kiến:** thấp. Bảng đối chiếu chỉ đổi khi ai đó thêm một mục `DENY` —
và lúc đó đỏ là **đúng**: mục mới cần một dòng ở tầng một.

**ĐIỀU KIỆN THOÁT:** khi sandbox được bật (ADR 0002 §Hệ quả), phần `rm -rf`, `shutdown`,
`mkfs`, `dd`, fork bomb chuyển xuống **ranh giới OS** và biến mất khỏi `dcg`. Lúc đó bề
mặt so khớp chỉ còn ngữ nghĩa (`git push --force`, `DROP TABLE`, `kubectl --context prod`),
bảng đối chiếu co lại theo, và nếu `permissions.deny` phủ hết phần còn lại thì **cả mục này
lẫn `dcg` đều có thể cắt**. Kiểm lại mốc đó trước khi viết thêm bất cứ dòng nào.

---

## Đề xuất CẮT BỎ

- [ ] **`dcg.DENY`: 3 mục cấp hệ thống** — `rm -rf`, `shutdown|reboot|mkfs|dd if=`,
      fork bomb. Chúng là ranh giới **OS**, không phải ngữ nghĩa repo; `permissions.deny`
      đã có `Bash(rm -rf /:*)`, và ADR 0002 đã ghi sẵn ý định thu hẹp `dcg` khi bật sandbox.
      Giữ chúng trong regex là trả giá dương-tính-giả cho một phủ sóng mà tầng dưới làm tốt hơn.
- [ ] **Tên file `2026-W32-dcg-quet-than-heredoc.md`** giờ hẹp hơn triệu chứng thật
      (ca 4 không dùng heredoc). Gộp vào mục này khi promote, đừng giữ hai mục nói một gốc rễ.
