// Shared branded HTML email layout for RVParkAds.com — matches the site's
// current bold light-mode redesign (gradient blue->teal header band, navy
// text, orange accent, Poppins/Inter fonts) rather than the older flat-navy
// version. Table-based with fully inline styles for Gmail/Outlook/Apple
// Mail compatibility — gradients degrade gracefully to the solid
// bgcolor fallback in clients that strip them (Outlook desktop).
const COLORS = {
  white: '#ffffff',
  paper: '#f5f8fa',
  paperDim: '#eef2f5',
  border: '#e2e8ec',
  navy: '#1b2a3a',
  dim: '#5b6b78',
  blue: '#2ea8d8',
  blueDark: '#1f86b0',
  teal: '#1f9d7c',
  orange: '#e08a2e',
};

const FONT_DISPLAY = "'Poppins', Arial, Helvetica, sans-serif";
const FONT_BODY = "Arial, Helvetica, sans-serif";

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function detailRow(label, value, isLast) {
  const border = isLast ? '' : `border-bottom:1px solid ${COLORS.border};`;
  return `
    <tr>
      <td style="padding:12px 18px; ${border} font-family:${FONT_BODY}; font-size:11px; letter-spacing:0.5px; text-transform:uppercase; color:${COLORS.dim}; white-space:nowrap;">${escapeHtml(label)}</td>
      <td style="padding:12px 18px; ${border} font-family:${FONT_BODY}; font-size:14px; color:${COLORS.navy}; text-align:right; font-weight:600;">${escapeHtml(value || '—')}</td>
    </tr>`;
}

function detailsTable(rows) {
  const filtered = rows.filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (!filtered.length) return '';
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px; background-color:${COLORS.paper}; border:1px solid ${COLORS.border}; border-radius:12px;">
      ${filtered.map(([label, value], i) => detailRow(label, value, i === filtered.length - 1)).join('')}
    </table>`;
}

function sectionTable(heading, rows) {
  const filtered = rows.filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (!filtered.length) return '';
  return `
    <p style="margin:24px 0 8px; font-family:${FONT_DISPLAY}; font-weight:700; font-size:13px; letter-spacing:0.04em; text-transform:uppercase; color:${COLORS.blueDark};">${escapeHtml(heading)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.paper}; border:1px solid ${COLORS.border}; border-radius:12px;">
      ${filtered.map(([label, value], i) => detailRow(label, value, i === filtered.length - 1)).join('')}
    </table>`;
}

function photoGrid(photos) {
  if (!photos || !photos.length) return '';
  const cells = photos.slice(0, 9).map((url) => `
    <td style="padding:4px;">
      <a href="${url}"><img src="${url}" width="120" height="120" style="width:120px; height:120px; object-fit:cover; border-radius:10px; border:1px solid ${COLORS.border}; display:block;" alt="Park photo"></a>
    </td>`).join('');
  return `
    <p style="margin:24px 0 8px; font-family:${FONT_DISPLAY}; font-weight:700; font-size:13px; letter-spacing:0.04em; text-transform:uppercase; color:${COLORS.blueDark};">Photos (${photos.length})</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`;
}

/**
 * @param {object} opts
 * @param {string} opts.eyebrow - small orange label above the title
 * @param {string} opts.title - main heading
 * @param {string} opts.intro - intro paragraph (plain text, will be escaped)
 * @param {Array<[string,string]>} [opts.details] - flat [label,value] rows (single unlabeled section)
 * @param {Array<{heading:string, rows:Array<[string,string]>}>} [opts.sections] - multiple labeled sections, for longer/denser emails
 * @param {string[]} [opts.photos] - photo URLs, rendered as a thumbnail grid
 * @param {{label:string, href:string}} [opts.cta] - optional button
 * @param {string} [opts.closing] - optional closing paragraph
 */
export function renderEmail({ eyebrow, title, intro, details, sections, photos, cta, closing }) {
  const sectionsHtml = sections
    ? sections.map((s) => sectionTable(s.heading, s.rows)).join('')
    : (details ? detailsTable(details) : '');
  const photosHtml = photoGrid(photos);

  const ctaHtml = cta
    ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 0;">
      <tr><td style="background-color:${COLORS.blue}; border-radius:999px;">
        <a href="${cta.href}" style="display:inline-block; padding:14px 30px; font-family:${FONT_BODY}; font-weight:bold; font-size:14px; color:${COLORS.white}; text-decoration:none;">${escapeHtml(cta.label)}</a>
      </td></tr>
    </table>`
    : '';
  const closingHtml = closing
    ? `<p style="margin:24px 0 0; font-family:${FONT_BODY}; font-size:14px; line-height:1.7; color:${COLORS.dim};">${escapeHtml(closing)}</p>`
    : '';

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:${COLORS.paper};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.paper};">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:${COLORS.white}; border-radius:18px; overflow:hidden; border:1px solid ${COLORS.border};">

        <tr><td style="padding:32px; background-color:${COLORS.blue}; background-image:linear-gradient(120deg, ${COLORS.blue}, ${COLORS.teal}); text-align:center;">
          <p style="margin:0; font-family:${FONT_DISPLAY}; font-weight:800; font-size:20px; color:${COLORS.white};">RVPark<span style="color:#0a2530;">Ads</span>.com</p>
        </td></tr>

        <tr><td style="padding:36px 32px 32px;">
          <p style="margin:0 0 8px; font-family:${FONT_BODY}; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:${COLORS.orange}; font-weight:bold;">${escapeHtml(eyebrow)}</p>
          <h1 style="margin:0 0 16px; font-family:${FONT_DISPLAY}; font-size:24px; font-weight:800; color:${COLORS.navy}; line-height:1.3;">${escapeHtml(title)}</h1>
          <p style="margin:0; font-family:${FONT_BODY}; font-size:15px; line-height:1.65; color:${COLORS.dim};">${escapeHtml(intro)}</p>

          ${sectionsHtml}
          ${photosHtml}
          ${ctaHtml}
          ${closingHtml}
        </td></tr>

        <tr><td style="padding:20px 32px; background-color:${COLORS.paperDim}; text-align:center; border-top:1px solid ${COLORS.border};">
          <p style="margin:0; font-family:${FONT_BODY}; font-size:12px; color:${COLORS.dim};">RVParkAds.com — Advertise your RV park to thousands of qualified buyers.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
