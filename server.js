// سيرفر تجريبي: يستقبل SMS من تطبيق SMS Gateway API ويعرضها في صفحة محمية.
// المتغيرات (Environment Variables) اللي تحطها في Render:
//   WEBHOOK_KEY = مفتاح سري تختاره (نفس القيمة تحطها في خانة X-API-Key في التطبيق)
//   ADMIN_PASS  = كلمة سر صفحة عرض الرسائل
//   ADMIN_USER  = (اختياري) اسم المستخدم، الافتراضي: admin

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '100kb' }));

const WEBHOOK_KEY = process.env.WEBHOOK_KEY;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;
const DATA_FILE = path.join(__dirname, 'messages.json');

function loadMessages() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveMessages(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list));
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function formatTime(ts) {
  const n = Number(ts);
  if (!n) return '';
  const ms = n < 1e12 ? n * 1000 : n; // ثواني أو ميلي ثانية
  return new Date(ms).toLocaleString('fr-DZ', { timeZone: 'Africa/Algiers' });
}

// ---- استقبال الرسائل من التطبيق ----
app.post('/sms', (req, res) => {
  if (!WEBHOOK_KEY || req.get('x-api-key') !== WEBHOOK_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const body = req.body || {};
  if (body.type === 'incoming_sms') {
    const list = loadMessages();
    list.unshift({
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      sender: String(body.sender ?? '').slice(0, 50),
      message: String(body.message ?? '').slice(0, 2000),
      timestamp: body.timestamp ?? null,
      receivedAt: Date.now()
    });
    saveMessages(list.slice(0, 5000));
    console.log('SMS من', body.sender);
  }

  // التطبيق يحتاج HTTP 200 بجسم فارغ = بلا رد تلقائي
  res.status(200).end();
});

// ---- صفحة عرض الرسائل (محمية بكلمة سر) ----
function basicAuth(req, res, next) {
  if (!ADMIN_PASS) return res.status(503).send('ADMIN_PASS غير محدد في الإعدادات');
  const header = req.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user, ...rest] = Buffer.from(encoded, 'base64').toString().split(':');
    if (user === ADMIN_USER && rest.join(':') === ADMIN_PASS) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="SMS Inbox"');
  res.status(401).send('Login required');
}

app.get('/messages', basicAuth, (req, res) => {
  const rows = loadMessages()
    .map((m) => `<tr><td>${escapeHtml(formatTime(m.timestamp || m.receivedAt))}</td><td dir="ltr">${escapeHtml(m.sender)}</td><td>${escapeHtml(m.message)}</td></tr>`)
    .join('');
  res.send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="15">
<title>الرسائل الواردة</title>
<style>
body{font-family:system-ui,sans-serif;margin:16px;background:#f7f8fc;color:#222}
table{width:100%;border-collapse:collapse;background:#fff}
th,td{padding:10px;border-bottom:1px solid #e3e6f0;text-align:right;vertical-align:top}
th{background:#4e73df;color:#fff}
</style></head><body>
<h2>الرسائل الواردة</h2>
<table><tr><th>الوقت</th><th>المرسل</th><th>الرسالة</th></tr>${rows || '<tr><td colspan="3">ما وصلت حتى رسالة بعد</td></tr>'}</table>
</body></html>`);
});

app.get('/', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
