import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip } from 'react-leaflet';

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

function MapView({ events }) {
  const arcs = useMemo(
    () =>
      events
        .filter((event) => event.source_geo.latitude && event.target_geo.latitude)
        .map((event) => ({
          id: `${event.source_ip}-${event.timestamp}`,
          from: [event.source_geo.latitude, event.source_geo.longitude],
          to: [event.target_geo.latitude, event.target_geo.longitude],
          payload: event,
        })),
    [events]
  );

  const sources = useMemo(
    () =>
      events.filter((event) => event.source_geo.latitude && event.source_geo.longitude),
    [events]
  );

  const targets = useMemo(
    () =>
      events.filter((event) => event.target_geo.latitude && event.target_geo.longitude),
    [events]
  );

  return (
    <MapContainer className="map" center={[20, 0]} zoom={2} scrollWheelZoom>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {arcs.map((arc) => (
        <Polyline key={arc.id} positions={[arc.from, arc.to]} pathOptions={{ color: '#ff4757' }}>
          <Tooltip>
            <div>
              <div><strong>Source:</strong> {arc.payload.source_ip}</div>
              <div><strong>Target:</strong> {arc.payload.target_ip}</div>
              <div><strong>Bytes:</strong> {arc.payload.bytes_sent}</div>
              {arc.payload.attack_type && (
                <div><strong>Type:</strong> {arc.payload.attack_type}</div>
              )}
              <div><strong>Seen:</strong> {new Date(arc.payload.timestamp).toLocaleString()}</div>
            </div>
          </Tooltip>
        </Polyline>
      ))}
      {sources.map((event, index) => (
        <CircleMarker
          key={`source-${event.source_ip}-${index}`}
          center={[event.source_geo.latitude, event.source_geo.longitude]}
          radius={5}
          pathOptions={{ color: '#1e90ff', fillColor: '#1e90ff' }}
        >
          <Tooltip direction="top">
            <div>
              <div><strong>Source:</strong> {event.source_ip}</div>
              {event.source_geo.city && <div>{event.source_geo.city}</div>}
              {event.source_geo.country && <div>{event.source_geo.country}</div>}
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
      {targets.map((event, index) => (
        <CircleMarker
          key={`target-${event.target_ip}-${index}`}
          center={[event.target_geo.latitude, event.target_geo.longitude]}
          radius={6}
          pathOptions={{ color: '#ffa502', fillColor: '#ffa502' }}
        >
          <Tooltip direction="top">
            <div>
              <div><strong>Target:</strong> {event.target_ip}</div>
              {event.target_geo.city && <div>{event.target_geo.city}</div>}
              {event.target_geo.country && <div>{event.target_geo.country}</div>}
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

export default function App() {
  const [events, setEvents] = useState([]);
  const [targetIp, setTargetIp] = useState('');
  const [windowMinutes, setWindowMinutes] = useState(10);

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

    const ws = new WebSocket(
      `${API_BASE.replace('http', 'ws')}/ws/events?target_ip=${encodeURIComponent(targetIp)}&window_minutes=${windowMinutes}`
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
      <MapView events={events} />
    </div>
  );
}
