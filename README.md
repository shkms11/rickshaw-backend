# Rickshaw Backend

Express, TypeScript, Prisma, and PostgreSQL API.

## Run locally

Copy `.env.example` to `.env`, set `DATABASE_URL`, and replace `JWT_SECRET`
with a unique random value. Generate a secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep `.env` on the backend only; never expose `JWT_SECRET` to the frontend.

Apply database migrations and generate the Prisma client:

```powershell
npx prisma migrate dev
npx prisma generate
npm run dev
```

The API runs at `http://localhost:5000`.
Run `npx prisma migrate deploy` when deploying an existing database.

## Authentication and admin endpoints

- `POST /api/auth/register` accepts `{ "name", "email", "password", "role", "licenseNo" }`. Role may be `DRIVER` or `OWNER` and defaults to `DRIVER`. Driver registrations require a unique license number. The owner or driver profile is created with the account, and new accounts require approval.
- `POST /api/auth/login` returns a JWT only for approved accounts. Pending accounts receive `403` with code `ACCOUNT_PENDING_APPROVAL`; rejected accounts receive `403` with code `ACCOUNT_REJECTED`.
- Admin routes require `Authorization: Bearer <token>` and the `ADMIN` or `SUPER_ADMIN` role.
- `GET /api/admin/dashboard-summary` returns live counts for rickshaws, online drivers, active trips, and open complaints.
- Drivers can share GPS from the dashboard; the owner sees locations for their assigned fleet and admins can see all recently reporting drivers. Location sharing requires browser permission and an open dashboard; coordinates older than two minutes are not shown as live.
- `GET /api/admin/approvals` returns pending driver and owner accounts.
- `PATCH /api/admin/approvals/:userId` accepts `{ "status": "APPROVED" }` or `{ "status": "REJECTED" }`.

Admin accounts cannot be selected during public registration. Grant admin access
only through a trusted administrative process.

## Demo data

`npm run seed` creates `admin@rickshaw.com` with password `Password123!`.
**The seed script deletes existing application data before reseeding; use it
only with a disposable development database.** Change the demo password and
JWT secret before deployment.
