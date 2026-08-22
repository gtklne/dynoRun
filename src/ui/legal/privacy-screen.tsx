// Placeholder legal copy: review with the site operator before treating as
// final legal text. Not a substitute for legal advice.
import { Link } from 'react-router-dom';
import { LegalPageLayout } from './legal-page-layout';

export function PrivacyScreen() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="2026-07-03">
      <p>
        This policy explains what personal data DynoRun (wasgoht.ch) collects, why,
        and what rights you have over it. It applies under the Swiss Federal Act on
        Data Protection (nDSG) and, for visitors in the EU/EEA, the General Data
        Protection Regulation (GDPR).
      </p>

      <h2>Who is responsible</h2>
      <p>
        Johannes Nothstein, Bahnhofplatz 2, 4133 Pratteln, Switzerland,{' '}
        <a href="mailto:privacy@wasgoht.ch">privacy@wasgoht.ch</a>. See also the{' '}
        <Link to="/imprint">Imprint</Link>.
      </p>

      <h2>What data we collect</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong className="text-zinc-300">Account:</strong> your email address and display name, used to sign you in. If you sign in with a password we store a salted hash of it, never the password itself. If you sign in with Google, Apple, or Discord we store the account identifier that provider gives us, and no password.</li>
        <li><strong className="text-zinc-300">Vehicles &amp; calibrations:</strong> details you enter about your vehicle and gear ratios.</li>
        <li><strong className="text-zinc-300">Run data:</strong> GPS location, altitude, speed, and motion-sensor readings recorded during a run, used to compute a power/torque curve. This is precise location data.</li>
        <li><strong className="text-zinc-300">Notes:</strong> any free text you add to a vehicle, calibration, or run.</li>
        <li><strong className="text-zinc-300">Session metadata:</strong> your IP address and browser user-agent, stored with each login session so we can tell sessions apart and rate-limit abuse.</li>
        <li><strong className="text-zinc-300">Provider tokens:</strong> if you sign in with Google, Apple, or Discord we also store the access token that provider issues us (encrypted at rest). It lets us confirm the link between your DynoRun account and theirs; we do not use it to read anything from your account with them.</li>
      </ul>

      <h2>Why we process it</h2>
      <p>
        All of the above is processed solely to provide the DynoRun service to
        you: computing and storing your runs, calibrations, and vehicles, and
        keeping you signed in. Our legal basis is performance of the
        service you use (contract / legitimate use necessary to provide it). We do
        not use your data for advertising, profiling, or automated
        decision-making, and we do not sell or share it with third parties for
        marketing purposes.
      </p>

      <h2>Cookies</h2>
      <p>
        DynoRun sets exactly one cookie: a session cookie used to keep you signed
        in (httpOnly, secure, sent only to this site). It is strictly necessary for
        the app to function, so no consent banner is required for it. There is no
        analytics, advertising, or tracking cookie of any kind. A small number of
        preferences (e.g. display units) are stored in your browser's local
        storage, not as cookies, and never leave your device. The iOS and Android
        apps keep their session token in that same local storage instead of a
        cookie, because a sign-in that passes through the system browser cannot
        hand a cookie back to the app.
      </p>

      <h2>Third parties we use</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong className="text-zinc-300">Resend</strong>, delivers password-reset email. Receives your email address and a one-time reset URL, and only when you ask to reset a password.</li>
        <li><strong className="text-zinc-300">Cloudflare</strong>, provides the Turnstile anti-bot check on sign-up and password reset. Receives your IP address and a challenge token.</li>
        <li><strong className="text-zinc-300">Google, Apple, Discord</strong>, only if you choose to sign in with one of them. They tell us your email address, name, their account identifier for you, and an access token, which we store encrypted. We never receive your password with them.</li>
        <li><strong className="text-zinc-300">Hetzner Online GmbH</strong>, hosts the application and database in Germany.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Your data is kept for as long as your account exists. You can delete
        individual vehicles, calibrations, runs, or recordings at any time, or
        delete your entire account, from <Link to="/settings">Settings</Link>. This
        immediately and permanently removes the underlying data.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on your location, you have the right to access, correct, export,
        or delete your personal data, and to object to or restrict its processing.
        You can exercise access, export, and deletion yourself at any time from{' '}
        <Link to="/settings">Settings</Link> ("Download my data" and "Delete my
        account"). For anything else, contact{' '}
        <a href="mailto:privacy@wasgoht.ch">privacy@wasgoht.ch</a>. You also have
        the right to lodge a complaint with a supervisory authority, in
        Switzerland, the Federal Data Protection and Information Commissioner
        (FDPIC/EDÖB); in the EU, your local data protection authority.
      </p>

      <h2>International data transfer</h2>
      <p>
        As a small-scale, non-commercial project with no systematic or large-scale
        monitoring of individuals, we believe the "occasional processing"
        exemption from appointing an EU representative (GDPR Art. 27(2)) likely
        applies. This is our own assessment, not a formal legal determination.
      </p>

      <h2>Children</h2>
      <p>DynoRun is not directed at children and is not knowingly used by them.</p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy from time to time; the date at the bottom of
        this page reflects the last revision.
      </p>
    </LegalPageLayout>
  );
}
