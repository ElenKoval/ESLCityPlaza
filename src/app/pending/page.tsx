import { requireUser } from "@/lib/auth";
import { useLocalDemo } from "@/lib/demo";
import Link from "next/link";

export default async function PendingPage() {
  const { profile } = await requireUser();

  if (profile?.status === "approved") {
    return (
      <div className="page">
        <section className="section panel">
          <h2>You are in</h2>
          <p className="lead">Classes and chat are ready for you.</p>
          <Link href="/" className="btn-primary">
            Go home
          </Link>
        </section>
      </div>
    );
  }

  const rejected = profile?.status === "rejected";

  return (
    <div className="page">
      <section className="section panel stack">
        {rejected ? (
          <>
            <h2>Application declined</h2>
            <p className="lead">
              Classes and chat stay closed for now. Contact the organizers if
              this looks wrong.
            </p>
          </>
        ) : (
          <>
            <h2>Thank you!</h2>
            <p className="lead">
              Your request to join ESL on the Plaza has been sent.
            </p>
            <p>
              We’ll let you know when your membership is approved.
            </p>
          </>
        )}
        {!rejected && useLocalDemo() && (
          <p className="sub" style={{ marginTop: "1rem" }}>
            Demo tip: log out, open <Link href="/enter">Enter</Link> with the
            Tech key, approve your application, then log in again.
          </p>
        )}
      </section>
    </div>
  );
}
