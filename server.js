const express = require('express');
const fs = require('fs');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Pagalbinės funkcijos
function readData(file) {
  const data = fs.readFileSync(`./data/${file}`);
  return JSON.parse(data);
}

function writeData(file, data) {
  fs.writeFileSync(`./data/${file}`, JSON.stringify(data, null, 2));
}

// === API: Prisijungimas ===
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const users = readData('adminUsers.json');
  const user = users.find(u => u.email === email);

  if (user && bcrypt.compareSync(password, user.passwordHash)) {
    res.json({ success: true, user: { name: user.name, role: user.role, email: user.email } });
  } else {
    res.status(401).json({ success: false, message: 'Neteisingas el. paštas arba slaptažodis' });
  }
});

// === API: Pretenzijos ===
app.get('/api/claims', (req, res) => {
  const claims = readData('claims.json');
  res.json(claims);
});

app.post('/api/claims', (req, res) => {
  const claims = readData('claims.json');
  const claim = { id: 'PRET-' + Date.now(), ...req.body };
  claims.push(claim);
  writeData('claims.json', claims);
  res.status(201).json(claim);
});

app.post('/api/update-status', (req, res) => {
  const { id, status } = req.body;
  const claims = readData('claims.json');
  const claim = claims.find(c => c.id === id);
  if (claim) {
    claim.status = status;
    if (status === 'Nauja' || status === 'Laukia patvirtinimo') {
      claim.assignedPartner = null;
    }
    writeData('claims.json', claims);
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false });
  }
});

// === API: Serviso partneriai ===
app.get('/api/partners', (req, res) => {
  const partners = readData('servicePartners.json');
  res.json(partners);
});

// === Pagrindiniai maršrutai ===
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin-login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveris veikia ant http://0.0.0.0:${PORT}`);
});
