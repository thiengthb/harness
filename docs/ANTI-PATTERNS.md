# Anti-pattern

Danh mục tra cứu. Khi có gì đó sai mà bạn chưa gọi tên được, tìm ở đây trước.

---

## A. Nhóm context — làm model KÉM ĐI

| # | Anti-pattern | Vì sao hỏng | Sửa |
|---|---|---|---|
| A1 | **CLAUDE.md/AGENTS.md 800 dòng** | rule quan trọng chìm trong nhiều → bị bỏ qua | ≤150 dòng. Mỗi dòng hỏi: *bỏ dòng này Claude có sai không?* Không → xoá |
| A2 | **Over-constraining** — viết nhiều rule cấm "cho chắc" | chỉ thị xung đột buộc model tốn năng lực dàn hoà **trước khi** làm việc thật | chỉ giữ cấm cho 3 nhóm nguy hiểm thật (production, secret, migration đã merge) |
| A3 | **Cho ví dụ dùng tool** | ví dụ **giới hạn không gian khám phá** của model đời mới | thiết kế interface biểu đạt hơn. Tool cần ví dụ mới dùng được → **tool sai**, không phải thiếu ví dụ |
| A4 | **Nhắc lại rule ở nhiều nơi cho chắc** | trùng lặp = xung đột tiềm năng + thuế context mỗi request | một nơi duy nhất; hướng dẫn tool đặt trong description của tool |
| A5 | **Spec bằng văn xuôi** | mất thông tin, không verify được | test suite > code thật > contract > HTML mockup > rubric > screenshot > văn xuôi |
| A6 | **"Persona" prompt** ("bạn là senior 12 năm kinh nghiệm") | không có tác dụng đo được, tốn context | xoá |
| A7 | **Auto-gen AGENTS.md rồi để nguyên** | lặp lại thứ đã có trong repo → giảm success rate, tăng chi phí | dùng làm *inventory*, rồi cắt tàn nhẫn |
| A8 | **Viết "Project Structure" khi layout theo convention** | agent tự navigate tốt; bản đồ thư mục không giúp trong task delivery | xoá; giữ nếu cần cho orientation/spec/ADR |

---

## B. Nhóm verification — bạn tưởng đã xong

| # | Anti-pattern | Vì sao hỏng | Sửa |
|---|---|---|---|
| B1 | **Không có check agent tự chạy được** | agent dừng khi việc *trông có vẻ* xong; **bạn** thành verification loop | một lệnh verify + Stop hook |
| B2 | **Chỉ unit test + curl** | "pass test" nhưng feature không chạy | bắt buộc E2E qua browser/device |
| B3 | **Agent tự chấm bài của chính nó** | LLM tự chấm thì luôn tự khen | evaluator context mới, không có quyền sửa |
| B4 | **Agent sửa test cho pass thay vì sửa code** | gate xanh, PR đẹp, lớp bảo vệ vừa bị tháo | `protect-tests.mjs` + reviewer đối kháng |
| B5 | **`feature_list` phẳng cho app multiplatform** | "xong" nghĩa là "xong web" | ma trận platform + evidence bắt buộc |
| B6 | **Tin binary pass/fail cho hệ bất định** | tới ~23% lần "pass" là **lucky pass** (retry mù, vòng regression) | chấm cả quá trình; `pass^k` cho thứ phải đáng tin |
| B7 | **Chạy theo MỌI finding của reviewer** | reviewer được giao "tìm gap" thì **luôn** tìm ra gap → over-engineering | nói rõ: chỉ flag gap ảnh hưởng correctness/requirement |

---

## C. Nhóm kinh tế & giới hạn

| # | Anti-pattern | Vì sao hỏng | Sửa |
|---|---|---|---|
| C1 | **Long-running không budget cap** | đốt ngân sách một tuần trong một buổi chiều | 5 guardrail ở `docs/ECONOMICS.md` |
| C2 | **Fan-out 12 agent mà chỉ có 2 người review** | 12 PR nhỏ ngốn nhiều chú ý hơn 1 PR lớn; reviewer mất context xuyên suốt | công thức WIP. **Nâng năng lực review TRƯỚC** |
| C3 | **Dùng chung một account** | quota và rate limit đánh nhau; không truy được ai làm gì | mỗi người một seat. Không thương lượng |
| C4 | **Coi tốc độ ship là chỉ báo thành công duy nhất** | tốc độ tăng trước, chất lượng tụt sau, độ trễ **dài hơn một sprint** | đo cặp: tốc độ **và** CAPO + revert 7 ngày + PR chờ review |
| C5 | **Thêm session khi muốn nhanh hơn** | nghẽn dịch sang chỗ đắt hơn (review) | làm PR nhỏ hơn và review rẻ hơn |

---

## D. Nhóm phối hợp nhóm

| # | Anti-pattern | Vì sao hỏng | Sửa |
|---|---|---|---|
| D1 | **Không có DRI** | harness thành tài sản vô chủ → mục trong ~6 tuần | chỉ định **một** người có **quyền quyết** và **trách nhiệm giữ mới** |
| D2 | **Ai cũng sửa được `.claude/settings.json`** | hook đổi lặng lẽ → "agent hôm nay lạ lắm" → mất lòng tin | CODEOWNERS + `protect-harness` + canary |
| D3 | **Không có `settings.local.json`** | không có van xả áp → người ta sửa file chung để có thứ mình cần | tạo sẵn + `.example` + nói rõ nó tồn tại để làm gì |
| D4 | **Trộn nhiều vendor agent trong một repo** | tỉ lệ conflict tăng ~gấp đôi (41,7% vs 19,8%) | chuẩn hoá **một** agent chính mỗi repo |
| D5 | **Không có merge queue** | conflict ngữ nghĩa vỡ trên main, lặp lại mãi | bật merge queue — việc ROI cao nhất |
| D6 | **Một file chung cho nhiều người ghi** | conflict mỗi ngày ở chỗ git không giúp được | chẻ theo người / theo issue |
| D7 | **Serialize mọi thứ vì sợ conflict** | ~4/5 cặp song song không conflict → ném throughput để tránh chi phí xác suất | leo ladder, serialize là bậc cuối |
| D8 | **Đổi harness rồi không thông báo** | nửa team hành xử theo rule cũ | `/whats-new` + canary |
| D9 | **Review comment lặp lại mà không thành rule** | team dạy lại cùng một bài mỗi tháng | checkbox trong PR template |
| D10 | **Agent tự trị push lên nhánh của người** | xoá/ghi đè việc đang làm | tiền tố `auto/`; DCG chặn force push |
| D11 | **Worktree không gitignore / không dọn** | commit worktree vào repo; ổ cứng và file-watcher cạn | `.gitignore` + `/wt` mỗi sáng |

---

## E. Nhóm môi trường

| # | Anti-pattern | Vì sao hỏng | Sửa |
|---|---|---|---|
| E1 | **Hook viết bằng bash trong team đa OS** | harness *không tồn tại* với thành viên Windows; người đó lặng lẽ tắt hook | Node `.mjs` + CI matrix 3 OS |
| E2 | **Không commit `.gitattributes`** | mọi PR "đổi hết file"; conflict giả mỗi ngày | 5 dòng, làm hôm nay |
| E3 | **Repo trong OneDrive / trên `/mnt/c`** | sync + `node_modules` = ác mộng; I/O cực chậm | `C:\dev\` hoặc `~/dev/` trong WSL |
| E4 | **`core.ignorecase` mặc định** | `Button.tsx` vs `button.tsx` — build vỡ **chỉ ở CI** | `git config core.ignorecase false` |

---

## F. Nhóm công cụ

| # | Anti-pattern | Vì sao hỏng | Sửa |
|---|---|---|---|
| F1 | **Cài 15 MCP server** | tool definition ăn context mỗi request + model kém tuân thủ instruction | 3–5/project, per-project không global |
| F2 | **Trộn 3 framework methodology** | instruction đánh nhau | chọn 1 |
| F3 | **Cài plugin không đọc nguồn** | plugin chạy code tuỳ ý với **đầy quyền user của bạn** | chỉ nguồn tin cậy; xem "Will install" trước |
| F4 | **Pin `main` cho harness dùng chung nhiều repo** | một commit sai làm hỏng đồng thời N repo | pin tag/sha + canary repo |
| F5 | **Globalize NGƯỠNG** (coverage, dedupe %) | repo legacy fail liên tục → mọi người tắt gate | globalize **cơ chế**, không globalize **ngưỡng** |
| F6 | **Để agent sửa được cấu hình harness của nó** | biến "đổi harness" thành edit tiện tay; mất lòng tin đội | `protect-harness` + cửa thoát có log |

---

## G. Nhóm quy trình

| # | Anti-pattern | Vì sao hỏng | Sửa |
|---|---|---|---|
| G1 | **Kitchen-sink session** | context đầy thứ không liên quan | `/clear` giữa task không liên quan |
| G2 | **Sửa đi sửa lại 4 lần** | context ô nhiễm bởi các hướng đi sai | sau 2 lần: `/clear` + prompt tốt hơn |
| G3 | **Infinite exploration** ("investigate X" không scope) | đọc 300 file | scope hẹp hoặc dùng subagent |
| G4 | **Một PR chạm 8 package** | không review được, không revert được cả cụm | PR theo slice |
| G5 | **Dedupe mù quáng** | ép chung 2 domain khác nhau → abstraction sai, tệ hơn duplication | hỏi: hai chỗ này đổi **cùng nhau** hay **độc lập**? |
| G6 | **Agent có quyền production** | rủi ro không hồi phục | staging only; người bấm nút prod |
| G7 | **Giữ harness cũ sau khi đổi model** | mỗi mảnh harness là một giả định về giới hạn model — giả định hết hạn | deprecation review + chạy **harness trần** |
| G8 | **Cải thiện harness không có eval gate** | tối ưu mù; harness phình mà tưởng đang tốt lên | 12–20 task eval, tách capability/regression |

---

## Và anti-pattern tổng — quan trọng nhất

| # | Anti-pattern | Vì sao hỏng |
|---|---|---|
| **Z** | **Đọc một tài liệu như tài liệu này rồi triển khai theo CHIỀU NGANG** | Bạn sẽ có 40% giá trị với 100% chi phí, và một harness không ai bảo trì được. Đòn bẩy trong harness **rất lệch**: 3 việc đầu tiên chiếm phần lớn kết quả. Làm theo thứ tự ở [ROADMAP-30D.md](ROADMAP-30D.md), mỗi lần một mảnh, và **mỗi mảnh phải có một tín hiệu thật đứng sau nó** |
