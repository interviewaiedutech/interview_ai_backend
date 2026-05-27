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
    const message = [
      `From: InterviewAI <${process.env.EMAIL_USER}>`,

      `To: ${email}`,

      "Subject: Verify Your Email",

      "MIME-Version: 1.0",

      "Content-Type: text/html; charset=utf-8",

      "",

      `
          <div style="font-family:sans-serif">

            <h2>
              Email Verification
            </h2>

            <p>
              Click below to verify your account.
            </p>

            <a
              href="${verificationLink}"
              style="
                display:inline-block;
                padding:12px 20px;
                background:#4f46e5;
                color:white;
                text-decoration:none;
                border-radius:6px;
              "
            >
              Verify Email
            </a>

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

    console.log("✅ Gmail API email sent");
  } catch (error) {
    console.error("❌ Gmail API send error:", error);

    throw error;
  }
};

module.exports = sendVerificationEmail;
