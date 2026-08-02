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
