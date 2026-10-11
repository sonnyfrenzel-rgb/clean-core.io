/**
 * A small in-memory stand-in for `express`, bundled into a sandbox run instead
 * of the universal stub when the generated code imports `express`.
 *
 * Why (owner, 11.10.2026, external review F-02): the universal stub turns
 * `app.get(path, handler)` into a call that discards the handler, so no test
 * could ever reach a route — and the defect of the reviewed package lived in
 * three route handlers that read the customer filter differently. This fake
 * records the routes and the middlewares, and exposes one request harness on
 * `globalThis.__ccRequestHarness`:
 *
 *   invoke(app, method, path, { query, body, params, headers })
 *     → Promise<{ status, headers, text, json }>
 *
 * which runs the app's middlewares and the matching route's handlers with a
 * fake request and response, in-process. Nothing listens, nothing binds a
 * port, nothing leaves the process: `listen` is a no-op, as the neutraliser in
 * `./core.ts` already made it. Every property the fake does not define falls
 * back to the universal stub, so code that touched `express.static` or
 * `app.locals` before keeps loading exactly as it did.
 *
 * Plain CommonJS JavaScript in a string, like the universal stub: it is the
 * module esbuild inlines for the bare import `express`. It runs under the same
 * guards as everything else in the child (`lib/sandbox-module-guard.ts`,
 * `./net-guard.ts`); it imports nothing.
 *
 * Changing it changes what the runner executes, so it reaches the isolated
 * runner only with the runner's next deploy (`runner/` bundles this file).
 * Until then a suite's invariant test reports itself as skipped there.
 */
export const EXPRESS_FAKE_SOURCE = String.raw`
const stubHandler = {
  get(_t, prop) {
    if (prop === '__esModule') return false;
    if (prop === 'then') return undefined;
    if (prop === 'default') return universal;
    if (prop === 'toString') return () => '';
    if (prop === 'valueOf') return () => 0;
    if (prop === 'toJSON') return () => null;
    if (typeof prop === 'symbol') return undefined;
    return universal;
  },
  apply() { return universal; },
  construct() { return universal; },
};
const universal = new Proxy(function () {}, stubHandler);

function withFallback(target) {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (prop in t) return Reflect.get(t, prop, receiver);
      if (prop === '__esModule') return false;
      if (prop === 'then') return undefined;
      if (typeof prop === 'symbol') return undefined;
      return universal;
    },
    set(t, prop, value) {
      // A named-import binding assigned by the sandbox must not replace what the fake defines.
      if (prop in t && value === universal) return true;
      t[prop] = value;
      return true;
    },
  });
}

function joinPath(prefix, path) {
  const p = (String(prefix || '') + '/' + String(path || '')).replace(/\/+/g, '/');
  return p.length > 1 ? p.replace(/\/$/, '') : p;
}

function matchPath(pattern, path) {
  if (pattern === '*' || pattern === '/*') return {};
  const a = String(pattern).split('/').filter(Boolean);
  const b = String(path).split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1).replace(/\?$/, '')] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

function makeRouter(isApp) {
  const stack = [];
  const target = function (req, res, next) { return next && next(); };
  target.__ccStack = stack;
  target.__ccIsRouter = true;
  const route = (method) => function (path, ...handlers) {
    if (method === 'GET' && handlers.length === 0 && isApp) return undefined; // app.get(setting)
    stack.push({ kind: 'route', method, path: String(path), handlers: handlers.flat() });
    return proxy;
  };
  target.get = route('GET');
  target.post = route('POST');
  target.put = route('PUT');
  target.patch = route('PATCH');
  target.delete = route('DELETE');
  target.all = route('ALL');
  target.use = function (...args) {
    let prefix = '/';
    if (typeof args[0] === 'string' || args[0] instanceof RegExp) prefix = String(args.shift());
    for (const h of args.flat()) stack.push({ kind: 'use', prefix, handler: h });
    return proxy;
  };
  target.route = function (path) {
    const r = {};
    for (const m of ['get', 'post', 'put', 'patch', 'delete', 'all']) r[m] = (...h) => { target[m](path, ...h); return r; };
    return r;
  };
  target.listen = function (...args) {
    const cb = args.find((a) => typeof a === 'function');
    if (cb) { try { cb(); } catch (e) {} }
    return { close: (fn) => { if (typeof fn === 'function') fn(); }, address: () => ({ port: 0 }), on: () => undefined };
  };
  target.set = function () { return proxy; };
  target.enable = function () { return proxy; };
  target.disable = function () { return proxy; };
  target.locals = {};
  const proxy = withFallback(target);
  return proxy;
}

// The routes a request reaches, flattened through mounted routers, in order.
function flatten(router, prefix, out) {
  const stack = router && router.__ccStack;
  if (!stack) return out;
  for (const layer of stack) {
    if (layer.kind === 'route') out.push({ kind: 'route', method: layer.method, path: joinPath(prefix, layer.path), handlers: layer.handlers });
    else if (layer.handler && layer.handler.__ccStack) flatten(layer.handler, joinPath(prefix, layer.prefix), out);
    else if (typeof layer.handler === 'function') out.push({ kind: 'use', prefix: joinPath(prefix, layer.prefix), handler: layer.handler });
  }
  return out;
}

function invoke(app, method, path, input) {
  const opts = input || {};
  const m = String(method || 'GET').toUpperCase();
  return new Promise((resolve) => {
    let done = false;
    const headers = {};
    const finish = (status, text) => {
      if (done) return;
      done = true;
      let json;
      try { json = text === undefined || text === '' ? undefined : JSON.parse(text); } catch (e) { json = undefined; }
      resolve({ status, headers, text: text === undefined ? '' : String(text), json });
    };
    const res = {
      statusCode: 200,
      locals: {},
      headersSent: false,
      status(code) { res.statusCode = code; return res; },
      sendStatus(code) { res.statusCode = code; finish(code, String(code)); return res; },
      set(k, v) { if (typeof k === 'object') { for (const [a, b] of Object.entries(k)) headers[String(a).toLowerCase()] = String(b); } else headers[String(k).toLowerCase()] = String(v); return res; },
      header(k, v) { return res.set(k, v); },
      setHeader(k, v) { headers[String(k).toLowerCase()] = String(v); return res; },
      getHeader(k) { return headers[String(k).toLowerCase()]; },
      type(t) { headers['content-type'] = String(t); return res; },
      attachment(name) { headers['content-disposition'] = 'attachment' + (name ? '; filename="' + name + '"' : ''); return res; },
      json(body) { if (!headers['content-type']) headers['content-type'] = 'application/json'; res.headersSent = true; finish(res.statusCode, JSON.stringify(body === undefined ? null : body)); return res; },
      send(body) {
        res.headersSent = true;
        if (body !== null && typeof body === 'object' && !(body instanceof Uint8Array)) return res.json(body);
        finish(res.statusCode, body === undefined ? '' : String(body));
        return res;
      },
      end(body) { res.headersSent = true; finish(res.statusCode, body === undefined ? '' : String(body)); return res; },
      write(chunk) { res.__chunks = (res.__chunks || '') + String(chunk); return true; },
      redirect(a, b) { finish(typeof a === 'number' ? a : 302, String(b || a)); return res; },
      on() { return res; },
      once() { return res; },
    };
    const origEnd = res.end;
    res.end = function (body) { return origEnd(body === undefined && res.__chunks ? res.__chunks : body); };
    const req = {
      method: m,
      path,
      url: path,
      originalUrl: path,
      query: Object.assign({}, opts.query || {}),
      body: opts.body === undefined ? {} : opts.body,
      params: Object.assign({}, opts.params || {}),
      headers: Object.assign({}, opts.headers || {}),
      get(name) { return this.headers[String(name).toLowerCase()]; },
      header(name) { return this.headers[String(name).toLowerCase()]; },
      app,
      res,
    };
    res.req = req;
    const layers = flatten(app, '/', []);
    const chain = [];
    for (const layer of layers) {
      if (layer.kind === 'use') {
        if (layer.prefix === '/' || path === layer.prefix || path.startsWith(layer.prefix + '/')) chain.push({ fn: layer.handler, params: null });
      } else if (layer.method === 'ALL' || layer.method === m) {
        const params = matchPath(layer.path, path);
        if (params) for (const h of layer.handlers) chain.push({ fn: h, params });
      }
    }
    let i = 0;
    const next = (err) => {
      if (done) return;
      while (i < chain.length) {
        const step = chain[i++];
        if (typeof step.fn !== 'function') continue;
        const isErrorHandler = step.fn.length === 4;
        if (err && !isErrorHandler) continue;
        if (!err && isErrorHandler) continue;
        if (step.params) req.params = Object.assign({}, step.params, opts.params || {});
        try {
          const out = err ? step.fn(err, req, res, next) : step.fn(req, res, next);
          if (out && typeof out.then === 'function') out.then(undefined, (e) => next(e || new Error('rejected')));
        } catch (e) {
          next(e);
        }
        return;
      }
      if (err) finish(500, String((err && err.message) || err));
      else finish(404, 'Cannot ' + m + ' ' + path);
    };
    next();
    setTimeout(() => finish(0, 'no response within 5 s'), 5000).unref?.();
  });
}

function express() {
  return makeRouter(true);
}
const noopMiddleware = () => function (req, res, next) { return next(); };
express.json = noopMiddleware;
express.urlencoded = noopMiddleware;
express.text = noopMiddleware;
express.raw = noopMiddleware;
express.static = noopMiddleware;
express.Router = function () { return makeRouter(false); };

globalThis.__ccRequestHarness = { invoke };

module.exports = withFallback(express);
`;

/** The bare packages that get a fake instead of the universal stub. */
export const FAKED_PACKAGES: Readonly<Record<string, string>> = Object.freeze({ express: EXPRESS_FAKE_SOURCE });
