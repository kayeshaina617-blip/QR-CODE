# QR Advance Ordering System

This is a React + Vite customer advance-ordering website connected to Supabase.

## Included
- Customers can view available products.
- Customers can select quantities and submit an advance order.
- Customers choose a pickup date and time.
- Confirmation shows an order number.
- No online payment is included.
- Admin signs in with the authorized Supabase Auth account.
- Admin can add, edit, and delete products, view orders, and update order status.

## Important database assumptions
The app expects these columns:
- `products`: `id`, `name`, `description`, `price`, `image_url`, `available`, `created_at`
- `orders`: `id`, `order_no`, `customer_name`, `customer_contact`, `pickup_date`, `pickup_time`, `notes`, `status`, `created_at`
- `order_items`: `id`, `order_id`, `product_id`, `quantity`, `unit_price`

The `id` columns and `order_id` / `product_id` should have compatible types and valid foreign-key relationships where applicable. This app assumes UUID IDs.

## Connect Supabase
1. Copy `.env.example` to `.env` (or create `.env`).
2. Set `VITE_SUPABASE_URL` to the project URL.
3. Set `VITE_SUPABASE_PUBLISHABLE_KEY` to the `sb_publishable_...` key.
4. Never use an `sb_secret_...` or service-role key in frontend code.

## Local development
Run:
- `npm install`
- `npm run dev`

Build:
- `npm run build`

## Deployment
Deploy the project through a supported static-site host. Set the same two environment variables in the host's project settings before building. Build command: `npm run build`. Publish directory: `dist`.

## Security checks before public use
- Verify the RLS policies on all three tables.
- The existing customer INSERT policies reported in setup currently use broad `WITH CHECK (true)` rules. These do not validate product prices, quantities, or order contents. Tighten and test these policies before public use.
- Ensure only the intended admin user can use admin operations. `authenticated` alone is not sufficient; policies must also check `auth.uid()` against the authorized admin UUID.
- Test customer ordering and admin actions with separate browser sessions.
- Do not expose secret keys in GitHub, frontend files, or environment variables prefixed with `VITE_`.
