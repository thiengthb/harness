# WIP limit — song song bao nhiêu là đủ

## Sự thật số 1: mọi session rút từ cùng một quota

```
Không có billing riêng cho agent. Mọi session — interactive, background, subagent,
teammate, workflow agent — đều rút từ CÙNG quota subscription (hoặc cùng API balance).

→ Chạy 10 agent song song = tiêu quota nhanh gấp 10.
→ Rate limit được CHIA SẺ trên mọi session của cùng account.
→ Session idle KHÔNG miễn phí nếu còn process sống. Dừng session khi xong việc.
```

**Luật cứng: mỗi người một seat/account riêng.** Dùng chung account = quota và
rate limit đánh nhau, và không truy được ai làm gì.

## Sự thật số 2: cổ chai không phải máy tính, cũng không phải tiền

```
1. CHÚ Ý CỦA BẠN        ← gặp đầu tiên, và không mua được thêm
2. NĂNG LỰC REVIEW      ← PR chất lượng thấp merge vào = tạo nợ nhanh hơn trả
3. Rate limit / plan
4. Ngân sách            ← nếu không có cap thì gặp ĐẦU TIÊN, và đau
5. CPU/RAM máy          ← gần như không bao giờ là vấn đề thật
```

## Công thức

```
        SỐ TASK ĐANG BAY  ≤  NĂNG LỰC REVIEW  ≤  THÔNG LƯỢNG MERGE QUEUE

Năng lực review   = (số người review được) × (PR/người/ngày)
                    thực tế: 3–6 PR nhỏ/người/ngày là bền vững; hơn thì chất lượng tụt
Thông lượng queue = (1 / thời gian CI) × (song song của queue)
```

Bất đẳng thức bị vi phạm ở bất kỳ đâu → **agent đang tạo nợ nhanh hơn team trả**.

### Ví dụ tính cho team 4 người

```
4 người × 4 PR nhỏ/ngày              → năng lực review = 16 PR/ngày
CI 12 phút, queue song song 2        → queue ≈ 10 PR/giờ, không phải cổ chai
Kết luận: WIP tổng ≈ 12–16 task/ngày (để đệm 20%)
→ mỗi người 2 session hoạt động + 1 hàng chờ. KHÔNG hơn.
```

Điền con số của **bạn** vào `harness.config.json → limits.maxSessionsPerPerson`.

## Câu quan trọng nhất của tài liệu này

> Khi bạn muốn nhanh hơn, **đừng thêm session — hãy làm PR nhỏ hơn và review rẻ hơn.**
> Thêm session là đường dễ và nó dẫn tới nghẽn ở chỗ đắt hơn.

Muốn tăng WIP → **tăng năng lực review trước**: auto-review, PR nhỏ hơn,
CODEOWNERS hẹp hơn, khối review chung.

## Điểm khởi đầu theo gói

| Gói | Session đồng thời | Ghi chú |
|---|---|---|
| Cá nhân, gói thấp | 1 | cửa sổ giới hạn cạn rất nhanh khi song song |
| Cá nhân, gói trung | 2 | sweet spot: task chính model mạnh, task phụ model nhỏ |
| Cá nhân, gói cao | 3–4 | giữ **tối đa một** trên model mạnh nhất |
| Team seat thường | 1–2/người | |
| API / Enterprise | tuỳ, nhưng **phải** có spend limit + cap model cho subagent + cost metrics **trước khi** vượt 5 agent đồng thời | |

Có báo cáo thực chiến về **bức tường ~8 agent đồng thời**, và quota burn tăng
**tuyến tính** theo fan-out. Nghĩa là: dù gói cho phép, hệ thống có ngưỡng thực tế,
và vượt qua nó bạn trả tiền mà không được thêm throughput.

## Ba tầng song song

| Tầng | Rủi ro chính | Chống bằng |
|---|---|---|
| **A. Một người, nhiều session** | hai session của chính bạn sửa cùng file; quên session nào ở đâu | mỗi session một worktree · tên worktree = mã issue · sparsePaths cá nhân · statusline · pane cố định, không tab lộn xộn |
| **B. Nhiều người, mỗi người nhiều session** | conflict code, conflict ngữ nghĩa, quota chung | **mỗi người một account** · partition theo quyền sở hữu file · merge queue · reservation cho vùng nóng · WIP limit |
| **C. Session tự trị / CI chạy song song với người** | agent đêm push lên nhánh người đang làm; CI runner cạn; hoá đơn | agent tự trị **chỉ** làm trên nhánh tiền tố `auto/` · **không bao giờ** push lên nhánh người khác · `--max-turns` + budget cap + wall-clock · cron chạy 01:00–05:00, không 09:00 · **kết quả ra PR, không ra commit trực tiếp** |

## Song song trên MỘT máy: cái giá thật, đo được

**Đo 2026-08-07/08 trên chính repo này.** Ba phiên Claude chạy song song ~2 giờ.

Trước hết, phá một hiểu lầm phổ biến: **hai phiên KHÔNG nói chuyện với nhau.** Không có kênh
nào. Không phiên nào biết phiên kia tồn tại. Nên **không có token nào chi cho việc "hai agent
hiểu nhau"** — nếu bạn thấy hoá đơn tăng hơn gấp đôi, nguyên nhân nằm ở chỗ khác:

| Nguyên nhân | Đo được hôm đó | Tránh được không |
|---|---|---|
| **Context nhân đôi** | mỗi phiên đọc lại cùng `lib/harness.mjs`, `rituals.mjs`, `test-hooks.mjs` vào context RIÊNG | **không** — đây là sàn cứng ~2× |
| **Rebase** | 3 lần, 2 lần conflict phải hợp tay `HARNESS-CHANGELOG.md` + dòng `import` | có — chia file theo người/issue |
| **Nhiễu do tranh máy** | `evals/run.mjs` cho **3 kết quả khác nhau trên cùng một code** | có — đừng chạy suite nặng đồng thời |
| **Làm trùng** | một phiên chẩn đoán chi tiết `evals/run.mjs:139` trong khi phiên kia đã sửa xong và merge | có — đây là thứ sổ phiên chung sinh ra để chặn |

> **~2× là sàn không thương lượng được. Phần vượt lên 3–4× là chi phí VA CHẠM** — và va chạm
> phát hiện được thì tránh được.

### Cơ chế: sổ phiên nằm ở chỗ mọi worktree cùng nhìn thấy

Trước 2.42.0, `session-start` ghi sự có mặt vào `<worktree>/.claude/state/sessions/`. Mỗi
worktree một sổ riêng ⇒ **không phiên nào thấy phiên nào**, và cảnh báo không bao giờ bật.

Giờ nó ghi vào `.git/harness-shared/sessions/` — `git rev-parse --git-common-dir` trỏ về `.git`
của cây **chính** từ mọi worktree. Nằm trong `.git` nên không bao giờ bị commit.

Mỗi phiên tự ghi `{pid, branch, cwd, at}` và tự dọn bản ghi của phiên đã chết
(`process.kill(pid, 0)` — **liveness thật, không phải TTL đoán**). Đầu phiên bạn thấy:

```
ℹ️  2 phiên KHÁC đang mở trên repo này (trần 2/người):
     fix/93-quota-khong-phai-that-bai  ·  C:/project/harness-93  ·  12 phút trước
     fix/94-allowlist-frontmatter      ·  C:/project/harness-94  ·  28 phút trước
   Song song KHÔNG bị cấm — nhưng nó KHÔNG rẻ gấp đôi, nó đắt hơn thế
```

**Nó không chặn gì.** Chạy song song là hợp lệ và đôi khi đúng. Đây là thông tin để bạn quyết.

### Quy trình tối ưu cho một máy

```
1. TRƯỚC khi mở phiên thứ hai, hỏi: hai việc này có chạm cùng file không?
     node tooling/overlap-scan.mjs <đường-dẫn dự kiến>
   Có chạm → đừng mở. Chi phí rebase lớn hơn lợi ích song song.

2. Mở phiên thứ hai thì mỗi phiên MỘT worktree, tên = mã issue.
     claude --worktree

3. KHÔNG chạy suite nặng (test-hooks, evals, doctor) đồng thời ở hai phiên.
   Kết quả sẽ nhiễu, và bạn sẽ tốn token chẩn đoán nhiễu đó.

4. Ai merge trước thì người sau REBASE — đừng để hai nhánh cùng bump version.
   Hai số version cùng lúc là dấu hiệu bạn đang trả phí va chạm.

5. XONG VIỆC THÌ ĐÓNG PHIÊN. Session idle vẫn giữ process và vẫn nằm trong sổ.
```

**Luật một dòng:** *song song khi hai việc KHÔNG chạm nhau; tuần tự khi chúng chạm nhau.*
Cách rẻ nhất để biết là hỏi trước khi mở, không phải phát hiện lúc rebase.

## Khi nào KHÔNG song song

- Các đơn vị **không thật sự độc lập** → agent đua nhau ở merge, và bạn trả phí
  review trên 12 PR thay vì một
- **Năng lực review là cổ chai** → 12 PR nhỏ ngốn nhiều chú ý hơn 1 PR lớn, và
  reviewer mất context xuyên suốt giải thích vì sao các thay đổi thuộc về nhau
- Repo **không có test nhanh và hermetic** → fan-out nhân chi phí CI và diện tích flake
- Thay đổi mang tính **khám phá** → chẻ thành 5–30 đơn vị chốt sớm một thiết kế
  mà các đơn vị sau không sửa rẻ được

Với refactor **gắn kết chặt**: dùng **một** agent với worktree (cách ly, không fan-out) —
giữ lợi ích cách ly mà không trả phí chẻ nhỏ.
