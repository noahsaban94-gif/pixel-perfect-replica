/**
 * @deprecated
 * This module previously used the Lovable Google Sheets Connector
 * (connector-gateway.lovable.dev + LOVABLE_API_KEY).
 *
 * It has been fully replaced by `src/lib/new-order-api.ts` which talks
 * exclusively to the Apps Script Web App (APPS_SCRIPT_URL + API_TOKEN).
 *
 * Any remaining import of this file will throw at runtime.
 * Delete this file once you confirm no residual references remain.
 */

function removed(): never {
  throw new Error(
    'sheets.server.ts was removed. Use @/lib/new-order-api instead (Apps Script Web App).',
  );
}

export const SHEET_ID = '1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw';
export const sheetsRequest = removed;
export const readRanges = removed;
export const readCatalog = removed;
export const readCustomer = removed;
export const readCustomerRecords = removed;
