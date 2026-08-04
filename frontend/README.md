# ClaudMD Portals

Next.js (JavaScript) frontend for ClaudMD Patient and Employer portals. Hardcoded demo data — no backend.

## Run

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Demo logins (any password):

- `patient@demo.com` → Patient Portal
- `employer@demo.com` → Employer Portal

### Theme

Warm cream + brand blue + coral accent (`src/app/globals.css`). Headings: **Playfair Display** (`font-heading` / `font-display`). Body: **Outfit** (`font-body` / `font-sans`). Scales: `primary-*`, `accent-*`, `secondary-*`, `background-*`, `foreground-*` (legacy `bg-primary`, `bg-navy`, `bg-cream`, `text-ink` still work).

### Secure shared-document email (Epic 4)

Mock ClaudMD share email (not real email):

1. Open [http://localhost:3000/demo/secure-email](http://localhost:3000/demo/secure-email)
2. Click **View secure report** → login screen (report is not shown yet)
3. Sign in as `employer@demo.com` → scoped **Shared Documents** (Maria Garcia · Annual Physical only)

Also on that page: an **expired link** demo. Normal employer login (no share link) still opens the full portal.

## Structure

- `src/app/patient/*` and `src/app/employer/*` — App Router URLs (thin `page.jsx` files only)
- `src/features/patient/{route}/view.jsx` — patient screen UI (folder name matches URL segment)
- `src/features/employer/{route}/view.jsx` — employer screen UI
- `src/features/auth` — shared login / password flows
- `src/components/ui` — shared UI primitives (`Button`, `Card`, `SearchInput`, `DetailField`, …)
- `src/components/employer` — employer-only shared UI (`EmployerCategoryFilter`)
- `src/features/{patient|employer}/{route}/` — screen `view.jsx` plus route-specific components (e.g. `employee-detail-panel.jsx`)
- `src/data` — mock data

Example: `/employer/appointments` → `app/employer/appointments/page.jsx` imports `@/features/employer/appointments/view`.
