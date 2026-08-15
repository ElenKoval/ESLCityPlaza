export default function PrivacyPage() {
  return (
    <div className="page">
      <article className="section panel stack legal-page">
        <h1>Privacy Policy</h1>
        <p className="sub">ESL on the Plaza · last updated August 2026</p>
        <p>
          ESL on the Plaza is a small English-practice community. We collect only
          what we need to run the group.
        </p>
        <h2>What we collect</h2>
        <ul>
          <li>Your name, email, and password (the password is stored by our auth provider, not in plain text).</li>
          <li>Optional profile details you choose to share: where you are from, languages, interests, and a short introduction.</li>
          <li>Class sign-ups and messages you post in the community chat.</li>
        </ul>
        <h2>How we use it</h2>
        <p>
          We use this information to review join requests, run classes, and let
          members talk with the group. A Tech organizer can see your name,
          email, and application date in order to approve or decline your
          request.
        </p>
        <h2>Where it is stored</h2>
        <p>
          The website is hosted on Render. Accounts and data are stored with
          Supabase. The homepage map loads from Google Maps in your browser.
        </p>
        <h2>What we do not do</h2>
        <p>
          We do not sell your information. We do not use advertising trackers on
          this site.
        </p>
        <h2>Questions</h2>
        <p>
          Email{" "}
          <a href="mailto:sunnychimeraworld@gmail.com">
            sunnychimeraworld@gmail.com
          </a>
          .
        </p>
      </article>
    </div>
  );
}
