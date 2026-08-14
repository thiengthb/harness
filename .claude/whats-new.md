<!-- version: 2026-08-12-h -->
<!--
  Thông báo thay đổi harness cho cả team.
  SessionStart hook so `version` ở trên với version người dùng đã xem
  (.claude/state/whats-new-seen.json) và nhắc MỘT LẦN nếu mới hơn.

  Đổi harness mà không thông báo = nửa team hành xử theo rule cũ.
  Mỗi lần merge thay đổi vào .claude/, cập nhật version + viết 3 dòng ở đây.
  Giữ file NGẮN — nhưng KHÔNG xoá: chuyển mục cũ sang `.claude/whats-new-archive.md`.
  Vì sao ngắn, đo được: session-start chỉ in `.slice(0, 700)` ký tự — chừng HAI mục. Mọi
  mục sau đó không có đường nào tới người đọc, mà vẫn theo `apply-to` xuống MỌI consumer.
  Trần cứng: 220 dòng (test-hooks cưỡng chế). Vượt là dấu hiệu cần xoay vòng, không phải
  dấu hiệu nới trần.
-->

## 2026-08-12 — gate "tự khen" đã cắm, CHƯA lên đạn (v2.71.0)

Ô `TaskCompleted` là ô DUY NHẤT vendor cho **chặn** ("prevent task completion"), và nó bắn
đúng lúc agent tuyên bố xong — sớm hơn `Stop`/CI.

**Nó chưa chặn ai.** Nó đang ghi con số để bạn quyết:

```
node tooling/harness-doctor.mjs
  task ĐÁNH DẤU XONG 7 ngày: 24 lần · 3 lần gate SẼ chặn nếu được lên đạn (13%)
```

Đọc vài mục trong `.claude/telemetry/task-completed.log`: nếu 3 lần đó đều ĐÚNG thì lên đạn;
nếu có lần oan thì đó là `L0002` và đừng lên đạn. Lên đạn = một dòng trong `observe.mjs`.

Nhóm #129 đóng: **6/6 ô đã cắm**, và số file hook vẫn **11** — y như 2026-08-05.
## 2026-08-12 — context bị nén thì /handoff TỰ tới hạn (v2.70.0)

 là thủ công, và  đo được nó **chưa chạy lần nào** kể từ khi harness ra đời.
Khi context bị nén hoặc phiên kết thúc, **0 byte** được ghi tự động.

Nay hai ô  +  ghi một MỐC, và  so mốc đó với lần bạn sửa
 gần nhất:

\
Đó là quãng nguy hiểm nhất: hai tín hiệu cũ của  đều đo qua **commit**, còn thứ mất
khi context bị nén là những gì **chưa thành commit**.

## 2026-08-12 — ba câu hỏi cũ nay có SỐ (v2.69.0)

```
node tooling/harness-doctor.mjs      # §VÒNG HỌC
  skill được gọi 7 ngày: 0 lần / 0 skill khác nhau
  subagent 7 ngày: 0 lần khởi động · 0 loại · đỉnh ĐỒNG THỜI 0
  bị TỪ CHỐI 7 ngày: 0 lần do vendor · 0 lần do hook của ta
```

Toàn số 0 là **đúng cho hôm nay** — ba ô vừa cắm. Vài phiên nữa mới có mẫu.

Ba thứ đáng biết:

1. **Con số `16`** trong `AGENTS.md` (*"nhân với tối đa 16 agent song song"*) **chưa ai đo**.
   Từ nay nó được đo, và doctor sẽ nói nếu phép đo vượt nó.
2. **"đồng thời" ≠ tổng** — đỉnh tính theo đường cong start/stop, không phải đếm lần khởi động.
3. **"do hook của ta" tách khỏi "do vendor"** — gộp là tự đếm mình hai lần.

`/entropy-sweep` **chưa** đổi cách cắt skill: một tuần dữ liệu chưa nói được skill nào chết.

## 2026-08-12 — harness tự ghi "hôm nay cái gì cản" (v2.68.0)

`fixlog` là 3 giây **bạn phải nhớ gõ**. Nay máy ghi phần nó ghi được — hai ô native mới, cùng
`observe.mjs`, **không chặn gì**:

```
node tooling/harness-doctor.mjs      # §VÒNG HỌC
  ma sát 7 ngày: 3 lần công cụ HỎNG · 1 lần NGƯỜI dừng · 2/9 thông báo "chờ người vượt ngưỡng"
```

Hai chỗ **đừng đọc sai** — cả hai đo từ binary, không đoán:

1. **"NGƯỜI dừng" tách khỏi "công cụ HỎNG".** Bạn bấm Esc không phải là công cụ hỏng.
2. **"chờ người" là SỐ LẦN, không phải THỜI LƯỢNG** — vendor không gửi thời lượng, và ngưỡng
   (`messageIdleNotifThresholdMs`) là của **máy bạn**. Đọc xu hướng của chính mình; đừng so với
   máy người khác.

`fixlog` **không bị thay**: máy ghi được *cái gì hỏng*, chỉ bạn ghi được *tại sao nó cản*.

## 2026-08-12 — backtick trong `node -e "…"` bị chặn (v2.67.0)

Bash **thay** backtick bằng output của lệnh. Đã hỏng thật: một file rỗng tên `0` ở gốc repo,
một lần suýt ghi hỏng `MEMORY.md`, một tiêu đề issue mất ký tự.

```
node -e "const s = `xin chào`"    ⛔ CHẶN
node -e 'const s = `xin chào`'    ✅ dùng nháy ĐƠN
echo "hôm nay là `date`"          ✅ không đụng — substitution cố ý, ngoài node/gh
```

Văn bản **nhiều dòng** thì đừng nhét vào `node -e`: dùng công cụ `Write` ghi một file `.mjs`
rồi `node file.mjs`. Thông báo chặn có sẵn câu đó.

## 2026-08-12 — `git checkout -- <file>` không còn bị chặn (v2.66.0)

Guard `dcg` đã phân biệt được **bỏ cả cây** với **khôi phục đúng mấy file**:

```
git checkout -- tooling/rituals.mjs     ✅ được phép (bước dọn của mutation test)
git checkout -- a.mjs b.mjs             ✅ được phép
git checkout -- .    ./    :/    *      ⛔ vẫn chặn — bỏ CẢ CÂY
git checkout --                         ⛔ MỚI bị chặn (trước đây lọt)
git checkout HEAD -- .                  ⛔ MỚI bị chặn (trước đây lọt)
```

Nếu bạn từng lách bằng `writeFileSync` từ Node để dọn sau mutation test: **thôi lách đi**.
Đường vòng đó không có telemetry, nên nó làm guard mất tầm nhìn trước khi mất tác dụng.

## 2026-08-12 — harness tự đo: mục đỏ nào KHÔNG tắt được (v2.65.0)

Năm lần trong hai tuần, một mục "tới hạn" đỏ vĩnh viễn vì đại lượng lái nó **không đổi được
bằng hành động mà chính nó đề nghị**. Nay có phép đo thay cho trí nhớ:

```
node tooling/harness-doctor.mjs      # §VÒNG HỌC — hình dạng dòng bạn sẽ thấy:
  ⚠️  2 nghi thức `due` liên tục ≥14 ngày với 0 lần `ok`: <tên> (31ng) · <tên> (19ng)
  ?   sổ nghi thức mới quan sát được 0/14 ngày   ← hôm nay, và đó là câu trả lời ĐÚNG
```

1. `rituals` ghi trạng thái mỗi lượt vào `.claude/state/ritual-states.json` (bạn không phải gõ
   gì — nó đã chạy ở mọi SessionStart). Sổ **O(1)**, không phình.
2. Thấy dòng đó thì hỏi **đúng một câu**: *lệnh ghi ở `cmd` có đổi được con số đang lái mục này
   không?* Không → đó không phải việc của bạn, đó là bug của nghi thức
   (`knowledge/lessons/0008`).
3. **CẮT:** `fixlog --list` thôi cảnh báo `≥10 lần/tuần` trên số ĐỜI. Sổ thật hôm nay: 11 mục,
   9 mục đã đóng hoặc đã có địa chỉ, **2** mục thật sự chưa xử.

## 2026-08-12 — `fixlog`: trạng thái thứ tư `⇢` ĐANG CHỜ (v2.64.0)

Một nhóm fixlog đã thành issue nhưng bị chặn ngoài tầm tay bạn thì trước đây **không có cách
nào khai báo**: `--close` nghĩa là *đã sửa tận gốc*, còn để nguyên thì `/harness-retro` đỏ
vĩnh viễn và bảo bạn chưng cất một thứ đã chưng cất rồi.

```
node tooling/fixlog.mjs --track "<vài chữ>" "#177 — chờ DRI, bản vá nằm trong .claude/hooks/"
```

1. Nhóm mang dấu **`⇢`**, **không bị giấu**: vẫn in đủ số đếm, và mỗi lần **tái phát sau khi
   ghi địa chỉ** được đếm ra cạnh nó — con số đó nói việc đang chờ đang đắt lên.
2. `/harness-retro` thôi tính nó là *"ứng viên chờ chưng cất"*, và **nói ra số issue kể cả
   trong dòng xanh**.
3. Ngưỡng *"≥10 mục thì đáng đọc một lượt"* nay đếm **mục CHƯA XỬ**, không đếm số đời — sổ chỉ
   ghi thêm, nên ngưỡng cũ đỏ vĩnh viễn sau mục thứ 10.

Trên sổ thật: hai nhóm đã ghi địa chỉ (**#177** · **#160**), bảng nghi thức từ **2 mục đỏ** về
**0**.

## 2026-08-11 — gói PHẲNG: CAPO-TRẦN có sổ, nên có XU HƯỚNG (v2.63.0)

Chỉ ảnh hưởng người khai `budget.plan = flat` (hoặc `HARNESS_BUDGET_PLAN=flat`).

1. **`capo-report --days 30` giờ GHI** vào `.claude/state/capo-flat-history.json` và in
   *"so kỳ trước"*. Trước đó nó tính CAPO-TRẦN rồi vứt đi — mà cái đọc đáng giá của chỉ số
   này là **nó đi lên hay không**, không phải giá trị tuyệt đối.
2. **Mục `capo-report` trong `rituals` tắt được.** Trước: `19 lần chạm trần` ⇒ đỏ suốt 30
   ngày, **không hành động nào tắt được** — kể cả chạy đúng lệnh nó bảo bạn chạy. Nay đo
   xong là xanh, và **đỏ lại sau 30 ngày** (bằng đúng cửa sổ đếm).
3. Đổi `--days` giữa hai kỳ thì báo cáo **từ chối so** — tỉ lệ 7 ngày và tỉ lệ 30 ngày không
   phải hai điểm của cùng một đường.

Trên repo này: `CAPO-TRẦN = 0.15 lần chạm trần / kết quả được chấp nhận (19 lần · 130 kết
quả · 30 ngày)`.

## 2026-08-11 — `fixlog`: nhóm ĐÃ ĐÓNG thôi nuốt mục CHƯA XONG (v2.62.0)

Hai defect, cùng hậu quả: backlog báo *"không có gì tới hạn"* trong khi có.

1. **Luật gom nhóm rộng hơn, khai trước, thắng luật hẹp khai sau.** Nay **luật cụ thể hơn
   (needle dài hơn) thắng**; bằng độ dài thì giữ thứ tự file.
2. **`--close` KHÔNG vĩnh viễn.** Mục ghi **sau** ngày đóng là **tái phát** — dấu mới **`↻`**.
   Đây là ca đáng canh nhất: cùng một lỗi quay lại sau khi bạn tuyên bố đã sửa tận gốc.

Trên sổ thật: nhóm `dcg` đã đóng từ `5×` xuống `4×`, và mục ngày 08-10 (issue **#160**) hiện ra
thành nhóm riêng, **không còn đội dấu ✔**.

`rituals` và `fixlog --top` nay dùng **cùng một hàm** `groupStillClosed()` — trước đó `rituals`
vứt cột thời gian nên không thể thấy tái phát dù có muốn.

---


---

Mục cũ hơn: **[.claude/whats-new-archive.md](whats-new-archive.md)** — hồ sơ đầy đủ, không ship
xuống repo tiêu thụ.
