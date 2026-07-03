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

const sendContactReply = async (email, name, replyMessage) => {
  try {
    const html = `
      <div style="font-family:Arial,sans-serif;">
        <h2>InterviewAI Support</h2>

        <p>Hi ${name},</p>

        <p>${replyMessage}</p>

        <br>

        <p>
          Regards,<br>
          InterviewAI Team
        </p>
      </div>
    `;

    const emailMessage = [
      `From: InterviewAI <${process.env.EMAIL_USER}>`,
      `To: ${email}`,
      "Subject: Response From InterviewAI",
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

    return true;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

module.exports = sendContactReply;
