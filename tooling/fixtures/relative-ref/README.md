# FIXTURE cho `tooling/test-hooks.mjs` — đường dẫn TƯƠNG ĐỐI với file nhắc nó

File này tồn tại để §9b của `entropy-scan` có một ca thật chạy qua nhánh "giải đường dẫn
tương đối với thư mục của file đang nhắc".

Dòng dưới là ca đó. `docs/ghi-chu.md` **không** tồn tại ở gốc repo, nhưng **có** tồn tại
cạnh file này — nên §9b phải IM. Nếu nó kêu, nhánh giải-tương-đối đã hỏng:

- xem `docs/ghi-chu.md`

Repo template có cấu trúc phẳng nên ca này không xuất hiện tự nhiên ở đây. Nó xuất hiện ở
repo tiêu thụ có thư mục con (đo ở `sakubun` 2026-08-07: một README trong thư mục con nhắc
một file cạnh nó, và §9b báo nhầm là đường dẫn chết). Đây là lần thứ ba trong một ngày một
khuyết tật chỉ lộ ra SAU KHI phân phối — nên nó đáng một fixture, không đáng một lời hứa.
