export default function LiveFeed({ events }) {
  return (
    <div className="live-feed">
      <div className="live-feed-title">Live event feed</div>
      <div className="live-feed-body">
        {events.length === 0 ? (
          <div className="live-feed-empty">Waiting for some replay events to arrive…</div>
        ) : (
          events.map((event) => (
            <div className="live-feed-row" key={event.id}>
              <div className="live-feed-time">{event.label}</div>
              <div className="live-feed-message">{event.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
