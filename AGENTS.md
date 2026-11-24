<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** The Google Sheets Lovable Connector has been **fully removed**.
  All data access goes through the Apps Script Web App (`APPS_SCRIPT_URL` + `API_TOKEN`).
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Application architecture

- **Single source of truth:** Google Apps Script Web App (`src/lib/new-order-api.ts`).
  Never call `connector-gateway.lovable.dev` or the Google Sheets API directly from the client or server.
- Use TanStack Start server functions only. Return allowlisted customer-safe DTOs so internal columns (price, warehouse, driver) never enter browser data.
- Authenticate phone ownership through Cloud SMS OTP (Supabase) before reading customer mappings; phone input or name search alone must never authorize account access.
- Keep public catalog cache (5 min SWR) separate from private no-store account requests; the shared new-customer number `500500` must never group customer histories.
- Store only non-sensitive cart SKU/quantity drafts in localStorage; never cache private account records in the service worker.
- Use the single guarded PWA registration module and generated Workbox worker; previews and OAuth endpoints must not be intercepted.
- Required env vars (server-only except the public OneSignal id):
  - `APPS_SCRIPT_URL` (or `NEW_ORDER_WEBAPP_URL`)
  - `API_TOKEN`
  - `GOOGLE_SHEET_ID` (reference only)
  - `SESSION_SECRET` / Supabase keys (existing)
  - `NEXT_PUBLIC_ONESIGNAL_APP_ID` / `ONESIGNAL_REST_API_KEY` (when push is enabled)
