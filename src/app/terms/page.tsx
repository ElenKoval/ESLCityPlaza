import { SITE_NAME } from "@/lib/site-name";

export default function TermsPage() {
  return (
    <div className="page">
      <article className="section panel stack legal-page">
        <h1>Terms</h1>
        <p className="sub">{SITE_NAME} · Last updated August 2026</p>
        <p>
          {SITE_NAME} is a community English-practice group, not a school or
          employer. By creating an account, you agree to use the site kindly and
          honestly.
        </p>
        <h2>Joining</h2>
        <p>
          Anyone can apply. Membership is approved by hand. We may decline,
          suspend, or remove an account if it is spam, unsafe, disruptive, or
          does not belong to a real person joining the group.
        </p>
        <h2>Classes and Chat</h2>
        <p>Class spots are limited. Please cancel if you cannot come.</p>
        <p>
          The Community Chat is for the group. Please be respectful and do not
          share other people’s private information. Access to the Chat may be
          restricted if necessary to keep the group safe and comfortable for
          everyone.
        </p>
        <h2>Your Content</h2>
        <p>
          You keep ownership of the messages, photos, and other content you
          share. You give us permission to show that content to other approved
          members of the site.
        </p>
        <p>
          You are responsible for making sure you have permission to share
          photos or information about other people.
        </p>
        <h2>The Site</h2>
        <p>
          We try to keep the site working, but it is offered as-is. Class
          times, topics, and other details may change.
        </p>
        <h2>Questions</h2>
        <p>
          Email{" "}
          <a href="mailto:plazaenglishgroup@gmail.com">
            plazaenglishgroup@gmail.com
          </a>
          .
        </p>
      </article>
    </div>
  );
}
