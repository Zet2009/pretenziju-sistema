// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const fetch = require('node-fetch');
const LRU = require('lru-cache');

require('dotenv').config();

const app = express();

// === IŠTAISYTI CORS: be baltų tarpų ===
const corsOptions = {
  origin: [
    'https://pretenzijos-sistema.onrender.com',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Preflight
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

// === CACHE INICIALIZACIJA ===
const cache = new LRU({
  max: 5000,
  ttl: 24 * 60 * 60 * 1000 // 24 valandos
});

// API proxy maršrutas į rubineta.com
app.get('/api/products', async (req, res) => {
    try {
        const { per_page = 25, page = 1, lang = 'lt' } = req.query;

        const url = `https://rubineta.com/ru/wp-json/wc/v3/products?consumer_key=ck_ba4ea3a1372bfe158019acd0fb541def80d55f47&consumer_secret=cs_3008445c92b783c6b63717e0b64cae31d60f570e&per_page=${per_page}&page=${page}&lang=${lang}`;

        const response = await fetch(url);
        const data = await response.json();

        // Filtruoti tik lietuviškus produktus
        const lithuanianProducts = Array.isArray(data)
            ? data.filter(p => p.permalink && !/\/(ru|en|pl|lv)\//.test(p.permalink))
            : [];

        res.json(lithuanianProducts);
    } catch (error) {
        console.error('Klaida kviečiant rubineta.com API:', error);
        res.status(500).json({ error: 'Nepavyko gauti produktų' });
    }
});



// === Nodemailer transporter (Gmail) ===
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
  if (error) {
    console.error('SMTP klaida:', error);
  } else {
    console.log('✅ SMTP serveris pasiruošęs siųsti laiškus');
  }
});

// === Siųsti slaptažodžio atkūrimo laišką ===
app.post('/send-password-reset', async (req, res) => {
  const { email, resetLink } = req.body;

  const mailOptions = {
    from: `"Rubineta Pretenzijos" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Atkurti slaptažodį – Rubineta',
    text: `Sveiki,\n\nJūs paprašėte atkurti slaptažodį.\n\nSpauskite nuorodą, kad nustatytumėte naują:\n${resetLink}\n\nNuoroda galioja 1 valandą.\n\nJei to nedarėte – galite ignoruoti šį laišką.\n\nPagarbiai,\nRubineta komanda`
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true });
  } catch (error) {
    console.error('Klaida siunčiant slaptažodžio atkūrimo laišką:', error);
    res.status(500).json({ success: false, error: 'Nepavyko išsiųsti laiško' });
  }
});

// === API proxy į rubineta.com ===
app.get('/api/products', async (req, res) => {
  try {
    const { per_page = 25, page = 1, lang = 'lt' } = req.query;

    const url = `https://rubineta.com/ru/wp-json/wc/v3/products?consumer_key=ck_ba4ea3a1372bfe158019acd0fb541def80d55f47&consumer_secret=cs_3008445c92b783c6b63717e0b64cae31d60f570e&per_page=${per_page}&page=${page}&lang=${lang}`;

    const response = await fetch(url);
    const data = await response.json();

    const lithuanianProducts = Array.isArray(data)
      ? data.filter(p => p.permalink && !/\/(ru|en|pl|lv)\//.test(p.permalink))
      : [];

    res.json(lithuanianProducts);
  } catch (error) {
    console.error('Klaida kviečiant rubineta.com API:', error);
    res.status(500).json({ error: 'Nepavyko gauti produktų' });
  }
});

// === 1. Laiškas klientui – patvirtinimas, kad pretenzija priimta ===
app.post('/send-confirmation', async (req, res) => {
  const { email, claimId, language = 'lt', isRegistered = false } = req.body;

  const templates = {
    lt: {
      subject: `Pretenzija #${claimId} priimta`,
      body: isRegistered
        ? `Sveiki,\n\nJūsų pretenzija #${claimId} sėkmingai priimta.\nAtsakysime per 24 valandas.\nPrisijunkite į savo kabinetą, kad stebėtumėte būseną:\nhttps://pretenzijos-sistema.onrender.com/login.html?claim=${claimId}\n\nPagarbiai,\nRubineta kokybės komanda`
        : `Sveiki,\n\nJūsų pretenzija #${claimId} sėkmingai priimta.\nAtsakysime per 24 valandas.\nInformuojame, kad galite pasiteirauti apie būseną pateikdami šį ID: ${claimId}\n\nPagarbiai,\nRubineta kokybės komanda`
    },
    en: {
      subject: `Pretenzija #${claimId} priimta`,
      body: isRegistered
        ? `Sveiki,\n\nJūsų pretenzija #${claimId} sėkmingai priimta.\nAtsakysime per 24 valandas.\nPrisijunkite į savo kabinetą, kad stebėtumėte būseną:\nhttps://pretenzijos-sistema.onrender.com/login.html?claim=${claimId}\n\nPagarbiai,\nRubineta kokybės komanda`
        : `Sveiki,\n\nJūsų pretenzija #${claimId} sėkmingai priimta.\nAtsakysime per 24 valandas.\nInformuojame, kad galite pasiteirauti apie būseną pateikdami šį ID: ${claimId}\n\nPagarbiai,\nRubineta kokybės komanda`
    },
    ru: {
      subject: `Pretenzija #${claimId} priimta`,
      body: isRegistered
        ? `Sveiki,\n\nJūsų pretenzija #${claimId} sėkmingai priimta.\nAtsakysime per 24 valandas.\nPrisijunkite į savo kabinetą, kad stebėtumėte būseną:\nhttps://pretenzijos-sistema.onrender.com/login.html?claim=${claimId}\n\nPagarbiai,\nRubineta kokybės komanda`
        : `Sveiki,\n\nJūsų pretenzija #${claimId} sėkmingai priimta.\nAtsakysime per 24 valandas.\nInformuojame, kad galite pasiteirauti apie būseną pateikdami šį ID: ${claimId}\n\nPagarbiai,\nRubineta kokybės komanda`
    },
    lv: {
      subject: `Pretenzija #${claimId} priimta`,
      body: isRegistered
        ? `Sveiki,\n\nJūsų pretenzija #${claimId} sėkmingai priimta.\nAtsakysime per 24 valandas.\nPrisijunkite į savo kabinetą, kad stebėtumėte būseną:\nhttps://pretenzijos-sistema.onrender.com/login.html?claim=${claimId}\n\nPagarbiai,\nRubineta kokybės komanda`
        : `Sveiki,\n\nJūsų pretenzija #${claimId} sėkmingai priimta.\nAtsakysime per 24 valandas.\nInformuojame, kad galite pasiteirauti apie būseną pateikdami šį ID: ${claimId}\n\nPagarbiai,\nRubineta kokybės komanda`
    },
  };

  const lang = templates[language] ? language : 'lt';
  const { subject, body } = templates[lang];

  const mailOptions = {
    from: `"Rubineta Pretenzijos" <${process.env.EMAIL_USER}>`,
    to: email,
    subject,
    text: body
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Laiškas išsiųstas' });
  } catch (error) {
    console.error('Klaida siunčiant klientui:', error);
    res.status(500).json({ success: false, error: 'Nepavyko išsiųsti laiško klientui' });
  }
});

// === 2. Laiškas meistrui – kai priskiriama pretenzija ===
app.post('/send-to-partner', async (req, res) => {
  const { claimId, partnerEmail, partnerContactPerson, note, attachments = [], claimLink, customer } = req.body;

  let body = `Sveiki, ${partnerContactPerson},\n\nJums priskirta pretenzija:\n`;
  body += `- ID: ${claimId}\n`;
  body += `- Rekomendacija: ${note || 'Nėra papildomų pastabų'}\n\n`;

  if (customer) {
    body += `🔹 **KONTAKTINĖ INFORMACIJA**\n`;
    body += `- Vardas: ${customer.name} ${customer.surname}\n`;
    body += `- Telefonas: ${customer.phone}\n`;
    body += `- El. paštas: ${customer.email}\n`;
    body += `- Adresas: ${customer.street}, ${customer.city}, ${customer.postal}\n\n`;
  }

  body += `Prisegti dokumentai:\n`;
  if (attachments.length > 0) {
    attachments.forEach(att => {
      body += `- ${att.name}: ${att.url}\n`;
    });
  } else {
    body += `- Nėra pridėtų dokumentų\n`;
  }

  if (claimLink) {
    body += `\nPeržiūrėti visą užduotį: ${claimLink}\n\n`;
  }

  body += `Prašome išspręsti problemą ir atnaujinti būseną sistemoje.\n\nGeriausios sveikatos,\nRubineta kokybės komanda\ninfo@rubineta.lt\n+370 612 34567`;

  const mailOptions = {
    from: `"Rubineta Pretenzijos" <${process.env.EMAIL_USER}>`,
    to: partnerEmail,
    subject: `Pretenzija ${claimId} – perduota jūsų aptarnavimui`,
    text: body
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true });
  } catch (error) {
    console.error('Klaida siunčiant meistrui:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// === 3. Laiškas kokybės darbuotojui – nauja pretenzija ===
app.post('/notify-quality', async (req, res) => {
  const { claimId } = req.body;

  const mailOptions = {
    from: `"Sistema" <${process.env.EMAIL_USER}>`,
    to: process.env.QUALITY_EMAIL,
    subject: `🔔 Nauja pretenzija #${claimId}`,
    text: `Sveiki,\n\nSistema gavo naują pretenziją: #${claimId}\nPrašome peržiūrėti administratoriaus zonoje: https://pretenzijos-sistema.onrender.com/admin.html`
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Pranešimas išsiųstas kokybės darbuotojui' });
  } catch (error) {
    console.error('Klaida siunčiant kokybės darbuotojui:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Laiškas klientui – apklausos nuoroda ===
app.post('/send-feedback-survey', async (req, res) => {
  const { email, claimId, feedbackLink } = req.body;

  if (!email || !claimId || !feedbackLink) {
    return res.status(400).json({ 
      success: false, 
      error: 'Trūksta būtinų duomenų: email, claimId arba feedbackLink' 
    });
  }

  const mailOptions = {
    from: `"Rubineta Pretenzijos" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Įvertinkite mūsų aptarnavimą – pretenzija #${claimId}`,
    text: `Ačiū, kad pasinaudojote mūsų paslaugomis!\n\nPrašome trumpai įvertinti aptarnavimą:\n${feedbackLink}\n\nJūsų nuomonė mums svarbi.\n\nPagarbiai,\nRubineta kokybės komanda`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('✅ Apklausos laiškas išsiųstas klientui:', email);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Klaida siunčiant apklausą:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// === 4. Laiškas klientui ir kokybės darbuotojui – išspręsta pretenzija ===
app.post('/notify-resolved', async (req, res) => {
  const { claimId, customerEmail, customerName, productName } = req.body;

  const customerMail = {
    from: `"Rubineta Pretenzijos" <${process.env.EMAIL_USER}>`,
    to: customerEmail,
    subject: `✅ Jūsų pretenzija #${claimId} išspręsta`,
    text: `Sveiki, ${customerName},\n\nJūsų pretenzija #${claimId} (produktas: ${productName}) yra išspręsta.\nDėkojame, kad pasirinkote Rubineta.\n\nPagarbiai,\nRubineta kokybės komanda\ninfo@rubineta.lt\n+370 612 34567`
  };

  const qualityMail = {
    from: `"Meistras" <${process.env.EMAIL_USER}>`,
    to: process.env.QUALITY_EMAIL,
    subject: `🔧 Meistras išsprendė pretenziją #${claimId}`,
    text: `Meistras pranešė, kad pretenzija #${claimId} (produktas: ${productName}) yra išspręsta.\nPrašome patikrinti ir uždaryti užduotį sistemoje.\n\nPeržiūrėti: https://pretenzijos-sistema.onrender.com/claim-view.html?id=${claimId}`
  };

  try {
    await transporter.sendMail(customerMail);
    await transporter.sendMail(qualityMail);
    res.json({ success: true });
  } catch (error) {
    console.error('Klaida siunčiant pranešimą:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Laiškas klientui – būsenos keitimas ===
app.post('/notify-status-change', async (req, res) => {
  const { claimId, customerEmail, customerName, status } = req.body;

  const templates = {
    'Perduota servisui': {
      subject: `Pretenzija #${claimId} – perduota servisui`,
      body: `Sveiki, ${customerName},\n\nJūsų pretenzija #${claimId} buvo perduota serviso partneriui.\nMeistras susisieks su jumis artimiausiu metu.\n\nPagarbiai,\nRubineta kokybės komanda`
    },
    'Išspręsta': {
      subject: `✅ Pretenzija #${claimId} išspręsta`,
      body: `Sveiki, ${customerName},\n\nJūsų pretenzija #${claimId} yra išspręsta.\nDėkojame, kad pasirinkote Rubineta.\n\nPagarbiai,\nRubineta kokybės komanda`
    }
  };

  const template = templates[status] || {
    subject: `Pretenzija #${claimId} – būsena pasikeitė`,
    body: `Sveiki, ${customerName},\n\nJūsų pretenzijos #${claimId} būsena pasikeitė į: ${status}.\n\nPagarbiai,\nRubineta kokybės komanda`
  };

  const mailOptions = {
    from: `"Rubineta Pretenzijos" <${process.env.EMAIL_USER}>`,
    to: customerEmail,
    subject: template.subject,
    text: template.body
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true });
  } catch (error) {
    console.error('Klaida siunčiant klientui:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Miestų paieška per Geonames ===
app.get('/api/cities', async (req, res) => {
  const country = (req.query.country || 'LT').toUpperCase();
  const q = (req.query.q || '').trim();

  if (!process.env.GEONAMES_USERNAME) {
    return res.status(500).json({ error: 'Trūksta GEONAMES_USERNAME .env faile' });
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
    console.error('Geonames fetch klaida:', err);
    res.status(500).json({ error: 'Nepavyko gauti duomenų' });
  }
});

// === Palaikomos šalys ===
app.get('/api/countries', (req, res) => {
  res.json(['LT', 'LV', 'EE', 'PL', 'UA', 'BY']);
});

// === PORT ir paleidimas ===
const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Serveris veikia ant http://0.0.0.0:${PORT}`);
});
