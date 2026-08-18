"use client";

import Link from "next/link";
import type { ProfileStatus } from "@/lib/types";
import { PendingStatusPoller } from "./PendingStatusPoller";
import { SITE_NAME } from "@/lib/site-name";

export function RegisterConfirmedView({
  status,
}: {
  status: ProfileStatus | null;
}) {
  return (
    <>
      <PendingStatusPoller status={status} />
      <ConfirmedCopy status={status} />
    </>
  );
}

function ConfirmedCopy({ status }: { status: ProfileStatus | null }) {
  if (status === "approved") {
    return (
      <section className="section panel stack">
        <h2>Your account is approved</h2>
        <p className="lead">
          You can now log in and join {SITE_NAME}.
        </p>
        <p>
          <Link href="/login" className="btn-primary">
            Log in
          </Link>
        </p>
      </section>
    );
  }

  if (status === "rejected") {
    return (
      <section className="section panel stack">
        <h2>Application declined</h2>
        <p className="lead">
          Your request to join {SITE_NAME} was not approved.
        </p>
        <p>
          Community chat, class sign-up, and member pages stay closed. Contact
          the organizers if this looks wrong.
        </p>
      </section>
    );
  }

  return (
    <section className="section panel stack">
      <h2>Email confirmed</h2>
      <p className="lead">
        Your request to join {SITE_NAME} has been sent.
      </p>
      <p>Please wait for approval.</p>
      {!status && (
        <p>
          <Link href="/login" className="btn-secondary">
            Log in
          </Link>
        </p>
      )}
    </section>
  );
}
