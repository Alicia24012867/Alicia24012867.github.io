/** Development answers for generated documents, matching how static hosting serves them. */
export function serveGenerated(req, res, next, type, read) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    return res.end();
  }
  try {
    const body = req.method === 'HEAD' ? undefined : read();
    res.setHeader('Content-Type', `${type}; charset=utf-8`);
    res.setHeader('Cache-Control', 'no-cache');
    res.end(body);
  } catch (error) {
    next(error);
  }
}
