// Placeholder legal copy — review with the site operator before treating as
// final legal text. Not a substitute for legal advice.
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
        Johannes Nothstein, Bahnhofplatz 2, 4133 Pratteln, Switzerland —{' '}
        <a href="mailto:privacy@wasgoht.ch">privacy@wasgoht.ch</a>. See also the{' '}
        <a href="/imprint">Imprint</a>.
      </p>

      <h2>What data we collect</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong className="text-zinc-300">Account:</strong> your email address, used to sign you in via a magic link.</li>
        <li><strong className="text-zinc-300">Vehicles &amp; calibrations:</strong> details you enter about your vehicle and gear ratios.</li>
        <li><strong className="text-zinc-300">Run data:</strong> GPS location, altitude, speed, and motion-sensor readings recorded during a run, used to compute a power/torque curve. This is precise location data.</li>
        <li><strong className="text-zinc-300">Notes:</strong> any free text you add to a vehicle, calibration, or run.</li>
        <li><strong className="text-zinc-300">Session metadata:</strong> IP address and browser user-agent, stored with your login session for security purposes.</li>
      </ul>

      <h2>Why we process it</h2>
      <p>
        All of the above is processed solely to provide the DynoRun service to
        you — computing and storing your runs, calibrations, and vehicles, and
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
        the app to function, so no consent banner is required for it — there is no
        analytics, advertising, or tracking cookie of any kind. A small number of
        preferences (e.g. display units) are stored in your browser's local
        storage, not as cookies, and never leave your device.
      </p>

      <h2>Third parties we use</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong className="text-zinc-300">Resend</strong> — delivers the sign-in email containing your magic link. Receives your email address and a one-time sign-in URL.</li>
        <li><strong className="text-zinc-300">Hetzner Online GmbH</strong> — hosts the application and database in Germany.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Your data is kept for as long as your account exists. You can delete
        individual vehicles, calibrations, runs, or recordings at any time, or
        delete your entire account, from <a href="/settings">Settings</a> — this
        immediately and permanently removes the underlying data.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on your location, you have the right to access, correct, export,
        or delete your personal data, and to object to or restrict its processing.
        You can exercise access, export, and deletion yourself at any time from{' '}
        <a href="/settings">Settings</a> ("Download my data" and "Delete my
        account"). For anything else, contact{' '}
        <a href="mailto:privacy@wasgoht.ch">privacy@wasgoht.ch</a>. You also have
        the right to lodge a complaint with a supervisory authority — in
        Switzerland, the Federal Data Protection and Information Commissioner
        (FDPIC/EDÖB); in the EU, your local data protection authority.
      </p>

      <h2>International data transfer</h2>
      <p>
        As a small-scale, non-commercial project with no systematic or large-scale
        monitoring of individuals, we believe the "occasional processing"
        exemption from appointing an EU representative (GDPR Art. 27(2)) likely
        applies — this is our own assessment, not a formal legal determination.
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
