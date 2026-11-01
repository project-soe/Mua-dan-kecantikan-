// Hanya asal yang ada di daftar yang boleh memanggil API dari browser.
export function cors(allowed) {
  const list = new Set(allowed);
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && list.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  };
}
