// src/lib/api/qs.ts
export type PageInput = { number?: number; size?: number };

/** Builder param dalam format JSON:API:
 *  - page[number], page[size]
 *  - include[]  (bisa banyak)
 *  - filter[]   (string "field|op|value")
 */
export function buildParams(opts?: {
  page?: PageInput;
  include?: string[];
  filter?: string[];
  extra?: Record<string, unknown>;
}) {
  const out: Record<string, unknown> = {};
  if (!opts) return out;

  if (opts.page) {
    if (opts.page.number != null) out['page[number]'] = String(opts.page.number);
    if (opts.page.size != null)   out['page[size]']   = String(opts.page.size);
  }
  if (opts.include && Array.isArray(opts.include)) out['include[]'] = opts.include;
  if (opts.filter && Array.isArray(opts.filter))   out['filter[]']  = opts.filter;
  if (opts.extra) {
    for (const [k,v] of Object.entries(opts.extra)) {
      if (v === undefined || v === null || v === '') continue;
      out[k] = v;
    }
  }
  return out;
}
