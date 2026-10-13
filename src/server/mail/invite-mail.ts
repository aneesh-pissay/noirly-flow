import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { DEFAULT_THEME_ID, getTheme, NOIRLY_THEMES } from "@noirly-dev/ui/themes";

/**
 * SMTP delivery for workspace invites — the same setup (and env names) as
 * Noirly Identity and the portfolio's contact form, so one set of credentials
 * works across them (see .env.example).
 */

export type InviteEmail = {
  to: string;
  workspaceName: string;
  inviterName: string;
  role: string;
  url: string;
  expiresAt: Date;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

function readConfig(): SmtpConfig | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) return null;
  return {
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE === "true",
    user: SMTP_USER,
    pass: SMTP_PASS,
    from: EMAIL_FROM,
  };
}

let transporter: Transporter | null = null;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const FONT_DISPLAY = `'Fraunces',Georgia,'Times New Roman',serif`;
const FONT_SANS = `'Hanken Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const FONT_MONO = `'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Hanken+Grotesk:wght@400;600&family=JetBrains+Mono:wght@600&display=swap";

function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${alpha})`;
}

/** The default theme in light mode — reads cleanly in any inbox. */
function palette() {
  const { bg, surface, text, accent, accentInk } = (getTheme(DEFAULT_THEME_ID) ?? NOIRLY_THEMES[0]!).light;
  return {
    bg,
    surface,
    text,
    accent,
    accentInk,
    secondary: rgba(text, 0.66),
    muted: rgba(text, 0.58),
    hairline: rgba(text, 0.1),
    hairlineStrong: rgba(text, 0.18),
  };
}

function article(role: string) {
  return /^[aeiou]/i.test(role) ? "an" : "a";
}

/**
 * Email clients ignore <style> blocks and modern layout, so this is
 * table-based with inline styles throughout.
 */
export function renderInvite(invite: InviteEmail) {
  const expires = invite.expiresAt.toLocaleDateString("en-GB", { dateStyle: "medium" });
  const subject = `${invite.inviterName} invited you to ${invite.workspaceName} on Noirly Flow`;
  const text = [
    `${invite.inviterName} invited you to join ${invite.workspaceName} on Noirly Flow as ${article(invite.role)} ${invite.role}.`,
    "",
    `Accept the invitation: ${invite.url}`,
    "",
    `Sign in with ${invite.to} to accept. The link works once and expires on ${expires}.`,
    "If you weren't expecting this, you can ignore this email.",
    "",
  ].join("\n");

  const c = palette();
  const label = `font-family:${FONT_MONO};font-size:11px;font-weight:600;letter-spacing:2.4px;text-transform:uppercase;color:${c.muted}`;
  const eyebrow = (value: string) => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="28" style="border-top:1px solid ${c.hairlineStrong};font-size:0;line-height:0">&nbsp;</td>
      <td style="padding-left:10px;${label}">${value}</td>
    </tr></table>`;

  const workspace = escapeHtml(invite.workspaceName);
  const inviter = escapeHtml(invite.inviterName);
  const role = escapeHtml(invite.role);
  const url = escapeHtml(invite.url);

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<link href="${FONTS_HREF}" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:${c.bg}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${inviter} invited you to ${workspace} on Noirly Flow</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.bg}">
    <tr><td align="center" style="padding:40px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

        <tr><td style="padding:0 4px 20px">${eyebrow("Noirly Flow &middot; Invitation")}</td></tr>

        <tr><td style="background:${c.surface};border:1px solid ${c.hairline};border-radius:26px;padding:36px 32px">

          <div style="font-family:${FONT_DISPLAY};font-size:32px;font-weight:600;line-height:1.15;letter-spacing:-0.8px;color:${c.text}">
            Join ${workspace}<span style="color:${c.accent}">.</span>
          </div>

          <div style="margin-top:16px;font-family:${FONT_SANS};font-size:16px;line-height:1.7;color:${c.secondary}">
            <strong style="color:${c.text}">${inviter}</strong> invited you to work together on Noirly Flow as ${article(invite.role)} <strong style="color:${c.text}">${role}</strong>.
          </div>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px"><tr>
            <td style="background:${c.accent};border-radius:9999px">
              <a href="${url}" style="display:inline-block;padding:14px 24px;font-family:${FONT_MONO};font-size:11px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:${c.accentInk};text-decoration:none">Accept invitation &rarr;</a>
            </td>
          </tr></table>

          <div style="margin-top:24px;font-family:${FONT_SANS};font-size:13px;line-height:1.6;color:${c.muted}">
            Or paste this link into your browser:<br>
            <a href="${url}" style="color:${c.secondary};word-break:break-all">${url}</a>
          </div>

        </td></tr>

        <tr><td style="padding:20px 4px 0;font-family:${FONT_SANS};font-size:12px;line-height:1.6;color:${c.muted}">
          Sign in with ${escapeHtml(invite.to)} to accept. The link works once and expires on ${escapeHtml(expires)}.
          If you weren't expecting this, you can ignore this email.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject, text, html };
}

/**
 * Emails an invite. Without SMTP configured, development logs the link and
 * reports success so the flow can be exercised locally; production refuses,
 * so a missing setting never claims an invite went out when it didn't.
 */
export async function sendInviteEmail(invite: InviteEmail): Promise<void> {
  // Writes each email to a folder instead of sending it — end-to-end tests read
  // the link from here, and it's a handy local preview (open the .html).
  const outbox = process.env.INVITE_EMAIL_OUTBOX;
  if (outbox) {
    const { subject, text, html } = renderInvite(invite);
    const base = path.join(outbox, `${Date.now()}-${invite.to.replace(/[^a-z0-9@.]+/gi, "_")}`);
    await mkdir(outbox, { recursive: true });
    await Promise.all([
      writeFile(`${base}.json`, JSON.stringify({ to: invite.to, subject, text, url: invite.url }, null, 2)),
      writeFile(`${base}.html`, html),
    ]);
    return;
  }

  const config = readConfig();
  if (!config) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[invite] SMTP not configured — invite for ${invite.to}: ${invite.url}`);
      return;
    }
    throw new Error(
      "Invite email is not configured: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and EMAIL_FROM.",
    );
  }

  transporter ??= nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });

  const { subject, text, html } = renderInvite(invite);
  await transporter.sendMail({ from: config.from, to: invite.to, subject, text, html });
}
