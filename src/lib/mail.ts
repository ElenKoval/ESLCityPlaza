import { createAdminClient, emailsForUserIds } from "@/lib/auth-admin";

const SITE_NAME = "ESL on the Plaza";

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://esl-citi-plaza.onrender.com"
  ).replace(/\/$/, "");
}

function fromAddress() {
  return (
    process.env.EMAIL_FROM?.trim() ||
    "ESL on the Plaza <beth.t@example.com>"
  );
}

function parseEmailList(value: string | undefined) {
  return (value || "")
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.includes("@"));
}

async function approvalNotifyEmails() {
  const emails = new Set(parseEmailList(process.env.APPROVAL_NOTIFY_EMAIL));

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
      lastError = (await response.text()).slice(0, 400);
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

export async function sendApprovedWelcomeEmail(to: string, name: string) {
  const loginUrl = `${siteUrl()}/login`;
  const first = name.trim().split(/\s+/)[0] || "there";

  return sendResendEmail({
    to: [to],
    subject: `Welcome to ${SITE_NAME}! Your membership has been approved.`,
    html: `
        <p>Hi ${escapeHtml(first)},</p>
        <p>Welcome to ${SITE_NAME}! Your membership has been approved.</p>
        <p><a href="${loginUrl}">Log in</a></p>
      `,
    text: `Hi ${first},\n\nWelcome to ${SITE_NAME}! Your membership has been approved.\n\nLog in: ${loginUrl}\n`,
  });
}

export async function sendNewApplicationNotice(input: {
  name: string;
  email: string;
  requestedRole: string;
}) {
  try {
    const to = await approvalNotifyEmails();
    console.info("[mail] application notice recipients", to);
    const approvalsUrl = `${siteUrl()}/tech`;
    const role =
      input.requestedRole === "teacher" ? "Teacher" : "Student";

    const result = await sendResendEmail({
      to,
      subject: `New ${SITE_NAME} application: ${input.name}`,
      html: `
        <p>Someone applied to join ${SITE_NAME}.</p>
        <p>
          <strong>Name:</strong> ${escapeHtml(input.name)}<br />
          <strong>Email:</strong> ${escapeHtml(input.email)}<br />
          <strong>Role:</strong> ${escapeHtml(role)}
        </p>
        <p>They still need to confirm their email before you can approve them.</p>
        <p><a href="${approvalsUrl}">Open Approvals</a></p>
      `,
      text: `Someone applied to join ${SITE_NAME}.\n\nName: ${input.name}\nEmail: ${input.email}\nRole: ${role}\n\nThey still need to confirm their email before you can approve them.\n\nApprovals: ${approvalsUrl}\n`,
    });
    if (!result.sent) {
      console.error("[mail] application notice failed", result.error);
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mail failed";
    console.error("[mail] application notice", message);
    return { sent: false as const, error: message };
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
