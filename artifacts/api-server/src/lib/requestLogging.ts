/** The only request fields retained in access logs; deliberately never include bodies. */
export function serializeRequestForLog(req: { id?: string; method?: string; url?: string; originalUrl?: string }) {
  return {
    id: req.id,
    method: req.method,
    url: (req.originalUrl ?? req.url ?? "").split("?")[0],
  };
}