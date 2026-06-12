const { google } = require("googleapis");

const OAuth2 = google.auth.OAuth2;

const oauth2Client = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground",
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const gmail = google.gmail({
  version: "v1",
  auth: oauth2Client,
});

const sendPasswordResetEmail = async (email, resetLink) => {
  try {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Reset Your Password – InterviewAI</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:40px 16px;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

          <!-- Header bar — amber/warning tone to signal action required -->
          <tr>
            <td style="background:linear-gradient(135deg,#1E293B 0%,#0F172A 100%);padding:32px 40px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:rgba(255,255,255,0.1);border-radius:8px;padding:6px 10px;">
                    <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Interview<span style="color:#93C5FD;">AI</span></span>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:-0.3px;">
                Password reset request
              </p>
              <p style="margin:6px 0 0;font-size:14px;color:#94A3B8;">
                We received a request to reset your password
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px;">

              <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">
                Hi there,
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
                Someone requested a password reset for your InterviewAI account. If this was you, click the button below to choose a new password.
              </p>

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="border-radius:8px;background:#2563EB;">
                    <a href="${resetLink}"
                       style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:0.1px;">
                      Reset Password →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry warning -->
              <table cellpadding="0" cellspacing="0" style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px 18px;width:100%;margin:0 0 20px;">
                <tr>
                  <td style="vertical-align:middle;">
                    <span style="font-size:15px;margin-right:8px;">⏱</span>
                    <span style="font-size:13px;color:#92400E;font-weight:500;">
                      This link expires in <strong>15 minutes</strong>. Request a new one if it expires.
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Fallback link block -->
              <table cellpadding="0" cellspacing="0" style="background:#F8FAFF;border:1px solid #DBEAFE;border-radius:8px;padding:16px 20px;width:100%;">
                <tr>
                  <td>
                    <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.6px;">
                      Or copy this link
                    </p>
                    <p style="margin:0;font-size:12px;color:#2563EB;word-break:break-all;line-height:1.5;">
                      ${resetLink}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Security note -->
              <table cellpadding="0" cellspacing="0" style="background:#F9FAFB;border-left:3px solid #E5E7EB;padding:14px 18px;width:100%;margin:24px 0 0;">
                <tr>
                  <td>
                    <p style="margin:0;font-size:13px;color:#6B7280;line-height:1.6;">
                      <strong style="color:#374151;">Didn't request this?</strong> Your password has not been changed. If you're concerned about unauthorized access, we recommend reviewing your account security settings.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px;background:#F3F4F6;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0;font-size:12px;color:#9CA3AF;line-height:1.6;">
                      © ${new Date().getFullYear()} InterviewAI. All rights reserved.<br/>
                      You're receiving this because a reset was requested for this address.
                    </p>
                  </td>
                  <td align="right" valign="top">
                    <span style="display:inline-block;width:28px;height:28px;background:#F1F5F9;border-radius:6px;text-align:center;line-height:28px;font-size:14px;">🔒</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
    `.trim();

    const message = [
      `From: InterviewAI <${process.env.EMAIL_USER}>`,
      `To: ${email}`,
      "Subject: Reset your password InterviewAI",
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      html,
    ].join("\n");

    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log("✅ Gmail API reset email sent");
  } catch (error) {
    console.error("❌ Gmail API reset email send error:", error);
    throw error;
  }
};

module.exports = sendPasswordResetEmail;
