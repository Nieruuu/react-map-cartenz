/**
 * Serialize object into query string using bracket notation for arrays:
 * { include: ['attribute'], filters: ['a|eq|1','b|like|%25x%25'], page: { number:1, size:10 } }
 * -> ?include[]=attribute&filters[]=a%7Ceq%7C1&filters[]=b%7Clike%7C%2525x%2525&page[number]=1&page[size]=10
 */
export function toQuery(params: Record<string, any>): string {
  const parts: string[] = [];
  const enc = encodeURIComponent;

  function push(key: string, value: any) {
    if (value === undefined || value === null) return;
    parts.push(`${key}=${enc(String(value))}`);
  }

  function build(prefix: string, value: any) {
    if (Array.isArray(value)) {
      value.forEach(v => push(`${prefix}[]`, v));
    } else if (value && typeof value === 'object') {
      Object.keys(value).forEach(k => build(`${prefix}[${k}]`, value[k]));
    } else {
      push(prefix, value);
    }
  }

  Object.keys(params).forEach(k => build(k, (params as any)[k]));
  return parts.length ? `?${parts.join('&')}` : '';
}