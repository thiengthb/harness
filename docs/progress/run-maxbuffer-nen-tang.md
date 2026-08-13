# `run()`: cùng lớp lỗi với v2.75.0, ở tầng dưới nó (v2.76.0)

issue: **KHÔNG CÓ** — tìm ra bằng cách hỏi *"lô vừa merge sửa một lớp lỗi; còn chỗ nào nữa?"*
owner: @thiengthb · branch: `fix/run-maxbuffer-nen-tang` · worktree: **riêng**
(`/home/thien/projects/harness-wt-run-maxbuffer`) · platforms: n/a

<!--
  Neo chống trôi:
    node tooling/test-hooks.mjs   → 284/284, sàn 284
    node -e "…run('node',['-e','process.stdout.write(\"x\".repeat(2*1024*1024))'])…"
-->

## Vì sao lô này tồn tại

Một phiên khác vừa merge `v2.75.0`: `runConfigured` không khai `maxBuffer`, nên Node giết tiến
trình con ở 1 MiB và gate đỏ **theo lượng log** chứ không theo kết quả.

Câu hỏi tiếp theo là hiển nhiên và không ai hỏi: **còn chỗ nào nữa cùng lớp đó?**

Đếm: **67 lời gọi** `spawnSync`/`execFileSync` trong repo, **7** khai `maxBuffer`. Và chỗ quan
trọng nhất trong 60 chỗ còn lại là `run()` — nguyên thuỷ mà `git()` đi qua.

## Lỗi

`run()` mặc định `capture: true` ⇒ `stdio: 'pipe'`, và không khai `maxBuffer`.

```
run('node', ['-e', 'process.stdout.write("x".repeat(N))'])
  500 KiB → status 0 · đủ 512 000 byte
  2 MiB   → status 1 · 1 059 776 byte     ← con exit 0 ở CẢ HAI ca
```

Hai hại trong một dòng: lệnh **thành công đọc ra là hỏng**, và `stdout` **cắt cụt im lặng**.

## Ngòi nổ — đo, không đoán

`git status --porcelain` ≈ 45 byte/dòng ⇒ vỡ ở **~23 300 file bẩn**. `node_modules` thật trên
máy này: **57 737** (`sakubun`), **35 709** (`warehouse`). Một repo tiêu thụ quên gitignore là
đủ.

Hệ quả dây chuyền: `dirtyFiles` → `null` → `/handoff` ra `?` kèm *"không đọc được cây làm
việc"*. Đúng triệu chứng, **sai nguyên nhân** — và đó là nghi thức tôi vừa sửa ở `v2.74.0`, hỏng
vì một lý do hoàn toàn khác.

**Ở repo template thì chưa nổ:** output lớn nhất đo được là 32 952 byte (`test-hooks`). Bom hẹn
giờ, không phải sự cố đang xảy ra.

## Ba sửa

1. `run()` khai `maxBuffer`.
2. `status === null` tách khỏi `r.status ?? 1`. **Fail-đóng giữ nguyên** (`status: 1`) — lệnh bị
   cắt cụt không được đọc thành thành công — nhưng thêm `signal`/`error`/`detail`. Hợp đồng cũ
   `{status, stdout, stderr}` không đổi ⇒ 60+ nơi gọi không phải sửa.
3. `MAX_BUFFER` một chỗ. Ngưỡng vừa có bản chép thứ ba; ba bản chép thì trôi khỏi nhau.

## Bằng chứng

Sàn **283 → 284** · `284/284 exit 0` · doctor/migrations/evals exit 0.

Ca **hành vi**, không phải quét nguồn — khác `runConfigured` (cần project đã cấu hình).

| mutant | ca bị giết |
|---|---|
| bỏ `maxBuffer` | status=1 ở 2 MiB · stdout cắt còn 1 059 776 byte |
| tắt `status === null` | thiếu `error` · `detail` không nói "KHÔNG PHẢI mã lỗi" |
| literal quay lại | ngưỡng viết bằng số ở 1 chỗ |

Ca chiều ngược: `exit 3` ⇒ `status 3`, `detail` im. Không có nó thì một mutant trả `status: 1`
cho mọi thứ vẫn xanh.

## BÀI HỌC ĐẮT NHẤT CỦA LÔ — ca test đỏ ở Windows, và nó là CA TEST hỏng

Bản đầu ĐỎ ở `parity (windows-latest)` với `output 2 MiB ⇒ status=1, 0 byte` — **trông y hệt
chính cái bug đang sửa**. Nếu đọc vội, kết luận sẽ là "bản vá không chạy trên Windows".

Hai nguyên nhân, cả hai đều là tôi mượn ngữ nghĩa POSIX:

1. `run()` mặc định `shell: IS_WIN`. Trên Windows lệnh đi qua `cmd.exe`, dấu nháy trong
   `-e "…"` nát ⇒ node nhận mã lỗi cú pháp ⇒ 0 byte. Sửa: `shell: false` — cũng đúng là đường
   `git()` đi, tức nạn nhân chính của bug.
2. Ca "bị giết" dựng trên `SIGKILL`. **Windows không có signal**: `process.kill(pid,'SIGKILL')`
   ở đó là `TerminateProcess`, và `spawnSync` trả `signal: null`. Sửa: cò là **binary không tồn
   tại** (`ENOENT`) — khoá đúng nhánh `status === null` mà giống nhau ở cả ba OS.

Luật rút ra: **một ca test dựng trên ngữ nghĩa của MỘT hệ điều hành sẽ đỏ ở hệ kia, và nó đỏ
theo cách đọc giống hệt bug thật.** Chọn cò nào có nghĩa như nhau ở cả ba.

## Ghi chú phối hợp — đọc mục này nếu bạn là phiên sau

Lô này làm trong **worktree riêng**, cố ý. Lúc bắt đầu, một tác nhân khác đang chạy trọn vòng
phát triển trong worktree gốc — nhịp ~6 phút:

```
08:18 tạo nhánh · 08:24 commit v2.75.0 · 08:30 merge
08:36 tạo nhánh · 08:39 commit v2.75.1 · 08:45 merge
```

và có `harness.config.json` sửa dở chưa commit không phải của tôi. Hai phiên một worktree là
đúng thứ `AGENTS.md` cấm.

**Và cơ chế lẽ ra phải bắt việc này đã trượt.** `AGENTS.md` hứa *"sự có mặt của phiên được ghi
tự động, nên chồng lấn giữa hai phiên trên cùng máy được PHÁT HIỆN mà không ai phải gõ
`/claim`"*. Đo được: `.claude/state/sessions/13326.json` ghi **một lần** lúc SessionStart rồi
không bao giờ cập nhật — nó vẫn ghi `branch: chore/vong-hoc-2026-W32`, nhánh đã bị xoá 2 tiếng
trước. Một sổ chỉ ghi lúc khởi động thì không thấy được chồng lấn **phát sinh giữa phiên**, mà
đó mới là ca thường gặp.

Đã vào fixlog. Sửa nó cần `session-start.mjs` — vùng cấm ⇒ `/harness-propose`, việc của người.

**Đụng độ đã biết của lô này:** nó chạm `tooling/lib/harness.mjs` và `tooling/test-hooks.mjs` —
hai file phiên kia cũng đang sửa. Khác hàm (`run()` vs `runConfigured`), nhưng dòng `RATCHET`
thì chắc chắn đụng. Rebase trước khi mở PR.
