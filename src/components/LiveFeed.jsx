export default function LiveFeed({ events }) {
  return (
    <div className="live-feed">
      <div className="live-feed-title">Live event feed</div>
      <div className="live-feed-body">
        {events.length === 0 ? (
          <div className="live-feed-empty">Waiting for meaningful detection events…</div>
        ) : (
          events.map((event) => (
            <div className="live-feed-row" key={event.id}>
              <div className="live-feed-time">{event.label}</div>
              <div className="live-feed-title-row">{event.title}</div>
              {event.account && <div className="live-feed-account">{event.account}</div>}
              {event.scoreFrom !== null && (
                <div className="live-feed-score">
                  Score {event.scoreFrom} → {event.scoreTo}
                </div>
              )}
              {event.lines?.map((line, index) => (
                <div className="live-feed-line" key={index}>{line}</div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
