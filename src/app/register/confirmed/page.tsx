import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Email confirmed — ESL on the Plaza",
};

export default function RegisterConfirmedPage() {
  return (
    <div className="page">
      <section className="section panel stack">
        <h2>Email confirmed</h2>
        <p className="lead">
          Your request to join ESL on the Plaza has been sent.
        </p>
        <p>Please wait for approval.</p>
      </section>
    </div>
  );
}
