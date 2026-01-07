const nodemailer = require('nodemailer');

// Create transporter 
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

// Send teacher credentials with verification
const sendCredentialsEmail = async (teacherEmail, teacherName, password, schoolName, verificationToken = null) => {
  try {
    const transporter = createTransporter();
    
    // Skip if no email configured
    if (!process.env.SMTP_USER) {
      console.log(`[EMAIL] Would send credentials to ${teacherEmail}:`);
      console.log(`  Name: ${teacherName}`);
      console.log(`  Email: ${teacherEmail}`);
      console.log(`  Password: ${password}`);
      console.log(`  School: ${schoolName}`);
      if (verificationToken) {
        console.log(`  Verification Link: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`);
      }
      return { success: true, skipped: true };
    }

    const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/login`;
    const verificationLink = verificationToken 
      ? `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`
      : null;

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: teacherEmail,
      subject: `Your Teacher Account Credentials - ${schoolName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #1976d2; color: white; padding: 20px; border-radius: 5px 5px 0 0;">
            <h2 style="margin: 0; color: white;">Welcome to ${schoolName}!</h2>
          </div>
          <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
            <p>Dear ${teacherName},</p>
            <p>Your teacher account has been created for the <strong>Shilpa – Suraksha</strong> system. Please use the following credentials to log in:</p>
            
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #1976d2;">
              <p style="margin: 5px 0;"><strong>Email:</strong> ${teacherEmail}</p>
              <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <code style="background-color: #fff; padding: 2px 6px; border-radius: 3px;">${password}</code></p>
            </div>

            ${verificationLink ? `
            <div style="background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center;">
              <p style="margin: 0 0 10px 0;"><strong>Verify Your Email Address</strong></p>
              <a href="${verificationLink}" style="display: inline-block; background-color: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify Email Address</a>
              <p style="margin: 10px 0 0 0; font-size: 12px; color: #666;">Or copy this link: ${verificationLink}</p>
            </div>
            ` : ''}

            <div style="margin: 20px 0;">
              <a href="${loginUrl}" style="display: inline-block; background-color: #4caf50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-right: 10px;">Login Now</a>
            </div>

            <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
              <p style="margin: 0;"><strong>⚠️ Important Security Notice:</strong></p>
              <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                <li>Please change your password immediately after your first login</li>
                <li>Keep your credentials secure and do not share them</li>
                <li>If you did not request this account, please contact your school administrator</li>
              </ul>
            </div>

            <p style="margin-top: 30px;">If you have any questions or need assistance, please contact your school administrator.</p>
            
            <p style="margin-top: 20px;">Best regards,<br><strong>${schoolName} Administration</strong></p>
          </div>
          <div style="background-color: #f5f5f5; padding: 15px; text-align: center; border-radius: 0 0 5px 5px; font-size: 12px; color: #666;">
            <p style="margin: 0;">This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return { success: true, skipped: false };
  } catch (error) {
    console.error('Error sending email:', error);
    // Don't fail the request if email fails
    return { success: false, error: error.message, skipped: false };
  }
};

// Send notification email
const sendNotificationEmail = async (email, subject, message) => {
  try {
    const transporter = createTransporter();
    
    if (!process.env.SMTP_USER) {
      console.log(`[EMAIL] Would send notification to ${email}: ${subject}`);
      return { success: true, skipped: true };
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: subject,
      html: message
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Error sending notification email:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendCredentialsEmail,
  sendNotificationEmail
};

