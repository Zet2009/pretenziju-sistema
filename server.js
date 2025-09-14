// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const fetch = require('node-fetch'); // HTTP užklausoms
const LRU = require('lru-cache');

require('dotenv').config();

const app = express();

// Ištaisytas CORS: pašalinti balti tarpai
const corsOptions = {
  origin: [
    'https://pretenzijos-sistema.onrender.com', // ← be tarpų!
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // preflight
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

// Nodemailer
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.verify((error, success) => {
  if (error) console.error('SMTP klaida:', error);
  else console.log('✅ SMTP pasiruošęs siųsti');
});

// Cache
const cache = new LRU({ max: 5000, ttl: 24 * 60 * 60 * 1000 });

// === Miestų paieška per Nominatim (OpenStreetMap) ===
app.get('/api/cities-nominatim', async (req, res) => {
  const { q, country } = req.query;

  if (!q || q.length < 2) return res.json([]);

  try {
    // ✅ Teisingas URL be tarpų
    const url = new URL('https://nominatim.openstreetmap.org/search');

    url.searchParams.append('q', q);
    if (country) url.searchParams.append('country', country);
    url.searchParams.append('format', 'json');
    url.searchParams.append('addressdetails', '1');
    url.searchParams.append('limit', '10');
    url.searchParams.append('city', '');

    const response = await fetch(url, {
      headers: {
        // ✅ Teisingas User-Agent be tarpų
        'User-Agent': 'Rubineta Pretenziju Sistema https://pretenzijos-sistema.onrender.com'
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();

    const cities = data
      .filter(item => ['city', 'town', 'village'].includes(item.type))
      .map(item => ({
        name: item.address.city || item.address.town || item.address.village,
        admin1: item.address.state || item.address.county,
        country: item.address.country_code?.toUpperCase(),
        lat: item.lat,
        lon: item.lon
      }))
      .filter(c => c.name);

    res.json(cities);
  } catch (err) {
    console.error('Nominatim klaida:', err.message);
    res.status(500).json({ error: 'Nepavyko gauti miestų iš OpenStreetMap' });
  }
});

// === Miestų paieška per Geonames ===
app.get('/api/cities', async (req, res) => {
  const country = (req.query.country || 'LT').toUpperCase();
  const q = (req.query.q || '').trim();

  if (!process.env.GEONAMES_USERNAME) {
    return res.status(500).json({ error: 'Trūksta GEONAMES_USERNAME' });
  }

  const cacheKey = `cities:${country}`;
  let cities = cache.get(cacheKey);

  try {
    if (!cities) {
      const url = `http://api.geonames.org/searchJSON?country=${country}&featureClass=P&maxRows=1000&username=${encodeURIComponent(process.env.GEONAMES_USERNAME)}`;
      const r = await fetch(url);
      if (!r.ok) return res.status(502).json({ error: 'Geonames klaida' });
      const data = await r.json();

      cities = (data.geonames || []).map(p => ({
        name: p.name,
        admin1: p.adminName1,
        country: p.countryCode
      }));

      const seen = new Set();
      cities = cities.filter(c => {
        const key = `${c.name}||${c.admin1}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      cache.set(cacheKey, cities);
    }

    const out = q
      ? cities.filter(c => c.name.toLowerCase().startsWith(q.toLowerCase()))
      : cities;

    res.json(out.slice(0, 50));
  } catch (err) {
    console.error('Geonames klaida:', err);
    res.status(500).json({ error: 'Nepavyko gauti duomenų' });
  }
});

// === Šalys ===
app.get('/api/countries', (req, res) => {
  res.json(['LT', 'LV', 'EE', 'PL', 'UA', 'BY']);
});

// --- Tavo laiškų API ---
// Paliekam visus tavo esamus POST maršrutus (send-confirmation, notify-quality ir kt.)
// ... (jie čia palikti tokie patys)

// === PORT: svarbu! Render tikisi 10000 ===
const PORT = process.env.PORT || 10000; // ← keičiam nuo 3000 į 10000

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Serveris veikia ant http://0.0.0.0:${PORT}`);
});
