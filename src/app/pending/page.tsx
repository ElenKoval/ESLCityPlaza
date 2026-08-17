import { requireUser } from "@/lib/auth";
import { PendingStatusPoller } from "@/components/PendingStatusPoller";
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
      <PendingStatusPoller status={profile?.status ?? "pending"} />
      <section className="section panel stack">
        {rejected ? (
          <>
            <h2>Application declined</h2>
            <p className="lead">
              Your request to join ESL on the Plaza was not approved.
            </p>
            <p>
              You can log in, but community chat, class sign-up, and member
              profiles stay closed. Contact the organizers if this looks wrong.
            </p>
          </>
        ) : (
          <>
            <h2>Please wait for approval</h2>
            <p className="lead">
              Your request to join ESL on the Plaza has been sent.
            </p>
            <p>
              You can log in, but community chat, class sign-up, and member
              profiles stay closed until we approve your account.
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
