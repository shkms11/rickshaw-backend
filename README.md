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

For the Vercel backend project, set the Root Directory to `rickshaw-backend`
so Vercel detects the Express app in this folder. Leave the build and output
directory settings at their defaults so requests are routed through Express.
Configure `DATABASE_URL` with Neon's pooled connection string and `DIRECT_URL`
with its direct (unpooled) connection string. The direct URL is used for
database migrations; the pooled URL is used by the running API and seed process.

The frontend uses `/api` and its Vercel rewrite forwards requests to the stable
backend project domain. If that domain changes, update
`rickshaw-frontend/vercel.json` and redeploy the frontend.
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

To enable conversational Groq answers, configure `GROQ_API_KEY` in the backend
environment. `GROQ_MODEL` is optional and defaults to
`openai/gpt-oss-120b`. Restart/redeploy the backend after changing environment
settings. Keep the key on the backend; the frontend never receives it. Only the
user's authorized, relevant data context is sent to Groq.

## Authentication and admin endpoints

- `POST /api/auth/register` accepts a name, phone, password, optional email, and a `DRIVER` or `OWNER` role. Driver license numbers are optional at registration and can be added later. New accounts require approval.
- `POST /api/auth/login` returns a JWT only for approved accounts. Pending accounts receive `403` with code `ACCOUNT_PENDING_APPROVAL`; rejected accounts receive `403` with code `ACCOUNT_REJECTED`.
- `GET /api/profile` and `PATCH /api/profile` let any signed-in role update their own Bangladesh identity/address details and profile picture URL. NID is encrypted at rest with `NID_ENCRYPTION_KEY`, returned only to its owner, and excluded from admin searches. Set a private 64-hex-character key before enabling NID storage.

Generate `NID_ENCRYPTION_KEY` with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
and keep the same key across deployments; losing it makes saved NIDs unreadable.
- Admin routes require `Authorization: Bearer <token>` and the `ADMIN` or `SUPER_ADMIN` role.
- `GET /api/admin/dashboard-summary` returns live counts for rickshaws, online drivers, active trips, and open complaints.
- Drivers can share GPS from the dashboard; owners and scoped admins see locations for their own fleet, while super admins can see all reporting drivers. Location sharing requires browser permission and an open dashboard; coordinates older than two minutes are not shown as live.
- `GET /api/admin/approvals` returns pending driver and owner accounts to super admins.
- `PATCH /api/admin/approvals/:userId` accepts `{ "status": "APPROVED" }` or `{ "status": "REJECTED" }`.

`SUPER_ADMIN` has platform-wide access. Each `ADMIN` must have a server-side
assignment to one owner; admin requests are filtered to that owner's fleet. Only
a super admin can issue an admin account using `POST /api/admin/administrators`.
Fleet/list endpoints cap each response at 100 records; admin search responses
are capped at 50. Rickshaw numbers are assigned from the owner's registered
phone and an atomic per-owner sequence.

Provision or reset the platform super admin after applying migrations. In
non-production environments, the bootstrap command defaults to password
`1234`; it will not promote an existing non-super-admin account:

```powershell
npm run bootstrap:super-admin
```

It creates or resets `superadmin@rickshaw.com` without clearing any other
database records. In production, set `SUPER_ADMIN_PASSWORD` to a password with
at least 12 characters before running the command. Driver/owner registration
accepts passwords of at least four characters in every environment. Scoped
admin creation still requires 12 characters in production. Never put passwords
in frontend settings.

## Demo data

Apply migrations, then run `npm run seed` (or `npm run db:seed`) to create the
demo dataset on an empty non-production database. The seed resets existing
application records before rebuilding that dataset, so it refuses to run on a
non-empty database unless explicitly confirmed. All seeded demo accounts use
password `1234` by default:

```powershell
npm run db:migrate
npm run seed
```

For a database that you intend to reset, also use:

```powershell
$env:ALLOW_DESTRUCTIVE_SEED = "true"
npm run seed
Remove-Item Env:ALLOW_DESTRUCTIVE_SEED
```

Only seed a disposable database. The seed is disabled when `NODE_ENV` is
`production`; never use its shared demo password on a deployed or production
database. It creates `superadmin@rickshaw.com`, an admin assigned to both demo
owners, two owners, and three drivers. All demo accounts share the selected
demo password. Driver activity, rental-income totals, and fictional map
locations are included for presentations. Admins created through the dashboard
still require a 12-character password.
