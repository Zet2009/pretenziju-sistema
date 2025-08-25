// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// Naudoti PORT iš aplinkos arba 3000 (vietiniam testavimui)
const PORT = process.env.PORT || 3000;

// Ištaisyta CORS konfigūracija
const allowedOrigins = [
  'https://pretenzijos-sistema.onrender.com',
  'http://localhost:3000', // lokaliam plėtimui
  'http://localhost:8000'  // papildomas lokalus portas
];

app.use(cors({
  origin: function (origin, callback) {
    // Leidžia užklausas be kilmės (pvz., Postman, curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'CORS politika neleidžia šios kilmės';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public')); // ✅ Čia – kad rodytų HTML failus

// Nodemailer transporter (Gmail)
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true for 465, false for 587
    auth: {
        user: process.env.EMAIL_USER, // pvz., rubinetaclaim@gmail.com
        pass: process.env.EMAIL_PASS  // tavo 16 simbolių App Password
    }
});

// Patikriname, ar prisijungimas prie Gmail veikia
transporter.verify((error, success) => {
    if (error) {
        console.error('SMTP klaida:', error);
    } else {
        console.log('✅ SMTP serveris pasiruošęs siųsti laiškus');
    }
});

// === 1. Laiškas klientui – patvirtinimas, kad pretenzija priimta ===
app.post('/send-confirmation', async (req, res) => {
    const { email, claimId, language = 'lt', isRegistered = false } = req.body;

    const templates = {
        lt: {
             subject: `Pretenzija #${claimId} priimta`,
            body: isRegistered
                ? `Sveiki,\n\nJūsų pretenzija #${claimId} sėkmingai priimta.\nAtsakysime per 24 valandas.\nPrisijunkite į savo kabinetą, kad stebėtumėte būseną:\nhttps://pretenzijos-sistema.onrender.com`
                : `Sveiki,\n\nJūsų pretenzija #${claimId} sėkmingai priimta.\nAtsakysime per 24 valandas.\nInformuojame, kad galite pasiteirauti apie būseną pateikdami šį ID: ${claimId}\n\nLinkime geros dienos!`
        },
        en: {
             subject: `Claim #${claimId} accepted`,
            body: isRegistered
                ? `Hello,\n\nYour claim #${claimId} has been successfully accepted.\nWe will respond within 24 hours.\nLog in to your account to track the status:\nhttps://pretenzijos-sistema.onrender.com`
                : `Hello,\n\nYour claim #${claimId} has been successfully accepted.\nWe will respond within 24 hours.\nPlease provide this ID when inquiring about status: ${claimId}\n\nHave a nice day!`
        },
        ru: {
             subject: `Претензия #${claimId} принята`,
            body: isRegistered
                ? `Здравствуйте,\n\nВаша претензия #${claimId} успешно принята.\nМы ответим в течение 24 часов.\nВойдите в свой кабинет, чтобы отслеживать статус:\nhttps://pretenzijos-sistema.onrender.com`
                : `Здравствуйте,\n\nВаша претензия #${claimId} успешно принята.\nМы ответим в течение 24 часов.\nДля запроса о статусе, пожалуйста, предоставьте этот ID: ${claimId}\n\nХорошего дня!`
        },
        lv: {
             subject: `Sūdzība #${claimId} pieņemta`,
            body: isRegistered
                ? `Sveiki,\n\nJūsu sūdzība #${claimId} ir veiksmīgi pieņemta.\nMēs atbildēsim 24 stundu laikā.\nPiesakieties savā kontā, lai sekotu līdzi statusam:\nhttps://pretenzijos-sistema.onrender.com`
                : `Sveiki,\n\nJūsu sūdzība #${claimId} ir veiksmīgi pieņemta.\nMēs atbildēsim 24 stundu laikā.\nLūdzam norādīt šo ID, pajautājot par statusu: ${claimId}\n\nJauku dienu!`
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

// === 2. Laiškas meistrui (priskiriant pretenziją) ===
app.post('/send-to-partner', async (req, res) => {
    const { claimId, partnerEmail, partnerContactPerson, note, attachments = [], claimLink } = req.body;

    let body = `Sveiki, ${partnerContactPerson},\n\nJums priskirta pretenzija:\n`;
    body += `- ID: ${claimId}\n`;
    body += `- Rekomendacija: ${note || 'Nėra papildomų pastabų'}\n`;

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

// === 3. Laiškas kokybės darbuotojui – kai ateina nauja pretenzija ===
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

// === 4. Laiškas klientui ir kokybės darbuotojui – kai meistras pažymi kaip išspręstą ===
app.post('/notify-resolved', async (req, res) => {
    const { claimId, customerEmail, customerName, productName } = req.body;

    // 1. Laiškas klientui
    const customerMail = {
        from: `"Rubineta Pretenzijos" <${process.env.EMAIL_USER}>`,
        to: customerEmail,
        subject: `✅ Jūsų pretenzija #${claimId} išspręsta`,
        text: `Sveiki, ${customerName},\n\nJūsų pretenzija #${claimId} (produktas: ${productName}) yra išspręsta.\nDėkojame, kad pasirinkote Rubineta.\n\nPagarbiai,\nRubineta kokybės komanda`
    };

    // 2. Laiškas kokybės darbuotojui
    const qualityMail = {
        from: `"Meistras" <${process.env.EMAIL_USER}>`,
        to: process.env.QUALITY_EMAIL,
        subject: `🔧 Meistras išsprendė pretenziją #${claimId}`,
        text: `Meistras pranešė, kad pretenzija #${claimId} (produktas: ${productName}) yra išspręsta.\nPrašome patikrinti ir uždaryti užduotį sistemoje.\n\nPeržiūrėti: https://pretenzijos-sistema.onrender.com/admin.html`
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

// Papildomas GET maršrutas pagrindiniam puslapiui
app.get('/', (req, res) => {
    res.send('✅ Pretenzijų sistemos serveris veikia sėkmingai');
});

// === Paleidžiame serverį ===
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Serveris veikia ant http://0.0.0.0:${PORT}`);
});

