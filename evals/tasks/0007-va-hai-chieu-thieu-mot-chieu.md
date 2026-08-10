---
id: "0007"
kind: past-failure
type: regression
maxTurns: 55
maxMinutes: 30
origin: "Gate cho knowledge/lessons/0007-va-hai-chieu-thieu-mot-chieu.md — 4 lần trong một phiên: PR #117 #118 #121"
---

# Agent có viết ca cho CHIỀU CÒN LẠI không

> **Ngân sách ở trên là SỐ ĐO, không phải số đoán.** Lượt chạy 2026-08-10 (Claude Code 2.1.226,
> Opus 5, trần nới rộng để nó KHÔNG bó) dùng **26 lượt / 13.5 phút**. Trần đặt gấp đôi số đo:
> một lần chạy bình thường phải nằm dưới ngưỡng cảnh báo `budget.alertAtPercent`, nếu không thì
> cảnh báo kêu ở mọi lượt và sẽ bị tắt.
>
> Trần cũ `20 lượt / 12 phút` là số đoán từ ngày dựng task, và **cả hai đều bó**:
> xem #144 · `docs/progress/144.md`.


Task nhóm **past-failure**. Mọi bản vá dạng *"đừng đếm cái này"* / *"giữ cái kia"* có
**hai** chiều nói dối, và chiều thứ hai không có triệu chứng:

```
chiều A (dễ nhớ)   đếm/giữ thứ KHÔNG nên   → sai, và ai cũng thấy vì nó ồn
chiều B (hay quên) BỎ ĐẾM/BỎ GIỮ thứ nên   → mẫu số rỗng, bản ghi mới bị nuốt — IM LẶNG
```

Bản vá cực đoan nhất (`measured = false`, strip-list rỗng, `...prev` đặt sai chỗ) **thoả mãn
mọi ca viết cho chiều A**. Nó không đỏ ở đâu cả — nó chỉ làm phép đo thôi đo gì.

## Prompt giao cho agent

```
Trong tooling/lib/harness.mjs có hàm mergeBaseline(prev, {version, at, found}).
Nó hợp nhất một bản rà mới vào baseline cũ, và baseline đó có nhiều cơ chế cùng ghi.

Viết test cho hàm này. Đừng sửa hàm — chỉ viết test.
```

Prompt cố tình **không nhắc** "hai chiều", "sửa quá tay", hay "mutation". Một prompt nói
*"nhớ viết ca chiều ngược nhé"* thì không đo được gì — nó chỉ đo khả năng đọc chỉ thị.

## Chấm lớp 1 — tất định

```bash
node -e "
import('./tooling/lib/harness.mjs').then(m => {
  const bad = [];
  const NEW = { version: '9.9.9', at: 'moi', found: 'ghi chu moi' };
  const prev = { nativeEvents: { version: 'x', events: ['a'] }, history: [{ version: '1.0.0', at: 'cu', found: 'cu' }] };
  const r = m.mergeBaseline(prev, NEW);
  if (!r.nativeEvents) bad.push('mergeBaseline: khoa cua co che KIA bi xoa (chieu A)');
  if (r.history[0].found !== 'ghi chu moi') bad.push('mergeBaseline: ban ghi MOI bi ...prev nuot (chieu B)');
  if (r.reviewedVersion !== '9.9.9') bad.push('mergeBaseline: reviewedVersion cu thang ban moi (chieu B)');
  if (m.rateLimitHitsIn('', 0) !== 0) bad.push('rateLimitHitsIn: so DOC DUOC ma rong phai la 0');
  if (m.rateLimitHitsIn(null, 0) !== null) bad.push('rateLimitHitsIn: KHONG DOC DUOC phai la null, khong phai 0');
  if (m.budgetStatus({ cap: 0, plan: 'flat', rateLimitHits: 0 }).mode !== 'flat-ok') bad.push('budgetStatus: 0 lan cham bi doc thanh chua do');
  if (m.budgetStatus({ cap: 0, plan: 'flat', rateLimitHits: null }).mode !== 'flat-unmeasured') bad.push('budgetStatus: chua do bi doc thanh 0 lan cham');
  if (bad.length) { console.error(bad.join(' | ')); process.exit(1); }
});
"
node tooling/test-hooks.mjs
node tooling/test-evals.mjs
```

Bảy khẳng định trên **chạy được mà không cần agent** — cố ý, cùng lý do với `0005` và `0006`.
Mỗi cặp khoá **hai chiều của cùng một quyết định**: giữ-quá-ít với giữ-quá-nhiều, `0` với
`null`. Bỏ một vế của bất kỳ cặp nào thì cặp đó thôi là một phép đo.

Hai dòng cuối là oracle thật: `test-hooks` chứa các ca chiều-ngược đã được mutation chứng minh
(`⑮` của #117, vế hai của `⑰`, `⑳`, và ca ② của `mergeBaseline`), `test-evals` chứa phần còn
lại của lớp eval.

## Chấm lớp 2 — đọc trace

- [ ] agent viết ít nhất **một** ca cho chiều *"bản ghi mới phải THẮNG"*, không chỉ ca
      *"khoá cũ phải SỐNG SÓT"*
- [ ] agent **chạy thử một mutant** (đảo `...prev` xuống cuối, hoặc xoá nó) để chứng minh ca
      của nó có bắt được gì — hoặc nói rõ rằng nó chưa chứng minh điều đó
- [ ] agent **KHÔNG** sửa `mergeBaseline` để "cho dễ test" (task nói rõ: chỉ viết test)
- [ ] agent phân biệt `0` với `null` nếu nó đụng tới `rateLimitHitsIn`

Mục 2 là mục hay bị bỏ nhất và là mục đáng giá nhất: một bộ ca **chưa từng thấy đỏ** không
chứng minh được gì, và đó đúng là trạng thái của cả bốn lần thất bại đã ghi trong `origin`.

## Vì sao task này ở trong bộ eval

Nó là **gate** của `knowledge/lessons/0007-va-hai-chieu-thieu-mot-chieu.md`. Bài học đó nói
*"bản vá hai chiều mà chỉ viết ca một chiều"*; task này là cách duy nhất biết luật đó **còn
hiệu lực** sau khi bạn đổi model hoặc sửa `AGENTS.md`.

Bốn lần xuất hiện của nó đều là **tự bắt trong lúc viết test**, không lần nào thành một lỗi
phải sửa tay — nên `fixlog` không thấy, và `/harness-retro` không bao giờ nêu nó lên. Vòng học
chỉ thấy thứ **đã gây đau**; đây là thứ suýt gây đau. Không có gate này, bài học sẽ mục im
lặng đúng như cách nó suýt không bao giờ được viết ra.
