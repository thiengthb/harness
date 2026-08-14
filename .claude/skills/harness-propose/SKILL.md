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

Đây là quyết định quan trọng nhất của skill này. Đi từ trên xuống, dừng ở cái đầu tiên khả thi:

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
3. **KHÔNG xoá mục cũ — chuyển sang `.claude/whats-new-archive.md`** (dán lên đầu). File chính
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
