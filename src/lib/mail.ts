const SITE_NAME = "ESL on the Plaza";

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://esl-citi-plaza.onrender.com"
  ).replace(/\/$/, "");
}

export async function sendApprovedWelcomeEmail(to: string, name: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false as const, error: "RESEND_API_KEY is not set" };
  }

  const from =
    process.env.EMAIL_FROM || "ESL on the Plaza <beth.t@example.com>";
  const loginUrl = `${siteUrl()}/login`;
  const first = name.trim().split(/\s+/)[0] || "there";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Welcome to ${SITE_NAME}! Your membership has been approved.`,
      html: `
        <p>Hi ${escapeHtml(first)},</p>
        <p>Welcome to ${SITE_NAME}! Your membership has been approved.</p>
        <p><a href="${loginUrl}">Log in</a></p>
      `,
      text: `Hi ${first},\n\nWelcome to ${SITE_NAME}! Your membership has been approved.\n\nLog in: ${loginUrl}\n`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return { sent: false as const, error: body.slice(0, 300) };
  }

  return { sent: true as const };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
