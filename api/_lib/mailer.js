// Minimal Gmail SMTP sender — same pattern and same GMAIL_USER/
// GMAIL_APP_PASSWORD (marie@rvparksales.com) as rvparksuccess.com's
// api/_lib/mailer.js, copied into this separate Vercel project since it
// can't import across projects.
import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  return transporter;
}

export async function sendEmail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) throw new Error('Email is not configured (GMAIL_USER/GMAIL_APP_PASSWORD missing)');
  return t.sendMail({
    from: `RVParkSelect.com <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ''),
  });
}
