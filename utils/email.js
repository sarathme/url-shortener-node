// SENDING MAIL USING nodemailer package

const nodemailer = require("nodemailer");

// Defining a function to send an email.

const sendEmail = async (options) => {
  // Create a transporter object with the SMTP credentials.

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  // Define email options

  const mailOptions = {
    from: "Sarasraman <sarathsatheesh603@gmail.com>",
    to: options.email,
    subject: options.subject,
    text: options.message,
  };

  // Send the email

  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
