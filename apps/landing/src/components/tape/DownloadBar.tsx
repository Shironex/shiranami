import { useEffect, useState } from 'react';

const STAGES = [
  {
    url: 'youtube.com/watch?v=…  ›  ASU — ソラゴト',
    file: 'asu_-_soragoto.opus',
  },
  {
    url: 'youtube.com/playlist?list=…  ›  late-night sessions',
    file: 'late_night_pl.zip',
  },
];

export function DownloadBar() {
  const [pct, setPct] = useState(0);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPct(prev => {
        if (prev >= 100) {
          setStage(s => (s + 1) % STAGES.length);
          return 0;
        }
        return prev + 2;
      });
    }, 80);
    return () => window.clearInterval(id);
  }, []);

  const current = STAGES[stage];

  return (
    <div className="download-bar" aria-hidden="true">
      <div className="row">
        <span style={{ color: 'var(--primary)' }}>›</span>
        <span className="url">{current.url}</span>
        <span className="pct">{pct}%</span>
      </div>
      <div className="pbar">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="row" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>
        <span>yt-dlp + ffmpeg</span>
        <span style={{ flex: 1 }} />
        <span>{current.file}</span>
      </div>
    </div>
  );
}
