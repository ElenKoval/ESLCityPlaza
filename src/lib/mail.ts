import nodemailer from "nodemailer";
import { createAdminClient, emailsForUserIds } from "@/lib/auth-admin";
import { publicSiteUrl } from "@/lib/site-url";

const SITE_NAME = "ESL on the Plaza";
const TECH_NOTIFY_EMAIL = "plazaenglishgroup@gmail.com";
const RESEND_TEST_FROM = "ESL on the Plaza <beth.t@example.com>";
const PUBLIC_MAIL_HOSTS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

function siteUrl() {
  return publicSiteUrl();
}

function emailHost(value: string) {
  const boxed = value.match(/<([^>]+)>/);
  const email = (boxed?.[1] || value).trim().toLowerCase();
  return email.split("@")[1] || "";
}

function fromAddress() {
  const raw = process.env.EMAIL_FROM?.trim();
  if (!raw) return RESEND_TEST_FROM;
  const host = emailHost(raw);
  if (!host || PUBLIC_MAIL_HOSTS.has(host)) return RESEND_TEST_FROM;
  return raw;
}

export function friendlyMailError(raw: string | undefined) {
  const text = raw || "Email was not sent";
  if (/domain is not verified|not verified/i.test(text)) {
    return "Resend rejected the sender. Do not put Gmail in EMAIL_FROM — leave it empty, or use a domain verified in Resend.";
  }
  if (/only send testing emails|you can only send/i.test(text)) {
    return "Resend test mode can only send to the email that owns the Resend account.";
  }
  return text.slice(0, 280);
}

function parseEmailList(value: string | undefined) {
  return (value || "")
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.includes("@"));
}

async function approvalNotifyEmails() {
  const emails = new Set(parseEmailList(process.env.APPROVAL_NOTIFY_EMAIL));
  emails.add(TECH_NOTIFY_EMAIL);

  const admin = createAdminClient();
  if (admin) {
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "tech")
      .eq("status", "approved");
    if (error) {
      console.error("[mail] tech profiles", error.message);
    }
    const ids = (data ?? []).map((row) => row.id);
    const map = await emailsForUserIds(ids);
    for (const email of map.values()) emails.add(email.toLowerCase());
  }

  return [...emails];
}

async function sendResendEmail(input: {
  to: string[];
  subject: string;
  html: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { sent: false as const, error: "RESEND_API_KEY is not set" };
  }
  if (input.to.length === 0) {
    return {
      sent: false as const,
      error: "No Tech email found (needs SUPABASE_SERVICE_ROLE_KEY)",
    };
  }

  let lastError = "";
  let sentCount = 0;

  for (const to of input.to) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      try {
        const parsed = JSON.parse(body) as { message?: string };
        lastError = parsed.message || body.slice(0, 400);
      } catch {
        lastError = body.slice(0, 400);
      }
      console.error("[mail] Resend rejected", to, lastError);
      continue;
    }
    sentCount += 1;
  }

  if (sentCount === 0) {
    return { sent: false as const, error: lastError || "Resend did not send" };
  }
  return { sent: true as const };
}

async function sendSmtpEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host || !user || !pass) {
    return { sent: false as const, error: "SMTP is not configured" };
  }

  const from =
    process.env.SMTP_FROM?.trim() || `ESL on the Plaza <${user}>`;

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return { sent: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMTP send failed";
    console.error("[mail] SMTP failed", message);
    return { sent: false as const, error: message.slice(0, 280) };
  }
}

export async function getApplicationNoticeStatus() {
  const hasKey = Boolean(process.env.RESEND_API_KEY?.trim());
  const hasServiceRole = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const recipients = await approvalNotifyEmails();
  return {
    hasKey,
    hasServiceRole,
    from: fromAddress(),
    recipients,
    ready: hasKey && recipients.length > 0,
  };
}

export async function sendApprovedWelcomeEmail(to: string, _name: string) {
  const loginUrl = `${siteUrl()}/login`;

  return sendSmtpEmail({
    to,
    subject: "Your ESL on the Plaza account is approved",
    html: `
        <p><strong>Welcome to ESL on the Plaza!</strong></p>
        <p>Your account has been approved.</p>
        <p>You can now log in, sign up for classes, use the community chat, and complete your profile.</p>
        <p><a href="${loginUrl}">Log in</a></p>
      `,
    text: `Welcome to ESL on the Plaza!\n\nYour account has been approved.\n\nYou can now log in, sign up for classes, use the community chat, and complete your profile.\n\nLog in: ${loginUrl}\n`,
  });
}

export async function sendNewApplicationNotice(input: {
  name: string;
  email: string;
  requestedRole: string;
  hometown?: string;
  heardFrom?: string;
}) {
  try {
    const to = await approvalNotifyEmails();
    console.info("[mail] application notice recipients", to);
    const approvalsUrl = `${siteUrl()}/tech`;
    const hometown = input.hometown?.trim() || "";
    const heardFrom = input.heardFrom?.trim() || "";
    const extraHtml = [
      hometown
        ? `<p>From: ${escapeHtml(hometown)}</p>`
        : "",
      heardFrom
        ? `<p>How they heard about us: ${escapeHtml(heardFrom)}</p>`
        : "",
    ]
      .filter(Boolean)
      .join("");
    const extraText = [
      hometown ? `From: ${hometown}` : "",
      heardFrom ? `How they heard about us: ${heardFrom}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const html = `
        <p>${escapeHtml(input.name)} has requested to join ${SITE_NAME}.</p>
        <p>Email: ${escapeHtml(input.email)}</p>
        ${extraHtml}
        <p><a href="${approvalsUrl}">Open Approvals</a></p>
      `;
    const text = [
      `${input.name} has requested to join ${SITE_NAME}.`,
      `Email: ${input.email}`,
      extraText,
      `Approvals: ${approvalsUrl}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await sendResendEmail({
      to,
      subject: "New member request",
      html,
      text: `${text}\n`,
    });
    if (result.sent) return result;

    console.error("[mail] application notice Resend failed, trying SMTP", result.error);
    let smtpSent = 0;
    let smtpError = result.error || "";
    for (const recipient of to) {
      const smtp = await sendSmtpEmail({
        to: recipient,
        subject: "New member request",
        html,
        text: `${text}\n`,
      });
      if (smtp.sent) smtpSent += 1;
      else smtpError = smtp.error || smtpError;
    }
    if (smtpSent > 0) return { sent: true as const };
    return { sent: false as const, error: friendlyMailError(smtpError) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mail failed";
    console.error("[mail] application notice", message);
    return { sent: false as const, error: friendlyMailError(message) };
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
