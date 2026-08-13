import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import Link from "next/link";

export default async function PendingPage() {
  const { profile } = await requireUser();

  if (profile?.status === "approved") {
    return (
      <div className="page">
        <section className="section panel">
          <h2>You are in</h2>
          <p className="lead">Classes and chat are ready for you.</p>
          <Link href="/classes" className="btn-primary">
            Go to classes
          </Link>
        </section>
      </div>
    );
  }

  const rejected = profile?.status === "rejected";

  return (
    <div className="page">
      <section className="section panel stack">
        <h2>{rejected ? "Application declined" : "Application under review"}</h2>
        <p className="lead">
          {rejected
            ? "Classes and chat stay closed for now. Contact the organizers if this looks wrong."
            : "We review every application by hand. Classes and chat will unlock after approval."}
        </p>
        {profile && (
          <p>
            You applied as:{" "}
            <strong>
              {ROLE_LABELS[profile.requested_role || profile.role]}
            </strong>
          </p>
        )}
        {!rejected && (
          <p className="sub" style={{ marginTop: "1rem" }}>
            Demo tip: log out, open{" "}
            <Link href="/enter">Enter</Link> with the Tech key, approve your
            application, then log in again with the same email.
          </p>
        )}
      </section>
    </div>
  );
}
