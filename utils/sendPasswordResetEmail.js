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
    const message = [
      `From: InterviewAI <${process.env.EMAIL_USER}>`,
      `To: ${email}`,
      "Subject: Reset Your Password",
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      `
      <div style="font-family:sans-serif">
        <h2>Password Reset Request</h2>

        <p>
          Click the button below to reset your password.
        </p>

        <a
          href="${resetLink}"
          style="
            display:inline-block;
            padding:12px 20px;
            background:#4f46e5;
            color:white;
            text-decoration:none;
            border-radius:6px;
          "
        >
          Reset Password
        </a>

        <p>
          This link expires in 15 minutes.
        </p>
      </div>
    `,
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
