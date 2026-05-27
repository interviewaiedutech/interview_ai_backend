const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },

  tls: {
    rejectUnauthorized: false,
  },
});

const sendVerificationEmail = async (email, verificationLink) => {
  try {
    const info = await transporter.sendMail({
      from: `"InterviewAI" <${process.env.EMAIL_USER}>`,

      to: email,

      subject: "Verify Your Email",

      html: `
          <div
            style="
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: auto;
              padding: 20px;
            "
          >

            <h2>
              Verify Your Email
            </h2>

            <p>
              Thank you for registering.
            </p>

            <p>
              Click the button below
              to verify your account.
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
                margin-top:10px;
              "
            >
              Verify Email
            </a>

            <p
              style="
                margin-top:20px;
                font-size:14px;
                color:#666;
              "
            >
              This link expires in 1 day.
            </p>

          </div>
        `,
    });

    console.log("✅ Verification email sent:", info.response);
  } catch (error) {
    console.error("❌ Email send error:", error);

    throw error;
  }
};

module.exports = sendVerificationEmail;
