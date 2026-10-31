# Rickshaw Backend

Express, TypeScript, Prisma, and PostgreSQL API.

## Run locally

Copy `.env.example` to `.env`, set `DATABASE_URL`, and replace `JWT_SECRET`
with a unique random value. `DATABASE_URL` can be a local PostgreSQL connection
or Neon's pooled connection string. For Neon, optionally set `DIRECT_URL` to
Neon's direct (unpooled) connection string; Prisma uses it for migrations.
When `DATABASE_URL` is a standard Neon pooler URL and `DIRECT_URL` is omitted,
Prisma automatically derives the direct hostname for migrations. Keep both
URLs private.
Generate a secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep `.env` on the backend only; never expose `JWT_SECRET` to the frontend.

Apply database migrations, generate the Prisma client, and start the API:

```powershell
npm run db:migrate
npm run build
npm run dev
```

The API runs at `http://localhost:5000`.
`npm run db:status` checks the migration state without applying changes.
`npm run db:migrate` applies pending migrations and is suitable for Neon and
other deployment databases. Use `npx prisma migrate dev` only with a local
development database when creating new migrations.

## CORS and deployment

The backend allows the local Vite and React dev-server origins by default, plus
the production frontend origin. Set `CORS_ORIGINS` to a comma-separated list of
exact frontend origins to override these defaults (for example, in Vercel's
backend project environment variables). Do not include URL paths or a trailing
slash. Redeploy the backend after changing the variable.

For the Vercel backend project, configure `DATABASE_URL` with Neon's pooled
connection string and `DIRECT_URL` with its direct (unpooled) connection string.
The direct URL is used for database migrations; the pooled URL is used by the
running API and seed process.

Set the frontend's `VITE_API_URL` to the backend URL ending in `/api` in Vercel.
Vite embeds this value at build time, so redeploy the frontend after changing it.
If Vercel Deployment Protection is enabled for the backend deployment, allow
public access to the API deployment; an SSO redirect cannot be used by browser
API requests and may appear as a CORS error.

Set backend `FRONTEND_URL` to the public frontend origin and `PUBLIC_API_URL` to
the public backend origin so SSLCommerz can reach the payment callbacks.

## Owner plans and payments

Owners receive a 7-day trial starting when their dashboard first loads. The
monthly plan costs BDT 100 for each non-inactive rickshaw and is renewed
manually through hosted checkout. The trial panel warns owners before it ends.
Trial expiry does not disable dashboard features; owners can continue using the
demo while being prompted to subscribe. Seeded demo owners automatically
receive a fresh 7-day trial the next time they open the dashboard after expiry.

Checkout uses the SSLCommerz sandbox by default (`testbox` sandbox store); it
does not charge real money. Payment checkout is optional: fleet management,
GPS tracking, trial status, and plan pricing remain available if gateway
credentials or gateway connectivity are missing. If the subscription API is
temporarily unavailable, the dashboard still shows plan pricing based on the
loaded fleet count and keeps all fleet features visible; trial dates and
checkout status require the backend subscription API and database.

For live payments, configure
`SSLCOMMERZ_IS_LIVE=true`, `SSLCOMMERZ_STORE_ID`, and
`SSLCOMMERZ_STORE_PASSWORD` with merchant credentials. Never expose live
credentials in frontend variables. SSLCommerz must be able to reach
`PUBLIC_API_URL` for payment callbacks; local development requires a publicly
reachable backend URL or tunnel. The owner plan panel has an optional payment
setup section with these settings. After adding `OwnerSubscription` tables,
apply the migration with `npm run db:migrate`.

## AI assistant

The floating assistant is available without login for general questions. Signed-in
admins, owners, and drivers can ask role-scoped questions; fleet summaries,
assigned-driver locations, and recorded trip-area usage are read from existing
database models on the backend. No AI-specific database tables or migration are
needed. Without a provider key, built-in answers and data summaries still work.

To enable conversational Groq answers, configure `GROQ_API_KEY` and optionally
`GROQ_MODEL` in the backend environment, then restart/redeploy the backend.
Keep the key on the backend; the frontend never receives it. Only the user's
authorized, relevant data context is sent to Groq.

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

Run `npm run seed` (or `npm run db:seed`) to create the demo dataset on an empty
database. The seed resets existing application records before rebuilding that
dataset, so it refuses to run on a non-empty database unless explicitly
confirmed. For a database that you intend to reset, use:

```powershell
$env:ALLOW_DESTRUCTIVE_SEED = "true"
npm run seed
Remove-Item Env:ALLOW_DESTRUCTIVE_SEED
```

Only seed a disposable database. Do not use the demo seed against production
data. It creates `admin@rickshaw.com` and other demo accounts with password
`Password123!`; change these credentials and the JWT secret before deployment.
