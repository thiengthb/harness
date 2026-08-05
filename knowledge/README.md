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

## Hai vòng, không phải một

Vòng nhỏ chạy **trong một project**. Vòng lớn chạy **giữa các project và template** —
và nếu chỉ có vòng nhỏ thì trí tuệ tích ở lá, không bao giờ về gốc: project bạn tạo
tháng sau vẫn khởi động từ đúng số bài học seed, dù ba project cũ đã học được 30 thứ.

```
VÒNG NHỎ — trong một project
  1 CAPTURE → 2 DISTILL → 3 GATE → 4 PROMOTE → 5 PRUNE
      ↑                                            │
      └────────────────────────────────────────────┘

VÒNG LỚN — giữa các project và template
                    ┌──────────────┐
        upstream ───▶│   TEMPLATE   │─── apply-to / upgrade ───┐
            │        └──────────────┘                          │
            │                                                  ▼
       ┌────┴─────┐                                    ┌───────────────┐
       │ project A│◀──── export / import / accept ────▶│   project B   │
       └──────────┘                                    └───────────────┘
```

### Vòng nhỏ

| Bước | Ở đâu | Ai làm | Lệnh |
|---|---|---|---|
| **1 Capture** | `.claude/telemetry/*.log` | máy + bạn (3 giây/lần) | `node tooling/fixlog.mjs "mô tả"` |
| **2 Distill** | `.claude/learnings/<năm>-W<tuần>-<tên>.md` | agent, thứ Sáu | `/harness-retro` |
| **3 Gate** | `evals/` | máy | `node evals/run.mjs` |
| **4 Promote** | `knowledge/lessons/*.md` | **người** (DRI) | `/knowledge-promote` |
| **5 Prune** | mọi nơi | người, 2 tuần/lần | `/entropy-sweep` |

Bước 3 là bước không được bỏ. **Không có gate thì "cải thiện harness" chỉ là phình harness.**

### Bước 1 có HAI nguồn, và chỉ một trong hai là thẩm quyền

Claude Code có **auto-memory** riêng (`~/.claude/projects/<repo>/memory/`) — nó tự ghi
quan sát và **nạp 200 dòng đầu `MEMORY.md` MỖI phiên**. Tức là nó là **chỉ thị thật**,
không phải ghi chú bên lề.

| | auto-memory | `knowledge/lessons/` |
|---|---|---|
| Nội dung | quan sát THÔ, được phép sai | quyết định **đã qua gate** |
| Phạm vi | một máy, một người | cả đội, mang được sang repo khác |
| Review | không ai | PR |
| Commit | **không bao giờ** | có |

Nó là tầng **CAPTURE miễn phí** của vòng nhỏ: `/harness-retro` bước 1 đọc `MEMORY.md`
như một **đầu vào**, không như thẩm quyền. Mục nào xuất hiện ở **≥2 máy** là ứng viên
promote — đó là cách một bài học `universal` đủ ngưỡng *"2 lần độc lập"*.

**Một sự thật nằm ở cả hai chỗ là một LỖI.** Nếu auto-memory mâu thuẫn với
`knowledge/lessons/`, Claude được phép chọn tuỳ ý và **không gì báo cho bạn**.

### Vòng lớn

| Chiều | Lệnh | Ghi vào |
|---|---|---|
| project → project (ngang) | `export.mjs` → `import.mjs` | `knowledge/incoming/<pack>/` |
| project → **template** (lên) | `upstream.mjs` | `<template>/knowledge/incoming/<project>/` |
| duyệt & nhận | `accept.mjs` | `knowledge/lessons/` |
| template → project (xuống) | `apply-to.mjs` · `upgrade.mjs` | lớp cơ chế |

**Chiều lên là chiều làm template tốt lên.** Nó gửi ba thứ và chỉ ba thứ:

1. Bài học mang đi được — trừ `status: candidate` (chưa xác nhận ở đâu thì gửi lên
   là khuếch đại tin chưa kiểm)
2. **Gate của chúng** (`evals:`) — không có gate thì bên nhận có cơ chế mà không có
   cách biết cơ chế đó còn đúng ở repo họ
3. **Diff cơ chế** — file harness project đã sửa so với `.claude/harness-manifest.json`.
   Mỗi file là một trong hai: tuỳ biến đặc thù (bỏ, chuyển ra hook riêng) hoặc
   cải tiến chung template đang thiếu (nhận). **Người phân loại, không phải script.**

```bash
node tooling/knowledge/upstream.mjs                       # xem trước
node tooling/knowledge/upstream.mjs /đường/dẫn/template --apply
```
Khai một lần: `harness.config.json → knowledge.upstream`.

## Nghịch lý ngưỡng 2 lần — và cách giải

Điều kiện promote là "xuất hiện ≥2 lần độc lập". Nhưng **bài học càng universal thì
càng phân tán mỏng**: project A gặp một lần, B gặp một lần, không repo nào đủ 2.
Nghĩa là luật đó lọc bỏ đúng những bài học đáng mang đi nhất.

`accept.mjs --merge` cộng bằng chứng từ repo khác vào bài học có sẵn:

```bash
node tooling/knowledge/accept.mjs --list
node tooling/knowledge/accept.mjs <pack>/<file.md> --merge L0001
```

1 + 1 = 2, và bằng chứng từ hai repo **độc lập** mạnh hơn hai lần trong cùng một
repo — vì nó đã loại được giả thuyết *"chỉ đặc thù project này"*. Trường `seen-in`
ghi lại các repo đã gặp; thấy ở ≥2 repo thì `scope: project` tự leo lên `universal`.

Hai thứ được gác bằng máy:

- **Chống lạm phát bằng chứng.** Bài học nảy vòng A→B→A sẽ mang bằng chứng gốc của A
  quay về A dưới nhãn của B. So khớp bỏ mọi tiền tố `[...]` rồi mới đối chiếu nội
  dung, nên gộp lại lần hai là no-op — nếu không, ngưỡng "2 lần độc lập" thành vô nghĩa.
- **`status: candidate`.** Bài học nhận từ repo khác chưa từng xảy ra ở repo này.
  `candidate` không được export, không được gửi lên. Sau 90 ngày chưa gặp lần nào →
  `lint` nhắc: nó không đúng ở đây, retire nó.

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
và in báo cáo. Người xem rồi mới áp dụng — bằng `accept.mjs`, không phải copy tay.
Lý do: một agent (hoặc một pack) sửa được cấu hình harness của chính nó thì có thể
tự leo thang quyền — và sandbox thông thường không chặn được điều đó.
`upstream.mjs` cũng vậy, và ở đó còn quan trọng hơn: một project ghi thẳng vào
template là đường supply-chain vào **mọi** project khác.

Nhưng "chờ người duyệt" mà không có hạn thì thành "không bao giờ", và `incoming/`
tích thành bãi rác ai cũng tưởng là backlog. `entropy-scan.mjs` nhắc khi một pack
chờ hơn 30 ngày; `accept.mjs --reject "lý do"` ghi quyết định BỎ vào
`knowledge/DECISIONS.log` (được commit — `incoming/` thì không) để lần sau pack đó lại đến bạn không duyệt lại
cùng một thứ.

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
