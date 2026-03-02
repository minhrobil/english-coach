# English Coach Desktop (Electron)

Ứng dụng desktop Electron cho luồng học tiếng Anh, ưu tiên Windows trước và sẵn sàng mở rộng macOS.

## Run local

1. Cài dependency:

```bash
cd english-coach/desktop-electron
npm install
```

2. Chạy dev mode (Vite + Electron):

```bash
npm run dev
```

3. Build kiểm tra:

```bash
npm run build
```

## Build artifact bằng Docker Compose

Từ thư mục [`english-coach`](english-coach/README.md):

```bash
docker-compose up --build
```

Artifact output:

- `artifacts/desktop-electron/desktop-electron-dist.tar.gz`

Lưu ý: compose chỉ build artifact, không chạy GUI Electron trong container.

## Lưu ý runtime

- Main process chạy theo ESM (`"type": "module"`) trong `package.json`.
- Preload bridge dùng CommonJS (`electron/preload.cjs`) để tương thích preload runtime của Electron trong môi trường hiện tại.
- Script build/dev có bước copy `preload.cjs` vào `dist-electron/electron/preload.cjs`.

## UX hiện tại (Modern SaaS compact)

- Giao diện compact, neutral palette, spacing nhỏ gọn.
- Tabs: Học tập / Lịch sử / Config.
- Loading UX 2 tầng:
  - Inline message theo action.
  - Global overlay spinner khi gọi backend.
- Trạng thái component có đủ: hover, active, focus-visible, disabled, selected.

## Popup behavior

- Khi có câu hỏi định kỳ: hiển thị notification native.
- User click notification: app mở foreground và điều hướng về màn hình học tập.
- Notification không hỗ trợ nhập text inline; trả lời thực hiện trong cửa sổ app.

