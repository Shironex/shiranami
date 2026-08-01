import { useEffect, useState } from 'react';

const LINES = [
  'midnight is honest, the playlist agrees',
  'we keep the volume low for the cat',
  'the chorus arrives at exactly 3:14',
  'outside, the rain is mostly metaphor',
  'and nothing is recommended to us',
];

export function LyricStrip() {
  const [active, setActive] = useState(2);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActive(prev => (prev + 1) % LINES.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="lyric-strip" aria-hidden="true">
      {LINES.map((line, index) => {
        const distance = Math.abs(index - active);
        const cls = index === active ? 'l active' : distance > 1 ? 'l dim' : 'l';
        return (
          <div key={line} className={cls}>
            {line}
          </div>
        );
      })}
    </div>
  );
}
