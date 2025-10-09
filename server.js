// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const LRU = require('lru-cache');

require('dotenv').config();

const app = express();

// Išsamiau sukonfigūruokite CORS
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
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

// Įtraukite OPTIONS užklausų apdorojimą
app.options('*', cors(corsOptions));

// === Mailjet email siuntimo funkcija ===
async function sendEmail(to, subject, text, html = null) {
  try {
    // Mailjet API autentifikacija
    const auth = Buffer.from(
      `${process.env.MAILJET_API_KEY}:${process.env.MAILJET_API_SECRET}`
    ).toString('base64');

    const emailData = {
      Messages: [
        {
          From: {
            Email: process.env.EMAIL_FROM,
            Name: process.env.EMAIL_FROM_NAME || 'Rubineta Pretenzijos'
          },
          To: [
            {
              Email: to,
              Name: to.split('@')[0] // paprastas vardo generavimas
            }
          ],
          Subject: subject,
          TextPart: text,
          ...(html && { HTMLPart: html })
        }
      ]
    };

    const response = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify(emailData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Mailjet klaida:', errorData);
      throw new Error(`Mailjet klaida: ${errorData.ErrorMessage || response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ Laiškas išsiųstas per Mailjet:', data);
    return data;
  } catch (error) {
    console.error('❌ Klaida siunčiant laišką per Mailjet:', error.message);
    throw error;
  }
}

// 24h cache Geonames atsakymams
const cache = new LRU({
  max: 5000,
  ttl: 24 * 60 * 60 * 1000
});

// === 1. Siųsti slaptažodžio atkūrimo laišką ===
app.post('/send-password-reset', async (req, res) => {
  const { email, resetLink } = req.body;

  const subject = 'Atkurti slaptažodį – Rubineta';
  const text = `Sveiki,\n\nJūs paprašėte atkurti slaptažodį.\n\nSpauskite nuorodą, kad nustatytumėte naują:\n${resetLink}\n\nNuoroda galioja 1 valandą.\n\nJei to nedarėte – galite ignoruoti šį laišką.\n\nPagarbiai,\nRubineta komanda`;

  try {
    await sendEmail(email, subject, text);
    res.json({ success: true });
  } catch (error) {
    console.error('Klaida siunčiant slaptažodžio atkūrimo laišką:', error);
    res.status(500).json({ success: false, error: 'Nepavyko išsiųsti laiško' });
  }
});

// === 2. Laiškas klientui – patvirtinimas, kad pretenzija priimta ===
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
      subject: `Claim #${claimId} accepted`,
      body: isRegistered
        ? `Hello,\n\nYour claim #${claimId} has been successfully accepted.\nWe will respond within 24 hours.\nLog in to your account to track the status:\nhttps://pretenzijos-sistema.onrender.com/login.html?claim=${claimId}\n\nBest regards,\nRubineta quality team`
        : `Hello,\n\nYour claim #${claimId} has been successfully accepted.\nWe will respond within 24 hours.\nYou can inquire about the status by providing this ID: ${claimId}\n\nBest regards,\nRubineta quality team`
    }
  };

  const lang = templates[language] ? language : 'lt';
  const { subject, body } = templates[lang];

  try {
    await sendEmail(email, subject, body);
    res.json({ success: true, message: 'Laiškas išsiųstas' });
  } catch (error) {
    console.error('Klaida siunčiant klientui:', error);
    res.status(500).json({ success: false, error: 'Nepavyko išsiųsti laiško klientui' });
  }
});

// === 3. Laiškas meistrui – kai priskiriama pretenzija ===
app.post('/send-to-partner', async (req, res) => {
  const { claimId, partnerEmail, partnerContactPerson, note, attachments = [], claimLink, customer } = req.body;

  let body = `Sveiki, ${partnerContactPerson},\n\nJums priskirta pretenzija:\n`;
  body += `- ID: ${claimId}\n`;
  body += `- Rekomendacija: ${note || 'Nėra papildomų pastabų'}\n\n`;

  // Kliento kontaktai
  if (customer) {
    body += `🔹 KONTAKTINĖ INFORMACIJA\n`;
    body += `- Vardas: ${customer.name} ${customer.surname}\n`;
    body += `- Telefonas: ${customer.phone}\n`;
    body += `- El. paštas: ${customer.email}\n`;
    body += `- Adresas: ${customer.street}, ${customer.city}, ${customer.postal}\n\n`;
  }

  // Prisegti dokumentai
  body += `Prisegti dokumentai:\n`;
  if (attachments.length > 0) {
    attachments.forEach(att => {
      body += `- ${att.name}: ${att.url}\n`;
    });
  } else {
    body += `- Nėra pridėtų dokumentų\n`;
  }

  // Nuoroda meistrui
  if (claimLink) {
    body += `\nPeržiūrėti visą užduotį: ${claimLink}\n\n`;
  }

  body += `Prašome išspręsti problemą ir atnaujinti būseną sistemoje.\n\nGeriausios sveikatos,\nRubineta kokybės komanda\ninfo@rubineta.lt\n+370 612 34567`;

  const subject = `Pretenzija ${claimId} – perduota jūsų aptarnavimui`;

  try {
    await sendEmail(partnerEmail, subject, body);
    res.json({ success: true });
  } catch (error) {
    console.error('Klaida siunčiant meistrui:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// === 4. Laiškas kokybės darbuotojui – kai ateina nauja pretenzija ===
app.post('/notify-quality', async (req, res) => {
  const { claimId } = req.body;

  const subject = `🔔 Nauja pretenzija #${claimId}`;
  const text = `Sveiki,\n\nSistema gavo naują pretenziją: #${claimId}\nPrašome peržiūrėti administratoriaus zonoje: https://pretenzijos-sistema.onrender.com/admin.html`;

  try {
    await sendEmail(process.env.QUALITY_EMAIL, subject, text);
    res.json({ success: true, message: 'Pranešimas išsiųstas kokybės darbuotojui' });
  } catch (error) {
    console.error('Klaida siunčiant kokybės darbuotojui:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// === 5. Laiškas klientui – išsiųsti apklausos nuorodą ===
app.post('/send-feedback-survey', async (req, res) => {
  const { email, claimId, feedbackLink } = req.body;

  if (!email || !claimId || !feedbackLink) {
    return res.status(400).json({ 
      success: false, 
      error: 'Trūksta būtinų duomenų: email, claimId arba feedbackLink' 
    });
  }

  const subject = `Įvertinkite mūsų aptarnavimą – pretenzija #${claimId}`;
  const text = `Ačiū, kad pasinaudojote mūsų paslaugomis!\n\nPrašome trumpai įvertinti aptarnavimą:\n${feedbackLink}\n\nJūsų nuomonė mums svarbi.\n\nPagarbiai,\nRubineta kokybės komanda`;

  try {
    await sendEmail(email, subject, text);
    console.log('✅ Apklausos laiškas išsiųstas klientui:', email);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Klaida siunčiant apklausą:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// === 6. Laiškas klientui ir kokybės darbuotojui – kai meistras pažymi kaip išspręstą ===
app.post('/notify-resolved', async (req, res) => {
  const { claimId, customerEmail, customerName, productName } = req.body;

  try {
    // 1. Laiškas klientui
    const customerSubject = `✅ Jūsų pretenzija #${claimId} išspręsta`;
    const customerText = `Sveiki, ${customerName},\n\nJūsų pretenzija #${claimId} (produktas: ${productName}) yra išspręsta.\nDėkojame, kad pasirinkote Rubineta.\n\nPagarbiai,\nRubineta kokybės komanda\ninfo@rubineta.lt\n+370 612 34567`;

    await sendEmail(customerEmail, customerSubject, customerText);

    // 2. Laiškas kokybės darbuotojui
    const qualitySubject = `🔧 Meistras išsprendė pretenziją #${claimId}`;
    const qualityText = `Meistras pranešė, kad pretenzija #${claimId} (produktas: ${productName}) yra išspręsta.\nPrašome patikrinti ir uždaryti užduotį sistemoje.\n\nPeržiūrėti: https://pretenzijos-sistema.onrender.com/claim-view.html?id=${claimId}`;

    await sendEmail(process.env.QUALITY_EMAIL, qualitySubject, qualityText);

    res.json({ success: true });
  } catch (error) {
    console.error('Klaida siunčiant pranešimą:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// === 7. Laiškas klientui – būsenos keitimas ===
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

  try {
    await sendEmail(customerEmail, template.subject, template.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Klaida siunčiant klientui:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Palaikomos šalys
app.get('/api/countries', (req, res) => {
  res.json(['LT', 'LV', 'EE', 'PL', 'UA', 'BY']);
});

// Miestų/gyvenviečių sąrašas per Geonames
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
      const url =
        `http://api.geonames.org/searchJSON?country=${country}` +
        `&featureClass=P&maxRows=1000&username=${encodeURIComponent(process.env.GEONAMES_USERNAME)}`;

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
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Serveris veikia ant http://0.0.0.0:${PORT}`);
  console.log(`✅ Naudojamas Mailjet email servisas`);
});
