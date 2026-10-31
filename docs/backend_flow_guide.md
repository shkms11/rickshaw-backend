# Backend flow guide

This guide maps an HTTP request to the code and data it touches. The handwritten
API is under `src/`; `src/generated/prisma/` is generated database-client code
and should not be edited directly.

## Request path

```text
HTTP request
  -> src/server.ts (load environment, start listener)
  -> src/app.ts (CORS, JSON/form parsing, URL-prefix router)
  -> feature router (endpoint and access guards)
  -> middleware (verified identity and role, when required)
  -> controller (validate input, apply feature rules, shape response)
  -> Prisma Client -> PostgreSQL
  -> JSON response or payment-provider redirect
```

There is no separate repository layer: controllers call Prisma directly.
`subscription.service.ts` and `ai.service.ts` hold shared feature logic and
queries used by their controllers.

`app.ts` mounts `/api/auth`, `/api/drivers`, `/api/rickshaws`, `/api/admin`,
`/api/complaints`, `/api/fleet-actions`, `/api/subscriptions`, and `/api/ai`.
The health check at `/` only confirms that the HTTP process is responding.
Routes define the method/path and attach middleware before the handler; the
controller reads request data, writes database changes, and returns a response.

## Authentication and authorization

- `POST /api/auth/register` is public. `auth.controller.ts` validates the body,
  normalizes a Bangladesh phone number with `shared/phone.ts`, hashes the
  password, and creates a `User` plus its `Driver` or `Owner` profile. New
  accounts start as `PENDING`.
- `POST /api/auth/login` looks up the user by email or normalized phone, checks
  the password hash and approval state, then signs a one-day JWT containing the
  user ID and role. Pending and rejected accounts do not receive a token.
- `middleware/auth.middleware.ts` verifies a `Bearer` token and attaches its
  user ID/role as `req.auth`. `requireRole(...)` then gates routes; it does not
  query the database. Controllers use that identity to scope owner/driver data.
- Admin routes apply `authenticate` and `requireRole("ADMIN", "SUPER_ADMIN")`
  to the whole router. Other routers set guards per endpoint; for example,
  owners can manage their own fleet, while driver GPS self-service requires
  `DRIVER`.
- AI chat is public with optional authentication. A missing token means guest
  chat; an invalid supplied token is rejected. SSLCommerz callback endpoints
  are public because the payment gateway calls them, but successful payments
  are confirmed with a server-to-server validation request before access is
  extended.

## Feature boundaries and data flow

| Feature | Entry points and components | Main data flow |
| --- | --- | --- |
| Accounts | `/api/auth` → `auth.routes.ts` → `auth.controller.ts` | Registration/login ↔ `User`, `Driver`, and `Owner`. |
| Drivers and GPS | `/api/drivers` → `driver.routes.ts` → `driver.controller.ts` and `location.controller.ts` | Driver profile joins the user, assigned rickshaw, and location. GPS writes upsert one `DriverLocation` per driver; stopping sharing preserves the point as `LAST_KNOWN` and sets the driver offline. |
| Rickshaws | `/api/rickshaws` → `rickshaw.routes.ts` → `rickshaw.controller.ts` | Owner-created vehicles reference an `Owner`; assignment checks vehicle ownership, driver approval, and active trips before linking a `Driver`. |
| Fleet actions | `/api/fleet-actions` → `fleetActions.routes.ts` → `fleetActions.controller.ts` | Owners/drivers create lost-vehicle reports; owners request removal; admins review. Approved removal and action status are committed together. |
| Administration | `/api/admin` → `admin.routes.ts` → `admin.controller.ts` | Approval queue, dashboard counts, and cross-feature search read users, fleet, locations, trips, payments, and complaints. |
| Complaints | `/api/complaints` → `complaint.routes.ts` → `complaint.controller.ts` | Any authenticated user can create a complaint linked to their account; admins list and update its status. |
| Owner billing | `/api/subscriptions` → `subscription.routes.ts` → `subscription.controller.ts` + `subscription.service.ts` | The service loads/creates trial state and counts non-inactive rickshaws; checkout records an owner-plan payment and asks SSLCommerz for a hosted URL. Validated callbacks update payment and `paidUntil` atomically. |
| Assistant | `/api/ai/chat` → `ai.routes.ts` → `ai.middleware.ts` → `ai.controller.ts` + `ai.service.ts` | The service creates role-scoped summaries/location or recorded-trip-area context. Data-oriented intents use local replies; general chat may use Groq, with local replies as the fallback. |

The assistant's traffic/area answers summarize stored trip pickup/drop-off
strings; they are not live traffic measurements or geofencing. Without a
`GROQ_API_KEY`, guest help and local data summaries still work.

Subscription checkout is optional. The seven-day trial and BDT 100 monthly
price-per-non-inactive-rickshaw calculation are handled locally; gateway
credentials and connectivity are only needed to complete hosted payment.
`Payment` stores trip fares, while `OwnerSubscriptionPayment` stores owner-plan
checkouts.

The `owners/` and `trips/` source files are currently empty, and no
`/api/trips` router is mounted. Trip records are nevertheless part of the
schema and are read by dashboard/search/assistant logic and used to prevent
unsafe fleet changes. There is no trip creation/controller flow in this
backend at present.

## Prisma schema relationships

`prisma/schema.prisma` is the current relational model; PostgreSQL changes are
tracked by `prisma/migrations/`.

- `User` stores identity, role, approval state, and password hash. A user can
  have optional one-to-one `Driver` and `Owner` profiles; public registration
  creates the profile matching the chosen role. The user also relates to
  passenger trips, driver trips, complaints, and payments.
- `Owner` has many `Rickshaw` records, one optional `OwnerSubscription`, and
  many `OwnerSubscriptionPayment` records. A `Driver` has one user, one
  optional assigned rickshaw, and one optional latest `DriverLocation`.
- `Rickshaw` belongs to an owner and may have one assigned driver. It has many
  trips and fleet actions. The unique `Rickshaw.driverId` makes the assignment
  one-to-one.
- `Trip` belongs to a passenger `User`, may reference a driver `User` and a
  `Rickshaw`, and may have one trip `Payment` and many `Complaint` records.
  (Its `driverId` points to `User.id`; the rickshaw assignment points to
  `Driver.id`.)
- `FleetAction` belongs to a `Rickshaw`, has a creator `User`, and may have a
  reviewer `User`. Named relations distinguish the creator from reviewer.
- Enums define role, approval, driver/vehicle/trip state, complaint state,
  location source, fleet-action type/state, and payment method/state.

The migrations build this schema incrementally: the initial database setup is
followed by search indexes, admin/approval fields, driver location and phone
support, fleet actions, and owner subscriptions/payments. Apply them with
`npm run db:migrate`; edit the schema and create a migration rather than
editing generated Prisma client files.
