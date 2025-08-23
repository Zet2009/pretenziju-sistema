// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

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
    const { email, claimId, language = 'lt' } = req.body;

    const templates = {
        lt: {
            subject: `Pretenzija #${claimId} priimta`,
            body: `Sveiki,\n\nJūsų pretenzija #${claimId} sėkmingai priimta.\nAtsakysime per 24 valandas.\nGalite stebėti būseną: https://pretenzijos-sistema.onrender.com/claim-view.html?id=${claimId}\n\nPagarbiai,\nRubineta kokybės komanda`
        },
        en: {
            subject: `Claim #${claimId} received`,
            body: `Hello,\n\nYour claim #${claimId} has been received.\nWe will respond within 24 hours.\nTrack status: https://pretenzijos-sistema.onrender.com/claim-view.html?id=${claimId}\n\nBest regards,\nRubineta Quality Team`
        },
        ru: {
            subject: `Претензия №${claimId} получена`,
            body: `Здравствуйте,\n\nВаша претензия №${claimId} получена.\nМы ответим в течение 24 часов.\nСледить за статусом: https://pretenzijos-sistema.onrender.com/claim-view.html?id=${claimId}\n\nС уважением,\nКоманда качества Rubineta`
        },
        lv: {
            subject: `Pretendēšana Nr. ${claimId} saņemta`,
            body: `Sveiki,\n\nJūsu pretendēšana Nr. ${claimId} saņemta.\nAtbildēsim 24 stundu laikā.\nSeko statusam: https://pretenzijos-sistema.onrender.com/claim-view.html?id=${claimId}\n\nAr cieņu,\nRubineta kvalitātes komanda`
        }
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
    const { claimId, partnerEmail, partnerContactPerson, note, attachments = [] } = req.body;

    let body = `Sveiki, ${partnerContactPerson},\n\nJums priskirta pretenzija:\n`;
    body += `- ID: ${claimId}\n`;
    body += `- Rekomendacija: ${note || 'Nėra papildomų pastabų'}\n`;
    body += `Prisegti dokumentai:\n`;

    if (attachments.length > 0) {
        attachments.forEach(att => {
            body += `- ${att.name}: ${att.url}\n`;
        });
    } else {
        body += `- Nėra pridėtų dokumentų\n`;
    }

    body += `\nPrašome išspręsti problemą ir atnaujinti būseną sistemoje.\n\nGeriausios sveikatos,\nRubineta kokybės komanda\ninfo@rubineta.lt\n+370 612 34567`;

    const mailOptions = {
        from: `"Rubineta Pretenzijos" <${process.env.EMAIL_USER}>`,
        to: partnerEmail,
        subject: `Pretenzija ${claimId} – perduota jūsų aptarnavimui`,
        text: body
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'Laiškas išsiųstas meistrui' });
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

// === Paleidžiame serverį ===
app.listen(PORT, () => {
    console.log(`✅ Serveris veikia ant http://localhost:${PORT}`);
});
