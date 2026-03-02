# Roo Code Rules - Machine Readable

version: 1
scope: repository-wide
language: vi
priority: strict
source: plans/roo-code-rules.md

## 0. Enforcement

- MUST tuân thủ toàn bộ rule trong file này.
- MUST từ chối merge-ready nếu vi phạm bất kỳ rule `MUST`.
- MUST ưu tiên an toàn thay đổi hơn tốc độ.

## 1. Change Scope

- MUST chỉ sửa đúng phạm vi yêu cầu.
- MUST NOT refactor lan rộng khi task là bugfix nhỏ.
- MUST ghi rõ lý do nếu chạm ngoài phạm vi.

## 2. Build/Test Gates

- MUST build pass ở module bị ảnh hưởng trước khi kết luận hoàn tất.
- MUST chạy test hiện có ở module bị ảnh hưởng nếu có.
- MUST NOT chấp nhận trạng thái hoàn tất khi compile/lint/test lỗi.

## 3. Commit Rules

- MUST dùng Conventional Commits: `<type>(<scope>): <subject>`.
- MUST dùng type hợp lệ: feat|fix|refactor|perf|test|docs|build|ci|chore|revert.
- MUST viết subject ngắn gọn, thì hiện tại, không dấu chấm cuối câu.

## 4. PR Rules

- MUST có mô tả: bối cảnh, phạm vi, ảnh hưởng, cách kiểm thử.
- MUST có checklist: build pass, test pass, không secret, tự review diff.
- MUST nêu rõ tác động API/DB/backward compatibility nếu có.

## 5. Security Rules

- MUST NOT commit secret/token/password/private key.
- MUST mask dữ liệu nhạy cảm trong log.
- MUST validate input tại boundary API/IPC.

## 6. Java Spring Rules

- MUST đặt tên: class PascalCase, method/field camelCase, constant UPPER_SNAKE_CASE.
- MUST package lowercase theo domain.
- MUST NOT dùng wildcard import.
- MUST tách layer controller/service/repository rõ ràng.
- SHOULD giữ business logic chính ở service, không nhồi vào controller.

## 7. TypeScript React Electron Rules

- MUST đặt tên type/interface/component PascalCase.
- MUST đặt tên biến/hàm camelCase.
- MUST NOT dùng any nếu chưa có lý do kỹ thuật rõ ràng.
- MUST đặt tên IPC channel theo `scope:action`.
- SHOULD tách async/business logic khỏi JSX render dài.

## 8. SQL Migration Rules

- MUST migration forward-only.
- MUST NOT sửa file migration đã phát hành.
- MUST tăng version migration đúng thứ tự.
- MUST bổ sung index cho truy vấn chính.
- MUST khai báo default/nullability rõ ràng cho cột mới.

## 9. Documentation Rules

- MUST cập nhật docs khi thay đổi behavior quan trọng.
- MUST mô tả request/response/lỗi khi thêm hoặc đổi API.
- SHOULD bổ sung checklist vận hành với flow nhiều bước.

## 10. Done Criteria

- MUST chỉ đánh dấu hoàn tất khi:
  - build/test đạt yêu cầu
  - thay đổi đúng phạm vi
  - rule bảo mật không vi phạm
  - tài liệu liên quan đã cập nhật khi cần

## 11. Conflict Resolution

- Nếu xung đột giữa rule tổng quát và rule stack, MUST ưu tiên rule stack.
- Nếu xung đột giữa tốc độ và an toàn, MUST ưu tiên an toàn.

