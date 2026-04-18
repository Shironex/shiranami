import { useEffect, useState } from 'react';

const STATIONS = [
  { freq: '88.5', name: 'Génér. Soul', country: 'FR' },
  { freq: '94.2', name: 'Buzzin Radio', country: 'US' },
  { freq: '101.7', name: 'El Nuevo Zol', country: 'US' },
  { freq: '106.7', name: 'Radio Lofi', country: 'JP' },
];

const POSITIONS = [12, 35, 62, 84];

export function RadioDial() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % STATIONS.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, []);

  const station = STATIONS[index];

  return (
    <div>
      <div className="radio-dial" aria-hidden="true">
        <div className="label" style={{ fontSize: 9 }}>
          FM · MHz
        </div>
        <div className="dial-scale" />
        <div className="dial-needle" style={{ left: `${POSITIONS[index]}%` }} />
        <div className="dial-numbers">
          <span>87</span>
          <span>92</span>
          <span>97</span>
          <span>102</span>
          <span>107</span>
        </div>
      </div>
      <div className="dial-station">
        <span className="freq">{station.freq}</span>
        <span>{station.name}</span>
        <span style={{ color: 'var(--ink-mute)' }}>{station.country} · AAC</span>
      </div>
    </div>
  );
}
