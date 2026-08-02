# Definition of Ready & Definition of Done

Hai artifact rẻ nhất mà tác dụng lớn nhất trong quy trình nhóm, vì chúng **loại bỏ
tranh luận lặp lại**. Chốt một lần, dán vào đây, không bàn lại mỗi sprint.

---

## Definition of Ready — một issue được phép claim khi

- [ ] Có **acceptance criteria verify được BẰNG MÁY** (không phải "hoạt động tốt")
- [ ] Đã nêu rõ **file/module nào dự kiến chạm** → để phát hiện chồng lấn TRƯỚC
- [ ] Nếu chạm contract/public surface: đã ghi rõ và đã ping owner của consumer
- [ ] Ước lượng hoàn thành được **trong 1 session**. Không → chẻ nhỏ
- [ ] Đã ghi **platform nào trong scope** (khớp với `features/<id>.json`)
- [ ] Có **owner: một người**, không phải "team"

Thiếu bất kỳ dòng nào → **không claim**. Đây là lý do đủ để từ chối, không cần xin phép.

---

## Definition of Done — cùng ngôn ngữ với `features/<id>.json`

- [ ] Mọi platform trong scope: `passes: true` **VÀ** có `evidence` trỏ tới output THẬT
- [ ] Gate `preMerge` xanh (`harness.config.json → gates.preMerge`)
- [ ] `typecheck` **TOÀN REPO** xanh, không chỉ package đang sửa
- [ ] PR template đầy đủ, **mục Bằng chứng không trống**
- [ ] Đã qua auto-review, finding blocking đã xử
- [ ] Có 1 approve người (2 nếu chạm path CODEOWNERS nặng)
- [ ] Merge queue xanh → merged
- [ ] Nhánh + worktree đã xoá
- [ ] Nếu phải sửa tay việc agent làm: đã `node tooling/fixlog.mjs "..."`

---

## Luật cứng

> **DoD là MÁY ĐỌC ĐƯỢC ở mức tối đa.**
> Mọi mục có thể biến thành CI check thì **phải là CI check**, không phải checkbox.

Checkbox mà con người tự tick là *ý kiến*. CI check là *sự thật*.

Mục nào trong DoD ở trên còn là checkbox? Đó là backlog harness của bạn.
Mỗi lần chuyển được một mục từ checkbox → CI check, bạn xoá vĩnh viễn một lớp lỗi.
