# Sift

Sift compares a client's new request with the agreed quote, drafts an invoice or change order, and prepares a PayPal sandbox payment link. The app uses the live backend; it has no mock API or seeded invoice data.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

Set the backend URL in `.env.local` before starting Vite:

```env
VITE_API_BASE_URL=https://sft-backend-5v79.onrender.com
```

The frontend calls `/api/analyze`, `/api/invoices`, `/api/invoices/:id`, and `/api/invoices/:id/payment-plan`. The backend must allow cross-origin requests from the deployed site when the API uses a different host. Invoice creation and payment plans use the PayPal sandbox.

## Build

```sh
npm run build
npm run preview
```

Vite writes the static site to `dist/`.

## Deploy to Vercel

Connect this repository as a Vite project and set:

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Environment variable:** `VITE_API_BASE_URL=https://sft-backend-5v79.onrender.com`

Vite embeds `VITE_` variables at build time, so redeploy after changing the backend URL.
