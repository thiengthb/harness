# knowledge/ — trí tuệ tích luỹ, mang đi được

> Đây là câu trả lời cho: *"làm sao agent thông minh lên nhờ project này, và mang
> sự thông minh đó sang project khác?"*

## Sự thật cần chấp nhận trước

**Model không học.** Model của bạn hôm nay giống hệt hôm qua. Khi bạn nói "agent
của tôi ngày càng giỏi trong repo này", điều thật sự xảy ra là *repo của bạn ngày
càng dễ cho một agent bất kỳ*.

Đó là tin tốt: nghĩa là sự cải thiện **chuyển được** — sang model mới, sang tool
khác, sang đồng nghiệp mới. Nhưng nó **không tự chuyển** sang repo khác của bạn.
Thư mục này là cơ chế để chuyển nó đi.

Và mặt tối: **harness không tự tốt lên theo thời gian — nó tự xấu đi**, vì codebase
đổi và model đổi mà tài liệu thì không. Nó chỉ tốt lên nếu có **vòng lặp có gate**.

## Vòng lặp 5 bước

```
1 CAPTURE  →  2 DISTILL  →  3 GATE  →  4 PROMOTE  →  5 PRUNE
    ↑                                                     │
    └─────────────────────────────────────────────────────┘
```

| Bước | Ở đâu | Ai làm | Lệnh |
|---|---|---|---|
| **1 Capture** | `.claude/telemetry/*.log` | máy + bạn (3 giây/lần) | `node tooling/fixlog.mjs "mô tả"` |
| **2 Distill** | `.claude/learnings/<năm>-W<tuần>-<tên>.md` | agent, thứ Sáu | `/harness-retro` |
| **3 Gate** | `evals/` | máy | `node evals/run.mjs` |
| **4 Promote** | `knowledge/lessons/*.md` | **người** (DRI) | `/knowledge-promote` |
| **5 Prune** | mọi nơi | người, 2 tuần/lần | `/entropy-sweep` |

Bước 3 là bước không được bỏ. **Không có gate thì "cải thiện harness" chỉ là phình harness.**

## Điều kiện để một bài học được PROMOTE

```
☐ Xuất hiện ≥2 lần độc lập, có SỐ PR/commit cụ thể  (một lần là ngẫu nhiên)
☐ Được biểu diễn ở dạng RẺ NHẤT khả thi (bảng dưới)
☐ Eval regression không tụt
☐ Có "điều kiện thoát" viết rõ — làm sao biết nó hết cần thiết
☐ Có scope: universal / stack:<tên> / project
```

## Thứ tự biểu diễn — chọn cái CAO NHẤT khả thi

Đây là quy tắc quan trọng nhất của cả thư mục này.

| # | Dạng | Độ bền | Ghi chú |
|---|---|---|---|
| 1 | **Test / contract** | vĩnh viễn | Rẻ nhất để bảo trì. Luôn thử cái này trước. |
| 2 | **Generator / codemod** | rất cao | Boilerplate không sinh ra thì không cần dọn |
| 3 | **Computational control** (lint, hook, dep rule, CI check) | cao | Tất định, không tranh luận được |
| 4 | **Verification skill** | trung bình | Cho check mà linter không biết |
| 5 | **Gotcha 1 dòng** trong AGENTS.md | trung bình | |
| 6 | **Skill** (kiến thức quy trình) | trung bình | |
| 7 | **Rule cứng / negative constraint** | **thấp nhất** | Đắt nhất, mục nhanh nhất. Chỉ khi 1–6 không được. |

> Cùng một bài học ("agent quên chạy gen sau khi sửa contract") có thể là:
> **(1)** CI check `gen && git diff --exit-code` — bền vĩnh viễn, hay
> **(7)** một dòng "LUÔN chạy gen" trong CLAUDE.md — sẽ bị bỏ qua trong session dài
> và thành rác trong 6 tháng.
> **Cùng bài học, chênh 10× giá trị dài hạn.**

## Scope — quyết định thứ gì đi được sang project khác

| Scope | Nghĩa | Test | Ví dụ |
|---|---|---|---|
| `universal` | Đúng ở **mọi** repo bạn từng làm | *"Xoá repo này, mục này còn giá trị không?"* → còn | "Không bao giờ merge tay lockfile", DCG |
| `stack:<tên>` | Đúng cho một stack | → còn, nếu stack còn | "Metro cần `--clear` sau khi sửa package nội bộ" |
| `project` | Chỉ đúng ở đây | → không còn | "Port 5432 phải `db:up` trước" |

`export` chỉ mang đi `universal` + `stack:*` (cấu hình ở `harness.config.json → knowledge.exportScopes`).

## Mang trí tuệ đi

```bash
# Ở repo đã học được nhiều — đóng gói
node tooling/knowledge/export.mjs                # → .harness-pack/

# Ở repo mới — nạp vào
node tooling/knowledge/import.mjs ../repo-cu/.harness-pack
node tooling/knowledge/import.mjs https://github.com/org/harness-pack   # từ repo trung tâm
```

**Import KHÔNG tự ghi vào `.claude/`.** Nó đặt mọi thứ vào `knowledge/incoming/`
và in báo cáo. Người xem rồi mới áp dụng. Lý do: một agent (hoặc một pack) sửa
được cấu hình harness của chính nó thì có thể tự leo thang quyền — và sandbox
thông thường không chặn được điều đó.

Khi có ≥2 repo, tách `.harness-pack/` thành **một repo trung tâm** và cho các repo
`import` từ đó theo **tag/sha, không bao giờ theo `main`**: một commit sai ở `main`
làm hỏng đồng thời mọi repo của bạn.

## Kiểm tra sức khoẻ

```bash
node tooling/knowledge/lint.mjs     # frontmatter hợp lệ? bài học nào quá hạn review?
node tooling/harness-size.mjs       # harness đang phình hay đang co?
```

Chỉ số quan trọng nhất, và nó **ngược trực giác**:

> **Một harness đang tốt lên thường đang NHỎ ĐI** — vì mỗi bài học được đẩy xuống
> dạng biểu diễn rẻ hơn (test, generator, hook) thay vì tích thành văn bản.
