export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <a
          className="site-footer__contact"
          href="mailto:sunnychimeraworld@gmail.com"
        >
          Website Help
        </a>
        <span className="site-footer__sep" aria-hidden="true">
          ·
        </span>
        <p className="site-footer__credit">
          Design &amp; development by <strong>sunnychimera</strong>
        </p>
      </div>
    </footer>
  );
}
