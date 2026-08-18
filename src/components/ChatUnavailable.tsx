export function ChatUnavailable() {
  return (
    <div className="page">
      <section className="section panel stack chat-unavailable">
        <h1>Chat unavailable</h1>
        <p className="lead">
          You don&apos;t currently have access to the Community Chat.
        </p>
        <p>
          You can still use the rest of the site, including class sign-ups,
          announcements, and class topics.
        </p>
        <p>
          If you have any questions about your chat access, please contact us
          at{" "}
          <a href="mailto:plazaenglishgroup@gmail.com">
            plazaenglishgroup@gmail.com
          </a>
          .
        </p>
      </section>
    </div>
  );
}
