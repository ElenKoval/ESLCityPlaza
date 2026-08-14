const MAP_QUERY = "Civic Center Plaza, Mountain View, CA";
const MAP_EMBED = `https://www.google.com/maps?q=${encodeURIComponent(MAP_QUERY)}&hl=en&z=16&output=embed`;
const MAP_DIRECTIONS = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(MAP_QUERY)}`;

export function MeetSpot() {
  return (
    <section className="meet-spot" aria-labelledby="meet-spot-title">
      <div className="meet-spot__copy">
        <h2 id="meet-spot-title" className="meet-spot__title">
          Where we meet
        </h2>
        <p className="meet-spot__place">
          Near Civic Center Plaza, Mountain View
        </p>
        <a
          className="btn-secondary"
          href={MAP_DIRECTIONS}
          target="_blank"
          rel="noopener noreferrer"
        >
          Get directions
        </a>
      </div>
      <div className="meet-spot__map">
        <iframe
          title="Map of Civic Center Plaza in Mountain View"
          src={MAP_EMBED}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </div>
    </section>
  );
}
