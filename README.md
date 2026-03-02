# English Coach Monorepo

## Cấu trúc

- `backend`: Spring Boot 3 (Java 21)
- `desktop-electron`: Electron desktop app
- `docker-compose.yml`: chạy PostgreSQL + backend

## Chạy nhanh backend bằng Compose

```bash
cd english-coach
docker-compose up -d
```

## Chạy Electron trên host (giống manual)

```bash
cd english-coach/desktop-electron
npm install
npm run dev
```

Backend mặc định từ compose ở `http://localhost:8088`.

Compose chỉ quản lý DB + backend. Electron app chạy trực tiếp trên host để có GUI đầy đủ.
