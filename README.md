# RCLPG Portal — PERN Stack Application

Production-ready LPG Inventory Management Portal built with **PostgreSQL (Supabase)**, **Express**, **React**, and **Node.js**.

## Project Structure

```
LPG/
├── backend/                 # Express REST API
│   └── src/
│       ├── config/          # DB + environment
│       ├── controllers/     # HTTP handlers
│       ├── middleware/      # Auth, validation, errors
│       ├── routes/          # API route definitions
│       ├── services/        # Business logic + DB access
│       └── utils/
├── frontend/                # React + Vite + Tailwind
│   └── src/
│       ├── api/             # API client
│       ├── components/      # Reusable UI
│       ├── context/         # Auth + toast state
│       └── pages/           # Route pages
├── database/
│   └── migrations/          # Minimal schema additions
└── rclpg system.html        # Original static prototype
```

## Schema Review & Minimal Additions

The existing Supabase schema supports customers, products, sales, and admins. These fields are **required** for portal features and are added in `database/migrations/001_minimal_schema_additions.sql`:

| Change | Why |
|--------|-----|
| `admins.username`, `admins.password_hash` | Login and session auth (admins table had no credentials) |
| `sales_records.price_type`, `unit_price`, `total_amount` | Revenue KPIs, billing, exports, and sale overrides |
| `lpg_products.is_archived` | Soft-archive catalog items without deleting rows |

**Computed in application (no schema change):**
- `health_indicator` is recalculated when stock changes (threshold: ≤3 = Low Stock, 0 = Out of Stock)
- Product IDs auto-generated as 6-digit strings (e.g. `000001`)

## Quick Start

### 1. Run migration in Supabase

Execute `database/migrations/001_minimal_schema_additions.sql` in the Supabase SQL Editor.

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env with DATABASE_URL and JWT_SECRET
npm install
npm run seed    # Creates default admin
npm run dev
```

Default admin (change after first login):
- Username: `admin`
- Password: `Admin@12345`

### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173

Place your logo at `frontend/public/rclpg-logo.jpg`.

## Architecture

### Backend (clean separation)

- **Routes** → **Controllers** (validation) → **Services** (business logic) → **PostgreSQL via `pg`**
- Parameterized queries prevent SQL injection
- JWT auth with expiry at **next calendar midnight**
- Rate limiting on auth endpoints
- Helmet + CORS + input validation via `express-validator`

### Frontend

- React Router with protected routes
- Auth context stores JWT + midnight expiry; timer logs out at 12:00 AM
- Tailwind CSS, mobile-first responsive layout
- Semantic HTML, ARIA labels, keyboard-navigable modals

## API Endpoints

## Demo (no-backend) mode

To run the frontend as a self-contained demo with mock data (no backend, no database, no Supabase env vars):

1. In `frontend`, set `VITE_USE_MOCK=true` in an `.env` file or pass it to your dev server.
2. Start the frontend only:

```bash
cd frontend
npm install
VITE_USE_MOCK=true npm run dev
```

The UI will use in-browser mock data persisted to `localStorage` and simulate network delays.


| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Admin login |
| GET | `/api/auth/me` | Current session |
| GET | `/api/dashboard/metrics` | KPI cards + low stock |
| GET | `/api/dashboard/export` | Excel/PDF report download |
| GET/POST | `/api/products` | List / create products |
| PUT | `/api/products/:id` | Update product |
| PATCH | `/api/products/:id/archive` | Soft archive |
| GET | `/api/products/summary/weekly` | Weight-class summary |
| GET | `/api/customers` | List customers |
| GET/POST | `/api/sales` | List / create sales |
| PUT | `/api/sales/:id` | Override transaction |
| PATCH | `/api/sales/:id/drop` | Archive sale + restore stock |

## Page ↔ Database Mapping

| Page | Tables / Operations |
|------|---------------------|
| **Login** | `admins`, `password_reset_tokens` |
| **Dashboard KPIs** | Aggregate `sales_records`, sum `lpg_products` stock |
| **Low Stock** | `lpg_products.health_indicator` |
| **Recent Sales** | `sales_records` + joins (today, paginated) |
| **Record Sale** | Insert `customers` (if new), `sales_records`, decrement `lpg_products.stock_quantity` |
| **Inventory** | CRUD `lpg_products`, archive via `is_archived` |
| **Sales Log** | Read/update/drop `sales_records`, update `customers` on override |

## Authentication & Midnight Logout

1. Login validates bcrypt hash in `admins.password_hash`
2. JWT `exp` claim set to next midnight (local server time)
3. Frontend stores `expiresAt` and schedules `setTimeout` until midnight
4. Protected routes redirect to `/login?expired=1` when token expires
5. API returns 401 on expired/invalid tokens
6. Password resets must be handled through system administrator

**Note:** Registration and forgot-password endpoints have been removed. New admin accounts are created only by existing administrators through the admin profile management interface.

## Excel & PDF Reports

Header buttons open a period picker (Current Day, Daily, Monthly, Yearly, Custom Range).  
`GET /api/dashboard/export?format=excel|pdf&period=...` queries joined sales data and streams:
- **Excel** via ExcelJS
- **PDF** via PDFKit

## Security & Best Practices

- Environment variables for secrets (never commit `.env`)
- Parameterized SQL only
- bcrypt password hashing (cost 12)
- JWT with short-lived daily sessions
- express-rate-limit on auth routes
- Input validation on all write endpoints
- Soft deletes (archive) preserve audit history
- Service layer keeps controllers thin for maintainability

## Scalability Notes

- Add connection pooling (already via `pg.Pool`)
- Index sales by `date_created` (included in migration)
- Move report generation to background jobs at high volume
- Consider Supabase Auth later if multi-tenant or SSO is needed
