# Rickshaw Backend

## Environment

Copy `.env.example` to `.env`, set `DATABASE_URL`, and replace `JWT_SECRET` with a unique random value. Generate one with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep `.env` on the backend only; never expose `JWT_SECRET` to the frontend.

Apply database migrations and generate the Prisma client:

```powershell
npx prisma migrate dev
npx prisma generate
```

Start the API with `npm run dev`. The default URL is `http://localhost:5000`.

## Auth And Approvals

- `POST /api/auth/register` accepts `{ "name", "email", "password", "role" }`; role may be `DRIVER` or `OWNER` and defaults to `DRIVER`. New registrations have `approvalStatus: "PENDING"`.
- `POST /api/auth/login` returns a JWT and user when credentials are valid and the account is approved. Pending accounts receive `403` with code `ACCOUNT_PENDING_APPROVAL`; rejected accounts receive `403` with code `ACCOUNT_REJECTED`.
- Admin routes require `Authorization: Bearer <token>` and an `ADMIN` or `SUPER_ADMIN` role.
- `GET /api/admin/approvals` returns `{ "approvals": [...], "total": number }` for pending driver/owner registrations.
- `PATCH /api/admin/approvals/:userId` accepts `{ "status": "APPROVED" }` or `{ "status": "REJECTED" }` and returns the updated public user details.

Do not allow admin roles to be selected during public registration. Grant admin access through a trusted administrative process.
