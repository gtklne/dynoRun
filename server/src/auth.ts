import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins/magic-link';
import { Resend } from 'resend';
import { pool } from './db.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.APP_URL!,
  trustedOrigins: [process.env.APP_URL!],
  user: {
    additionalFields: {
      // input: false — role can never be set through any auth API call;
      // it is granted only by a manual UPDATE on the user table.
      role: { type: 'string', defaultValue: 'user', input: false },
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await resend.emails.send({
          from: `DynoRun <${process.env.FROM_EMAIL}>`,
          to: email,
          subject: 'Sign in to DynoRun',
          html: `<p>Click the link below to sign in. It expires in 15 minutes.</p><p><a href="${url}">Sign in to DynoRun</a></p>`,
        });
      },
    }),
  ],
});
