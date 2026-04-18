import { useEffect, useState } from 'react';

export function Crossfade() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((prev) => (prev + 1) % 100);
    }, 60);
    return () => window.clearInterval(id);
  }, []);

  const aWidth = Math.max(0, Math.min(100, 100 - tick));
  const bWidth = Math.max(0, Math.min(100, tick));

  return (
    <div className="crossfade-vis" aria-hidden="true">
      <div className="deck">
        <div className="dname">Deck A · drown</div>
        <div className="deck-bar">
          <i style={{ width: `${aWidth}%` }} />
        </div>
      </div>
      <div className="deck">
        <div className="dname">Deck B · butterfly effect</div>
        <div className="deck-bar b">
          <i style={{ width: `${bWidth}%` }} />
        </div>
      </div>
    </div>
  );
}
