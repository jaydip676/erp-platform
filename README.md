# VIAZ Tyres ERP (Next.js)

TypeScript Next.js App Router application with PostgreSQL (Prisma). This replaces the FastAPI + static HTML pilot with a full-stack Next.js ERP covering the same domains:

| Area | Routes |
|------|--------|
| Auth | `/login`, `/api/auth/login`, `/api/me` |
| Dashboard | `/dashboard`, `/api/dashboard` |
| Raw materials | `/materials`, `/api/materials`, `/api/purchase` |
| Mixing / batches | `/mixing`, `/api/master-batch`, `/api/final-batch` |
| Production | `/process`, `/api/process/[stage]` |
| Vouchers & stock | `/vouchers`, `/api/vouchers`, `/api/stock`, `/api/rejections`, `/api/reports/daily` |
| Admin | `/api/opening-stock` |

## Local development

1. Start PostgreSQL (Docker example):

   ```bash
   docker run --name viaz-pg -e POSTGRES_USER=viaz -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=viaz_erp -p 5432:5432 -d postgres:16-alpine
   ```

2. Copy env and edit secrets:

   ```bash
   cp .env.example .env
   ```

3. Install, migrate, seed, run:

   ```bash
   npm install
   npm run db:push
   npm run db:seed
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) and sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

## Docker Compose (from repo root)

```bash
cp .env.example .env   # set DB_PASSWORD, JWT_SECRET, ADMIN_PASSWORD
docker compose -f docker-compose.next.yml up --build -d
```

App: [http://localhost:3000](http://localhost:3000)

## Data model

Prisma schema mirrors the original SQLAlchemy models: users, products, raw materials, departments, machines, recipes, batches, vouchers, stock ledger, rejections, and audit logs. Product master is seeded from `seed/products_from_daily_prod.json` (24 size/valve combinations).

The legacy Python API in the parent folder can remain for reference during migration; new work should target this `web/` app.