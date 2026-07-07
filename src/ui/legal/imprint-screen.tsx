// Placeholder legal copy — review with the site operator before treating as
// final legal text. Not a substitute for legal advice.
import { Link } from 'react-router-dom';
import { LegalPageLayout } from './legal-page-layout';

export function ImprintScreen() {
  return (
    <LegalPageLayout title="Imprint" lastUpdated="2026-07-03">
      <p>
        DynoRun (this website, wasgoht.ch) is operated by a private individual as a
        non-commercial personal project. It is not a registered business.
      </p>

      <h2>Operator</h2>
      <p>
        Johannes Nothstein<br />
        Bahnhofplatz 2<br />
        4133 Pratteln<br />
        Switzerland
      </p>

      <h2>Contact</h2>
      <p>
        Email: <a href="mailto:privacy@wasgoht.ch">privacy@wasgoht.ch</a>
      </p>

      <h2>Responsibility for content</h2>
      <p>
        As a private, non-commercial site, DynoRun is not subject to the Swiss Act
        Against Unfair Competition's obligatory-imprint requirement for commercial
        offerings — this notice is provided voluntarily for transparency. The
        operator makes reasonable efforts to keep content accurate and up to date
        but assumes no liability for its completeness, correctness, or timeliness.
      </p>

      <h2>Liability for links</h2>
      <p>
        This site may link to external websites over whose content the operator has
        no control. No liability is assumed for the content of any linked external
        site; responsibility lies solely with that site's operator.
      </p>

      <h2>Data protection</h2>
      <p>
        See the <Link to="/privacy">Privacy Policy</Link> for how personal data is
        collected, used, and protected.
      </p>
    </LegalPageLayout>
  );
}
