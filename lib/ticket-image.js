// Draws a ticket as a PNG image (same look as the ticket page): black top with the brand wordmark,
// event name, date, time and venue, a tear line, then the QR code and ticket ID.
// Used as the picture in the WhatsApp booking message. Rendered from SVG with resvg using the
// site font (assets/fonts, SIL Open Font License), so it looks the same on any server.

const path = require('node:path');
const QRCode = require('qrcode');
const { Resvg } = require('@resvg/resvg-js');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const FONT_FILES = ['PlusJakartaSans_500Medium.ttf', 'PlusJakartaSans_700Bold.ttf', 'PlusJakartaSans_800ExtraBold.ttf']
  .map((f) => path.join(FONT_DIR, f));
const FONT = 'Plus Jakarta Sans';
// Brand wordmark drawn as text (same as the website header): "RED" in red, "KARPET" white, "EXHIBITIONS" below.
const BRAND = { red: 'RED', rest: 'KARPET', sub: 'EXHIBITIONS' };

const C = { bg: '#f4f4f5', night: '#141414', brand: '#98020e', ink: '#18181b', muted: '#71717a', line: '#e4e4e7' };

const x = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

// Event times are stored as wall-clock time ("2026-11-13T18:00"): format them as-is.
function when(startsAt) {
  const d = new Date(`${startsAt}Z`);
  if (Number.isNaN(d.getTime())) return { day: String(startsAt || ''), time: '' };
  const o = { timeZone: 'UTC' };
  return {
    day: d.toLocaleDateString('en-IN', { ...o, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-IN', { ...o, hour: 'numeric', minute: '2-digit', hour12: true }),
  };
}

// Word-wrap by an approximate character width (good enough for one font at a known size).
function wrap(text, maxChars, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ` ${w}`;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    // Drop the last whole word so the line ends cleanly ("…with…" rather than "…with L…").
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S+$/, '')}…`;
  }
  return lines.map((l) => (l.length > maxChars + 4 ? `${l.slice(0, maxChars + 2)}…` : l));
}

function qrRects(text, size) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const cell = size / n;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) d += `M${(c * cell).toFixed(2)} ${(r * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
    }
  }
  return d;
}

// t: { code, title, startsAt, venue, attendees: [{ name, ticketType }], bookedBy }
function ticketSvg(t) {
  const W = 1080, cardX = 80, cardW = 920, pad = 64;
  const { day, time } = when(t.startsAt);
  const titleLines = wrap(t.title, 22, 3);
  const venueLines = wrap(t.venue, 40, 2);
  const people = t.attendees?.length || 1;

  // ---- top (black) ----
  let y = 72;                                       // inside the card
  const logoH = 96;
  const badge = `Admits ${people} ${people === 1 ? 'person' : 'people'}`;
  const badgeW = Math.round(badge.length * 15.5 + 56);
  let top = `
    <text x="${pad}" y="${y + 50}" font-family="${FONT}" font-weight="800" font-size="50" letter-spacing="0.5" fill="#ffffff"><tspan fill="#ff4655">${BRAND.red}</tspan>${BRAND.rest}</text>
    <text x="${pad + 2}" y="${y + 84}" font-family="${FONT}" font-weight="700" font-size="19" letter-spacing="11" fill="#ffffff" fill-opacity=".62">${BRAND.sub}</text>
    <rect x="${cardW - pad - badgeW}" y="${y + 22}" width="${badgeW}" height="58" rx="29" fill="#ffffff" fill-opacity=".14"/>
    <text x="${cardW - pad - badgeW / 2}" y="${y + 61}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="26" fill="#ffffff">${x(badge)}</text>`;
  y += logoH + 52;
  for (const line of titleLines) {
    y += 66;
    top += `<text x="${pad}" y="${y}" font-family="${FONT}" font-weight="800" font-size="62" fill="#ffffff">${x(line)}</text>`;
  }
  y += 56;
  const label = (lx, ly, s) => `<text x="${lx}" y="${ly}" font-family="${FONT}" font-weight="700" font-size="22" letter-spacing="3" fill="#ffffff" fill-opacity=".55">${x(s)}</text>`;
  const value = (lx, ly, s) => `<text x="${lx}" y="${ly}" font-family="${FONT}" font-weight="700" font-size="34" fill="#ffffff">${x(s)}</text>`;
  const col2 = pad + (cardW - pad * 2) / 2;
  top += label(pad, y, 'DATE') + label(col2, y, 'TIME');
  y += 46;
  top += value(pad, y, day) + value(col2, y, time);
  if (venueLines.length) {
    y += 58;
    top += label(pad, y, 'VENUE');
    for (const line of venueLines) { y += 46; top += value(pad, y, line); }
  }
  const topH = y + 64;

  // ---- tear line ----
  const tearH = 64;

  // ---- bottom (white): QR, ticket ID, who it's for ----
  const qrSize = 440, qrPad = 34, qrBox = qrSize + qrPad * 2;
  let by = 20;
  const qrX = (cardW - qrBox) / 2;
  let bottom = `
    <rect x="${qrX}" y="${by}" width="${qrBox}" height="${qrBox}" rx="32" fill="#ffffff" stroke="${C.line}" stroke-width="3"/>
    <path transform="translate(${qrX + qrPad} ${by + qrPad})" d="${qrRects(t.code, qrSize)}" fill="#000000"/>`;
  by += qrBox + 58;
  bottom += `<text x="${cardW / 2}" y="${by}" text-anchor="middle" font-family="${FONT}" font-weight="500" font-size="28" fill="${C.muted}">Ticket ID · <tspan font-weight="800" fill="${C.ink}">${x(t.code)}</tspan></text>`;

  const groups = new Map();
  for (const a of t.attendees || []) if (a.ticketType) groups.set(a.ticketType, (groups.get(a.ticketType) || 0) + 1);
  const summary = [...groups].map(([k, n]) => `${n} × ${k}`).join('  ·  ');
  if (summary) {
    by += 64;
    const sw = Math.min(cardW - pad * 2, Math.round(summary.length * 17 + 64));
    bottom += `<rect x="${(cardW - sw) / 2}" y="${by - 40}" width="${sw}" height="58" rx="29" fill="#fcedee"/>
      <text x="${cardW / 2}" y="${by - 2}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="28" fill="${C.brand}">${x(summary)}</text>`;
  }
  if (t.bookedBy) {
    by += 62;
    bottom += `<text x="${cardW / 2}" y="${by}" text-anchor="middle" font-family="${FONT}" font-weight="500" font-size="26" fill="${C.muted}">Booked by <tspan font-weight="700" fill="${C.ink}">${x(wrap(t.bookedBy, 32, 1)[0])}</tspan></text>`;
  }
  by += 50;
  bottom += `<text x="${cardW / 2}" y="${by}" text-anchor="middle" font-family="${FONT}" font-weight="500" font-size="22" fill="${C.muted}">Show this QR code at the entrance</text>`;
  const bottomH = by + 56;

  const cardH = topH + tearH + bottomH;
  const H = cardH + 120;
  const cardY = 60;
  const tearY = topH;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <clipPath id="card"><rect x="0" y="0" width="${cardW}" height="${cardH}" rx="48"/></clipPath>
    <radialGradient id="glow" cx="1" cy="0" r="0.85">
      <stop offset="0" stop-color="${C.brand}" stop-opacity=".85"/>
      <stop offset="1" stop-color="${C.brand}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <g transform="translate(${cardX} ${cardY})">
    <rect x="0" y="12" width="${cardW}" height="${cardH}" rx="48" fill="#000000" fill-opacity=".06"/>
    <g clip-path="url(#card)">
      <rect width="${cardW}" height="${cardH}" fill="#ffffff"/>
      <rect width="${cardW}" height="${topH}" fill="${C.night}"/>
      <rect width="${cardW}" height="${topH}" fill="url(#glow)"/>
      <rect width="${cardW}" height="12" fill="${C.brand}"/>
      ${top}
      <line x1="${pad}" y1="${tearY + tearH / 2}" x2="${cardW - pad}" y2="${tearY + tearH / 2}" stroke="${C.line}" stroke-width="4" stroke-dasharray="14 12"/>
      <circle cx="0" cy="${tearY + tearH / 2}" r="32" fill="${C.bg}"/>
      <circle cx="${cardW}" cy="${tearY + tearH / 2}" r="32" fill="${C.bg}"/>
      <g transform="translate(0 ${tearY + tearH})">${bottom}</g>
    </g>
  </g>
</svg>`;
}

// Small in-memory cache: WhatsApp (and repeat views) fetch the same ticket more than once.
const cache = new Map();
function renderTicketPng(t) {
  const key = JSON.stringify(t);
  if (cache.has(key)) return cache.get(key);
  const png = new Resvg(ticketSvg(t), {
    // Only the bundled font: scanning the system's fonts makes each render take seconds.
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: FONT },
    fitTo: { mode: 'width', value: 1080 },
  }).render().asPng();
  if (cache.size > 200) cache.clear();
  cache.set(key, png);
  return png;
}

module.exports = { renderTicketPng, ticketSvg };
