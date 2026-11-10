# Sift

Sift compares a client’s new request with the agreed quote, drafts an invoice or change order, and prepares a PayPal payment link. The app uses mock data by default.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env.local` to change the API settings. With `VITE_USE_MOCK=true`, no backend is needed.

## Build

```sh
npm run build
npm run preview
```

Vite writes the static site to `dist/`.

## Mock mode and real backend

The mock API is enabled by default. Mock invoices are stored in browser local storage and seeded with four examples.

To connect a backend, set these Vite environment variables before building:

```env
VITE_USE_MOCK=false
VITE_API_BASE_URL=https://your-api.example.com
```

The client requests `/api/analyze`, `/api/invoices`, and `/api/invoices/:id` from the configured base URL. The backend must allow cross-origin requests from the deployed site when the API uses a different host. See `.env.example` for the mock defaults. Since Vite embeds `VITE_` variables at build time, update the values and redeploy after changing them.

## Deploy to Render

Create a **Static Site** connected to this repository and set:

- **Build Command:** `npm install && npm run build`
- **Publish Directory:** `dist`
- **Environment:** `VITE_USE_MOCK=true` for the demo, or `VITE_USE_MOCK=false` and `VITE_API_BASE_URL` for a backend build.

For client-side refreshes, add a Render rewrite rule with source `/*`, destination `/index.html`, and action **Rewrite**. `public/_redirects` is also included for static hosts that support that convention.
# Sift
