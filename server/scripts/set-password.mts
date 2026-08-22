/**
 * Sets (or replaces) a user's password from the command line.
 *
 *   set -a && . /etc/dynorun.env && set +a
 *   npx tsx scripts/set-password.mts <email> '<password>'
 *
 * Exists because there is no admin UI for this and no way to bootstrap the
 * first password through the API: /sign-up/email refuses an existing email and
 * /reset-password needs a token from an email round trip.
 *
 * Deliberately mirrors the resetPassword handler in better-auth's
 * api/routes/password.ts step for step (hash, then create the `credential`
 * account or update the existing one), so an account made here is
 * indistinguishable from one made by a real password reset. Writing a hash by
 * any other recipe produces a row that sign-in silently rejects.
 */
import { auth } from '../src/auth.js';
import { pool } from '../src/db.js';

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error("usage: tsx scripts/set-password.mts <email> '<password>'");
  process.exit(1);
}

const ctx = await auth.$context;

const minLength = ctx.password.config.minPasswordLength;
if (password.length < minLength) {
  console.error(`Password must be at least ${minLength} characters.`);
  process.exit(1);
}

const found = await ctx.internalAdapter.findUserByEmail(email.trim().toLowerCase());
const user = found?.user;
if (!user) {
  console.error(`No user with email ${email}. Nothing changed.`);
  process.exit(1);
}

const hashedPassword = await ctx.password.hash(password);
const accounts = await ctx.internalAdapter.findAccounts(user.id);
const existing = accounts.find((a) => a.providerId === 'credential');

if (existing) {
  await ctx.internalAdapter.updatePassword(user.id, hashedPassword);
} else {
  await ctx.internalAdapter.createAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: hashedPassword,
  });
}

// Read the hash back out and verify against it, rather than trusting the write.
// A silently wrong hash looks identical here and only shows up as an
// unexplainable "invalid password" at the login screen.
const after = (await ctx.internalAdapter.findAccounts(user.id))
  .find((a) => a.providerId === 'credential');
const ok = after?.password
  ? await ctx.password.verify({ hash: after.password, password })
  : false;

console.log(`${existing ? 'Replaced' : 'Created'} the password for ${user.email} (${user.id})`);
console.log(`verified against the stored hash: ${ok}`);

await pool.end();
process.exit(ok ? 0 : 1);
