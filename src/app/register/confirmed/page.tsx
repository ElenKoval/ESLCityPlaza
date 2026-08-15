import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Email confirmed — ESL on the Plaza",
};

export default function RegisterConfirmedPage() {
  return (
    <div className="page">
      <section className="section panel stack">
        <h2>Thank you!</h2>
        <p className="lead">Your email has been confirmed.</p>
        <p>Your request to join ESL on Plaza has been sent.</p>
        <p>
          Please check the website later to see if your account has been
          approved.
        </p>
      </section>
    </div>
  );
}
