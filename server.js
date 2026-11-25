const http = require('http');
const fs = require('fs');
const path = require('path');

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search?name=';
const WX_URL  = 'https://api.open-meteo.com/v1/forecast?';

// ---------- Haversine distance (km) ----------
function haversine(a, b) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
  const s = Math.sin(dLat/2)**2 + Math.cos(a.lat*toR)*Math.cos(b.lat*toR)*Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

// ---------- TSP solver (nearest-neighbour + 2-opt) ----------
function routeDist(pts, ord) {
  let d = 0; for (let i = 0; i < ord.length - 1; i++) d += haversine(pts[ord[i]], pts[ord[i+1]]);
  return d;
}
function twoOptSwap(route, i, k) {
  return route.slice(0, i).concat(route.slice(i, k+1).reverse()).concat(route.slice(k+1));
}
function solveTSP(points) {
  if (points.length < 3) return { order: points.map((_, i) => i), distance: points.length === 2 ? 2*haversine(points[0], points[1]) : 0 };
  const n = points.length, start = 0;
  const visited = new Set([start]); let order = [start], cur = start;
  while (order.length < n) {
    let best = -1, bd = Infinity;
    for (let j = 0; j < n; j++) if (!visited.has(j)) {
      const d = haversine(points[cur], points[j]);
      if (d < bd) { bd = d; best = j; }
    }
    visited.add(best); order.push(best); cur = best;
  }
  order.push(start);
  let improved = true, dist = routeDist(points, order);
  while (improved) {
    improved = false;
    for (let i = 1; i < order.length - 2; i++) {
      for (let k = i + 1; k < order.length - 1; k++) {
        const newOrder = twoOptSwap(order, i, k);
        const nd = routeDist(points, newOrder);
        if (nd < dist - 1e-6) { dist = nd; order = newOrder; improved = true; }
      }
    }
  }
  return { order, distance: dist };
}

// ---------- fetch helper with timeout ----------
async function getJSON(url, ms = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

// ---------- geocode ----------
async function geocode(name) {
  const q = encodeURIComponent(name.trim());
  const data = await getJSON(GEO_URL + q);
  if (!data.results || !data.results.length) return null;
  const r = data.results[0];
  return { name: r.name, country: r.country_code || '', lat: r.latitude, lon: r.longitude };
}

// ---------- weather ----------
async function weather(lat, lon) {
  const url = `${WX_URL}latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=auto`;
  const d = await getJSON(url);
  if (!d.daily) return null;
  return d.daily.time.map((t, i) => ({
    d: t, tmax: d.daily.temperature_2m_max[i], tmin: d.daily.temperature_2m_min[i],
    precip: d.daily.precipitation_sum[i], code: d.daily.weathercode[i]
  }));
}

// ---------- static file server ----------
const MIME = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.png':'image/png', '.svg':'image/svg+xml' };
function serveStatic(res, url) {
  const p = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(__dirname, 'public', p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
    res.end(data);
  });
}

// ---------- main handler ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    try {
      if (url.pathname === '/api/geocode') {
        const name = url.searchParams.get('q') || '';
        if (!name) throw new Error('Missing ?q=');
        const g = await geocode(name);
        if (!g) { res.writeHead(404); res.end(JSON.stringify({ error: 'City not found' })); return; }
        res.end(JSON.stringify(g)); return;
      }
      if (url.pathname === '/api/weather') {
        const lat = +url.searchParams.get('lat'), lon = +url.searchParams.get('lon');
        const w = await weather(lat, lon);
        if (!w) { res.writeHead(502); res.end(JSON.stringify({ error: 'Weather unavailable' })); return; }
        res.end(JSON.stringify(w)); return;
      }
      if (url.pathname === '/api/plan') {
        const cities = JSON.parse(url.searchParams.get('cities') || '[]');
        if (cities.length < 2) throw new Error('Need at least 2 cities');
        const pts = cities.map(c => ({ lat: c.lat, lon: c.lon, name: c.name, country: c.country || '' }));
        const { order, distance } = solveTSP(pts);
        res.setHeader('Cache-Control', 'public, max-age=120');
        res.end(JSON.stringify({ order, distance, cities: pts })); return;
      }
      res.writeHead(404); res.end(JSON.stringify({ error: 'Unknown route' }));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  serveStatic(res, url);
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`⟁ Tripsolver running → http://localhost:${PORT}`));