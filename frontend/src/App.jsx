import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Globe from 'react-globe.gl';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

function SearchBar({ targetIp, onSubmit }) {
  const [value, setValue] = useState(targetIp);

  return (
    <form
      className="search-bar"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value.trim());
      }}
    >
      <input
        type="text"
        placeholder="Target IP"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit">Track</button>
    </form>
  );
}

export default function App() {
  const [events, setEvents] = useState([]);
  const [targetIp, setTargetIp] = useState('');
  const [windowMinutes, setWindowMinutes] = useState(10);

  // 백엔드에서 받은 이벤트 → 3D 글로브용 데이터로 변환

  const arcsData = useMemo(
    () =>
      events
        .filter(
          (event) =>
            event.source_geo?.latitude != null &&
            event.source_geo?.longitude != null &&
            event.target_geo?.latitude != null &&
            event.target_geo?.longitude != null
        )
        .map((event) => ({
          ...event,
          startLat: event.source_geo.latitude,
          startLng: event.source_geo.longitude,
          endLat: event.target_geo.latitude,
          endLng: event.target_geo.longitude,
        })),
    [events]
  );

  const sourcePoints = useMemo(
    () =>
      events
        .filter(
          (event) =>
            event.source_geo?.latitude != null &&
            event.source_geo?.longitude != null
        )
        .map((event) => ({
          kind: 'source',
          lat: event.source_geo.latitude,
          lng: event.source_geo.longitude,
          ip: event.source_ip,
          city: event.source_geo.city,
          country: event.source_geo.country,
        })),
    [events]
  );

  const targetPoints = useMemo(
    () =>
      events
        .filter(
          (event) =>
            event.target_geo?.latitude != null &&
            event.target_geo?.longitude != null
        )
        .map((event) => ({
          kind: 'target',
          lat: event.target_geo.latitude,
          lng: event.target_geo.longitude,
          ip: event.target_ip,
          city: event.target_geo.city,
          country: event.target_geo.country,
        })),
    [events]
  );

  const pointsData = useMemo(
    () => [...sourcePoints, ...targetPoints],
    [sourcePoints, targetPoints]
  );

  // 백엔드와 연동 (REST + WebSocket)
  useEffect(() => {
    if (!targetIp) return;

    const fetchRecent = async () => {
      try {
        const response = await axios.get(`${API_BASE}/events`, {
          params: { target_ip: targetIp, window_minutes: windowMinutes },
        });
        setEvents(response.data);
      } catch (error) {
        console.error('Failed to fetch events', error);
      }
    };

    fetchRecent();

    const isHttps = API_BASE.startsWith('https');
    const wsBase = API_BASE.replace(/^https?/, isHttps ? 'wss' : 'ws');

    const ws = new WebSocket(
      `${wsBase}/ws/events?target_ip=${encodeURIComponent(
        targetIp
      )}&window_minutes=${windowMinutes}`
    );

    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      setEvents((current) => [payload, ...current].slice(0, 200));
    };

    ws.onerror = (error) => {
      console.error('WebSocket error', error);
    };

    return () => {
      ws.close();
    };
  }, [targetIp, windowMinutes]);

  return (
    <div className="app">
      <div className="controls">
        <SearchBar targetIp={targetIp} onSubmit={setTargetIp} />
        <label className="window-input">
          <span>Minutes</span>
          <input
            type="number"
            value={windowMinutes}
            min={1}
            max={120}
            onChange={(event) => setWindowMinutes(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="globe-wrapper">
        <Globe
          // 구글어스처럼 마우스로 드래그해서 회전 / 줌 가능
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
          backgroundColor="#020617"
          width={window.innerWidth}
          height={window.innerHeight}
          // 아크(공격 라인)
          arcsData={arcsData}
          arcStartLat="startLat"
          arcStartLng="startLng"
          arcEndLat="endLat"
          arcEndLng="endLng"
          arcColor={() => ['#1e90ff', '#ff4757']}
          arcDashLength={0.5}
          arcDashGap={0.4}
          arcDashAnimateTime={1200}
          arcLabel={(d) => `
            <div>
              <div><strong>Source:</strong> ${d.source_ip}</div>
              <div><strong>Target:</strong> ${d.target_ip}</div>
              <div><strong>Bytes:</strong> ${d.bytes_sent}</div>
              ${
                d.attack_type
                  ? `<div><strong>Type:</strong> ${d.attack_type}</div>`
                  : ''
              }
              <div><strong>Seen:</strong> ${new Date(
                d.timestamp
              ).toLocaleString()}</div>
            </div>
          `}
          // 소스/타깃 포인트
          pointsData={pointsData}
          pointLat="lat"
          pointLng="lng"
          pointAltitude={0.05}
          pointRadius={0.2}
          pointColor={(p) => (p.kind === 'source' ? '#1e90ff' : '#ffa502')}
          pointLabel={(p) =>
            `<div>
              <div><strong>${p.kind === 'source' ? 'Source' : 'Target'}</strong></div>
              <div>${p.ip}</div>
              ${
                p.city || p.country
                  ? `<div>${[p.city, p.country].filter(Boolean).join(', ')}</div>`
                  : ''
              }
            </div>`
          }
        />
      </div>
    </div>
  );
}
