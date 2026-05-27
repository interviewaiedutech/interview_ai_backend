const nodemailer = require("nodemailer");

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

const sendVerificationEmail = async (email, verificationLink) => {
  try {
    const accessToken = await oauth2Client.getAccessToken();
    console.log("Generated access token", accessToken);

    const transporter = nodemailer.createTransport({
      service: "gmail",

      auth: {
        type: "OAuth2",

        user: process.env.EMAIL_USER,

        clientId: process.env.GOOGLE_CLIENT_ID,

        clientSecret: process.env.GOOGLE_CLIENT_SECRET,

        refreshToken: process.env.GOOGLE_REFRESH_TOKEN,

        accessToken,
      },
    });

    const info = await transporter.sendMail({
      from: `"InterviewAI" <${process.env.EMAIL_USER}>`,

      to: email,

      subject: "Verify Your Email",

      html: `
            <div
              style="
                font-family:sans-serif;
              "
            >

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
    });

    console.log("✅ Email sent:", info.response);
  } catch (error) {
    console.error("❌ Email send error:", error);

    throw error;
  }
};

module.exports = sendVerificationEmail;
