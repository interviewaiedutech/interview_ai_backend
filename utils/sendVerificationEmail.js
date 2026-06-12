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

const sendVerificationEmail = async (email, verificationLink) => {
  try {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Verify Your Email InterviewAI</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:40px 16px;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

          <!-- Header bar -->
          <tr>
            <td style="background:linear-gradient(135deg,#2563EB 0%,#1D4ED8 100%);padding:32px 40px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:rgba(255,255,255,0.15);border-radius:8px;padding:6px 10px;display:inline-block;">
                    <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Interview<span style="color:#BFDBFE;">AI</span></span>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:-0.3px;">
                Verify your email address
              </p>
              <p style="margin:6px 0 0;font-size:14px;color:#BFDBFE;">
                One quick step to activate your account
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
                Thanks for signing up for InterviewAI. To complete your registration and start practicing interviews, please verify your email address by clicking the button below.
              </p>

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="border-radius:8px;background:#2563EB;">
                    <a href="${verificationLink}"
                       style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:0.1px;">
                      Verify Email Address →
                    </a>
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
                      ${verificationLink}
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:13px;color:#9CA3AF;line-height:1.6;">
                This link expires in <strong style="color:#6B7280;">24 hours</strong>. If you didn't create an InterviewAI account, you can safely ignore this email.
              </p>

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
                      You're receiving this because you created an account.
                    </p>
                  </td>
                  <td align="right" valign="top">
                    <span style="display:inline-block;width:28px;height:28px;background:#EFF6FF;border-radius:6px;text-align:center;line-height:28px;font-size:14px;">✉️</span>
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
      "Subject: Verify your email InterviewAI",
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

    console.log("✅ Gmail API verification email sent");
  } catch (error) {
    console.error("❌ Gmail API send error:", error);
    throw error;
  }
};

module.exports = sendVerificationEmail;
