const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// Leidžiamos kilmės CORS
const allowedOrigins = [
  'https://pretenzijos-sistema.onrender.com',
  'http://localhost:3000', // lokaliam plėtimui
  'http://localhost:8000' // papildomas lokalus portas
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
app.use(express.static('public'));

// Nodemailer transporter
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

// 1. Laiškas klientui – patvirtinimas
app.post('/send-confirmation', async (req, res) => {
  const { email, claimId, language = 'lt', isRegistered = false } = req.body;

  const templates = {
    lt: {
      subject: `Pretenzija #${claimId} priimta`,
      body: isRegistered
        ? `Sveiki,\n\nJūsų pretenzija #${claimId} sėkmingai priimta.\nAtsakysime per 24 valandas.\nPrisijunkite į savo kabinetą, kad stebėtumėte būseną:\nhttps://pretenzijos-sistema.onrender.com`
        : `Sveiki,\n\nJūsų pretenzija #${claimId} sėkmingai priimta.\nAtsakysime per 24 valandas.\nInformuojame, kad galite pasiteirauti apie būseną pateikdami šį ID: ${claimId}`
    },
    en: {
      subject: `Claim #${claimId} accepted`,
      body: isRegistered
        ? `Hello,\n\nYour claim #${claimId} has been successfully accepted.\nWe will respond within 24 hours.\nLog in to your account to track status:\nhttps://pretenzijos-sistema.onrender.com`
        : `Hello,\n\nYour claim #${claimId} has been successfully accepted.\nWe will respond within 24 hours.\nYou can check the status by providing this ID: ${claimId}`
    },
    ru: {
      subject: `Претензия #${claimId} принята`,
      body: isRegistered
        ? `Здравствуйте,\n\nВаша претензия #${claimId} успешно принята.\nМы ответим в течение 24 часов.\nВойдите в свой кабинет для отслеживания статуса:\nhttps://pretenzijos-sistema.onrender.com`
        : `Здравствуйте,\n\nВаша претензия #${claimId} успешно принята.\nМы ответим в течение 24 часов.\nВы можете узнать статус, указав этот ID: ${claimId}`
    },
    lv: {
      subject: `Sūdzība #${claimId} pieņemta`,
      body: isRegistered
        ? `Sveiki,\n\nJūsu sūdzība #${claimId} ir veiksmīgi pieņemta.\nMēs atbildēsim 24 stundu laikā.\nPieslēdzieties savam kontam, lai sekotu statusam:\nhttps://pretenzijos-sistema.onrender.com`
        : `Sveiki,\n\nJūsu sūdzība #${claimId} ir veiksmīgi pieņemta.\nMēs atbildēsim 24 stundu laikā.\nJūs varat sekot statusam ar šo ID: ${claimId}`
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

// ... (toliau eina kiti endpointai ir funkcijos, kaip ir dabartiniame faile)

app.get('/', (req, res) => {
  res.send('✅ Pretenzijų sistemos serveris veikia sėkmingai');
});

// === Paleidžiame serverį ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Serveris veikia ant http://0.0.0.0:${PORT}`);
});

