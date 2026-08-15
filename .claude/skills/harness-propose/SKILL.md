---
name: harness-propose
description: Đề xuất một thay đổi harness (rule, skill, hook, test, generator).
  Dùng khi bạn thấy agent làm sai cùng một thứ nhiều lần, khi bị một hook chặn mà
  bạn nghĩ hook sai, hoặc khi muốn thêm một luật cho team.
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash]
disable-model-invocation: true
---

# Đề xuất thay đổi harness

Bạn **KHÔNG** được sửa `.claude/settings.json`, `.claude/hooks/`, `.mcp.json`,
`AGENTS.md`, `harness.config.json`. Hook sẽ chặn. **Đó là cố ý** — hai lý do:

1. **Bảo mật.** Agent sửa được hook của chính nó thì tự leo thang quyền, và
   sandbox thông thường không chặn được điều đó.
2. **Lòng tin trong đội.** Hook đổi lặng lẽ = "agent hôm nay lạ lắm" = harness mất uy tín.

Đây là con đường hợp pháp.

## 1. Kiểm điều kiện

```
node tooling/fixlog.mjs --top
```

**≥2 lần xuất hiện độc lập, có số PR/commit cụ thể.** Một lần là ngẫu nhiên.
Chưa đủ 2 lần → ghi `fixlog` rồi thôi, quay lại sau.

## 2. Chọn dạng biểu diễn RẺ NHẤT khả thi

Đây là quyết định quan trọng nhất của skill này. Đi từ trên xuống, dừng ở cái đầu tiên khả thi.

### Trước cả dòng 1: ba bậc bạn KHÔNG viết

**Claude Code sở hữu RUNTIME — harness sở hữu CHÍNH SÁCH.** Runtime = vòng lặp, tool,
context, quyền, cách ly, sự kiện vòng đời. Chính sách = *"xong" nghĩa là gì ở repo này*,
ai được quyết, cái gì phải có bằng chứng. Hệ quả: harness **không cạnh tranh được** với
Claude Code — nó chỉ có thể LẤP hoặc TRÙNG các điểm mở rộng, và mọi chồng chập là dấu
hiệu đang lấp một chỗ đã được lấp ở tầng thấp hơn.

| ai cưỡng chế | phủ được gì mà bảng dưới không phủ |
|---|---|
| managed settings | người dùng **không override được** |
| `permissions` deny/ask | phủ cả `Bash` đọc file; hợp nhất vào ranh giới sandbox |
| sandbox OS | phủ cả **tiến trình con** |

Bậc thấp hơn ⇒ cưỡng chế **trước** khi hook chạy. Xem `.claude/rules/danger-zones.md`
§Cưỡng chế: 5/5 biến thể nguỵ trang bằng nháy đi lọt tầng hook và bị tầng `deny` bắt.

**Bài test bốn câu — dừng ở câu đầu tiên trả lời "có":**

```
1. CC có bề mặt native làm đúng việc này chưa?  → có: DÙNG NATIVE, xoá bản tự viết
2. Nó có cần CỬA THOÁT hoặc LOGIC ĐỘNG không?   → có: hook, và chỉ hook
3. Nó có phải chính sách đặc thù repo/đội?      → có: GIỮ, đây là chỗ bất khả thay thế
4. Nó có được MÁY đọc không?                    → không: thuế context, không phải harness
```

> **Một điểm mở rộng native không mặc định là chỗ để QUAN SÁT.** Có ba loại: *observer*
> (`InstructionsLoaded`), *gate* (`SubagentStop`), và **provisioner** (`WorktreeCreate` /
> `WorktreeRemove`) — nơi stdout và exit code **LÀ hợp đồng**. Cắm một script advisory vào
> một provisioner không hỏng ở hook: nó hỏng ở cơ chế mà hook vừa giành mất quyền sở hữu,
> và triệu chứng hiện ra vài ngày sau. Nguồn mạnh nhất cho hợp đồng của một sự kiện là
> **schema nhúng trong binary CLI đang chạy**, không phải tài liệu — tài liệu nói đúng về
> *tên* sự kiện và không nói đủ về *hợp đồng*.

### Rồi mới tới bảng

| # | Dạng | Ví dụ |
|---|---|---|
| 1 | **Test / contract** | test hoá hành vi đúng thay vì mô tả nó |
| 2 | **Generator / codemod** | boilerplate không sinh ra thì không cần dọn |
| 3 | **Computational control** | CI check, lint rule, dep rule, hook |
| 4 | **Verification skill** | check mà không linter nào biết |
| 5 | **Gotcha 1 dòng** trong AGENTS.md | |
| 6 | **Skill** | kiến thức quy trình |
| 7 | **Rule cứng** | ← đắt nhất, mục nhanh nhất |

> "Agent quên chạy gen" thành **(1)** CI check `gen && git diff --exit-code` là
> bền vĩnh viễn; thành **(7)** một dòng "LUÔN chạy gen" trong CLAUDE.md sẽ bị bỏ qua
> trong session dài và thành rác trong 6 tháng. **Cùng bài học, chênh 10× giá trị.**

Chọn 6 hoặc 7? Phải giải thích **vì sao 1–5 không khả thi**.

## 3. Ghi đề xuất

Vào `.claude/learnings/<năm>-W<tuần>-<tên-bạn>.md` — **một file của riêng bạn mỗi tuần,
không bao giờ conflict với người khác**. Đây là kỹ thuật chống conflict rẻ nhất
trong cả harness: chia file theo người/theo issue thay vì cùng ghi vào một file.

Dùng `.claude/learnings/_TEMPLATE.md`. Mỗi mục bắt buộc có:

- Triệu chứng + **số PR/commit cụ thể** (≥2)
- Lớp lỗi (context / tools / orchestration / state / verification / recovery / economics)
- Dạng biểu diễn chọn + vì sao không dùng được dạng rẻ hơn
- Tầng: org / user / project / project-local
- Scope: `universal` / `stack:<tên>` / `project` ← quyết định nó có đi được sang repo khác không
- **Điều kiện thoát**: làm sao biết nó hết cần thiết. **Bắt buộc.**
  Không có mục này, harness của bạn không bao giờ co lại được.

## 4. Mở issue

Label `harness`, link tới mục vừa ghi. Tiêu đề = triệu chứng, không phải giải pháp.

## 5. DỪNG

DRI quyết định promote. **Đừng tự áp dụng.**
Sau khi được duyệt, dùng `/knowledge-promote` để đưa vào `knowledge/lessons/`.

## 6. Sau khi được duyệt: canary, rồi THÔNG BÁO

Hai bước này ở đây — trong artefact người thi hành mở — chứ không ở một skill riêng.
Một luật nằm trong skill mà không ai mở lúc thi hành thì **đọc như là đã có phủ sóng**.

**Canary trước.** Đừng bao giờ merge thay đổi hook vào `main` rồi mới biết nó chậm
4 giây trên máy Windows:

```
Đổi hook/settings.json
  → 1 người dùng thử 2 ngày (qua .claude/settings.local.json)
  → chạy eval set:  node evals/run.mjs
  → CI parity 3 OS xanh
  → PR + cập nhật .claude/whats-new.md
  → merge
```

**Rồi thông báo.** `.claude/whats-new.md` **không** nằm trong `paths.harness` — cố ý:
thông báo thay đổi phải rẻ, nếu không sẽ không ai làm.

1. Đổi dòng `<!-- version: YYYY-MM-DD-x -->` ở đầu file — SessionStart hook so dòng này
   với `.claude/state/whats-new-seen.json` và **in nội dung một lần** cho mỗi người.
2. Thêm mục mới **lên trên cùng**, tối đa ~5 dòng: *cái gì đổi* · *người dùng phải làm gì
   khác đi* · *bị chặn sai thì nhắn ai*.
3. **KHÔNG xoá mục cũ — chuyển sang `whats-new-archive.md`** cạnh nó (dán lên đầu; file lưu
   trữ chỉ có ở repo template, cố ý không ship). File chính
   phải **ngắn**, và đó là con số chứ không phải cảm tính: `session-start.mjs` in
   `.slice(0, 700)` ký tự, tức chừng **hai mục**. Mọi mục sau đó không có đường nào tới người
   đọc, mà vẫn theo `apply-to` xuống MỌI repo tiêu thụ — đo 2026-08-14: 78 mục, 1 081 dòng.
   Trần **220 dòng**, `test-hooks` cưỡng chế. Lưu trữ KHÔNG nằm trong `SEED` nên nó không ship.

   > Bản trước của dòng này viết *"xoá mục cũ hơn 1 tháng"*, trong khi `harness-doctor.mjs`
   > (`HISTORICAL`) và `entropy-scan.mjs` xếp `whats-new.md` vào nhóm **hồ sơ lịch sử,
   > append-only**. Hai chỉ thị ngược nhau về cùng một file, và `.claude/rules/README.md` nói
   > rõ chỉ thị xung đột làm model kém đi. Chuyển-vào-lưu-trữ giữ được cả hai tính chất.

**Bỏ bước này = nửa team hành xử theo rule cũ, nửa theo rule mới, và không ai biết tại
sao agent hôm nay lạ.** Đây là loại conflict tệ nhất vì không công cụ nào báo —
`entropy-scan` chỉ cảnh báo được sau 14 ngày.

## Nếu bạn đang đề xuất vì bị hook chặn sai

Nói rõ trong đề xuất: lệnh/file gì, hook nào, vì sao bạn tin nó sai.
**Đừng tự tắt hook.** Một người tắt hook = team có hai chuẩn, và không ai biết.
