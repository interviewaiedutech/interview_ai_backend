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

const sendContactNotification = async (name, email, message) => {
  try {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="margin:0;padding:20px;background:#f5f7fb;font-family:Arial,sans-serif;">

  <div style="max-width:650px;margin:auto;background:#ffffff;border-radius:12px;padding:30px;border:1px solid #e5e7eb;">

    <h2 style="margin-top:0;color:#1f2937;">
      New Contact Form Submission
    </h2>

    <p style="color:#6b7280;">
      A new message has been submitted through the InterviewAI Contact Us page.
    </p>

    <table style="width:100%;border-collapse:collapse;margin-top:20px;">
      <tr>
        <td style="padding:10px;font-weight:bold;width:120px;">
          Name
        </td>
        <td style="padding:10px;">
          ${name}
        </td>
      </tr>

      <tr>
        <td style="padding:10px;font-weight:bold;">
          Email
        </td>
        <td style="padding:10px;">
          <a href="mailto:${email}">
            ${email}
          </a>
        </td>
      </tr>
    </table>

    <div style="margin-top:25px;">
      <h3 style="margin-bottom:10px;color:#1f2937;">
        Message
      </h3>

      <div style="
        background:#f9fafb;
        padding:15px;
        border-radius:8px;
        border:1px solid #e5e7eb;
        white-space:pre-wrap;
        line-height:1.6;
      ">
        ${message}
      </div>
    </div>

    <div style="
      margin-top:25px;
      padding-top:20px;
      border-top:1px solid #e5e7eb;
      color:#6b7280;
      font-size:13px;
    ">
      Submitted from InterviewAI Contact Form
    </div>

  </div>

</body>
</html>
    `.trim();

    const emailMessage = [
      `From: InterviewAI <${process.env.EMAIL_USER}>`,
      `Reply-To: ${email}`,
      `To: ${process.env.EMAIL_USER}`,
      `Subject: New Contact Form Submission from ${name}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      html,
    ].join("\n");

    const encodedMessage = Buffer.from(emailMessage)
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

    console.log("✅ Contact notification email sent");
  } catch (error) {
    console.error("❌ Contact notification email error:", error);
    throw error;
  }
};

module.exports = sendContactNotification;
