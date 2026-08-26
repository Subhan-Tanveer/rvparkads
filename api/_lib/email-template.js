// Shared branded HTML email layout for RVParkAds.com — light brokerage
// theme matching the site (white background, navy text, sky-blue accent),
// mirroring the dark-themed layout used by rvparksuccess.com's
// api/_lib/email-template.js but restyled for this brand. Table-based with
// fully inline styles for Gmail/Outlook/Apple Mail compatibility.
const COLORS = {
  white: '#ffffff',
  paper: '#f5f8fa',
  border: '#e2e8ec',
  navy: '#1b2a3a',
  dim: '#5b6b78',
  blue: '#2ea8d8',
  blueDark: '#1f86b0',
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function detailRow(label, value, isLast) {
  const border = isLast ? '' : `border-bottom:1px solid ${COLORS.border};`;
  return `
    <tr>
      <td style="padding:14px 20px; ${border} font-family:Arial,Helvetica,sans-serif; font-size:11px; letter-spacing:0.5px; text-transform:uppercase; color:${COLORS.dim};">${escapeHtml(label)}</td>
      <td style="padding:14px 20px; ${border} font-family:Arial,Helvetica,sans-serif; font-size:14px; color:${COLORS.navy}; text-align:right;">${escapeHtml(value || '—')}</td>
    </tr>`;
}

/**
 * @param {object} opts
 * @param {string} opts.eyebrow - small blue label above the title
 * @param {string} opts.title - main heading
 * @param {string} opts.intro - intro paragraph (plain text, will be escaped)
 * @param {Array<[string,string]>} opts.details - [label, value] rows
 * @param {{label:string, href:string}} [opts.cta] - optional button
 * @param {string} [opts.closing] - optional closing paragraph below the details card
 */
export function renderEmail({ eyebrow, title, intro, details = [], cta, closing }) {
  const rows = details.map(([label, value], i) => detailRow(label, value, i === details.length - 1)).join('');
  const ctaHtml = cta
    ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 0;">
      <tr><td style="background-color:${COLORS.blue}; border-radius:999px;">
        <a href="${cta.href}" style="display:inline-block; padding:14px 30px; font-family:Arial,Helvetica,sans-serif; font-weight:bold; font-size:14px; color:${COLORS.white}; text-decoration:none;">${escapeHtml(cta.label)}</a>
      </td></tr>
    </table>`
    : '';
  const closingHtml = closing
    ? `<p style="margin:24px 0 0; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.7; color:${COLORS.dim};">${escapeHtml(closing)}</p>`
    : '';

  return `<!doctype html>
<html>
<body style="margin:0; padding:0; background-color:${COLORS.paper};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.paper};">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:${COLORS.white}; border-radius:16px; overflow:hidden; border:1px solid ${COLORS.border};">

        <tr><td style="padding:28px 32px; background-color:${COLORS.navy}; text-align:center;">
          <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-weight:bold; font-size:18px; color:${COLORS.white};">RVPark<span style="color:#6fd3f5;">Ads</span>.com</p>
        </td></tr>

        <tr><td style="padding:36px 32px 32px;">
          <p style="margin:0 0 8px; font-family:Arial,Helvetica,sans-serif; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:${COLORS.blueDark}; font-weight:bold;">${escapeHtml(eyebrow)}</p>
          <h1 style="margin:0 0 16px; font-family:Arial,Helvetica,sans-serif; font-size:23px; font-weight:800; color:${COLORS.navy}; line-height:1.35;">${escapeHtml(title)}</h1>
          <p style="margin:0 0 24px; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:1.65; color:${COLORS.dim};">${escapeHtml(intro)}</p>

          ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.paper}; border:1px solid ${COLORS.border}; border-radius:12px;">${rows}</table>` : ''}

          ${ctaHtml}
          ${closingHtml}
        </td></tr>

        <tr><td style="padding:20px 32px; background-color:${COLORS.paper}; text-align:center; border-top:1px solid ${COLORS.border};">
          <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:12px; color:${COLORS.dim};">RVParkAds.com — Advertise your RV park to thousands of qualified buyers.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
