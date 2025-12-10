from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from geoip2.database import Reader
from pydantic import BaseModel, Field, IPvAnyAddress


class EventIn(BaseModel):
    source_ip: IPvAnyAddress = Field(..., description="Attack source IP")
    target_ip: IPvAnyAddress = Field(..., description="Victim IP")
    bytes_sent: int = Field(..., ge=0, description="Traffic volume in bytes")
    attack_type: Optional[str] = Field(None, description="Attack classifier or protocol")


class GeoRecord(BaseModel):
    ip: str
    latitude: Optional[float]
    longitude: Optional[float]
    country: Optional[str]
    city: Optional[str]


class Event(EventIn):
    timestamp: datetime
    source_geo: GeoRecord
    target_geo: GeoRecord


class GeoResolver:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or str(Path(__file__).parent / "data" / "GeoLite2-City.mmdb")
        self.reader = self._load_reader()

    def _load_reader(self):
        db_file = Path(self.db_path)
        if not db_file.exists():
            return None
        return Reader(str(db_file))

    def lookup(self, ip: str) -> GeoRecord:
        if self.reader is None:
            return GeoRecord(ip=ip, latitude=None, longitude=None, country=None, city=None)
        try:
            response = self.reader.city(ip)
            location = response.location
            return GeoRecord(
                ip=ip,
                latitude=location.latitude,
                longitude=location.longitude,
                country=response.country.name,
                city=response.city.name,
            )
        except Exception:
            return GeoRecord(ip=ip, latitude=None, longitude=None, country=None, city=None)


class EventRepository:
    def __init__(self):
        self._events: List[Event] = []

    def add(self, event: Event) -> Event:
        self._events.append(event)
        return event

    def recent_for_target(self, target_ip: str, within_minutes: int) -> List[Event]:
        cutoff = datetime.utcnow() - timedelta(minutes=within_minutes)
        return [event for event in self._events if event.target_ip == target_ip and event.timestamp >= cutoff]


class WebSocketManager:
    def __init__(self):
        self.connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, target_ip: str, websocket: WebSocket):
        await websocket.accept()
        self.connections.setdefault(target_ip, []).append(websocket)

    def disconnect(self, target_ip: str, websocket: WebSocket):
        if target_ip not in self.connections:
            return
        self.connections[target_ip] = [ws for ws in self.connections[target_ip] if ws is not websocket]
        if not self.connections[target_ip]:
            self.connections.pop(target_ip, None)

    async def broadcast(self, target_ip: str, message: Event):
        for websocket in self.connections.get(target_ip, []):
            await websocket.send_json(message.model_dump())


app = FastAPI(title="DDoS Check Globe")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
repository = EventRepository()
resolver = GeoResolver()
manager = WebSocketManager()


def get_repository() -> EventRepository:
    return repository


def get_resolver() -> GeoResolver:
    return resolver


@app.post("/events", response_model=Event)
async def ingest_event(
    payload: EventIn,
    repo: EventRepository = Depends(get_repository),
    geo: GeoResolver = Depends(get_resolver),
):
    source_geo = geo.lookup(str(payload.source_ip))
    target_geo = geo.lookup(str(payload.target_ip))
    event = Event(
        **payload.model_dump(),
        timestamp=datetime.utcnow(),
        source_geo=source_geo,
        target_geo=target_geo,
    )
    repo.add(event)
    await manager.broadcast(str(payload.target_ip), event)
    return event


@app.get("/events", response_model=List[Event])
async def query_events(
    target_ip: IPvAnyAddress,
    window_minutes: int = 5,
    repo: EventRepository = Depends(get_repository),
):
    if window_minutes <= 0:
        raise HTTPException(status_code=400, detail="window_minutes must be positive")
    return repo.recent_for_target(str(target_ip), window_minutes)


@app.websocket("/ws/events")
async def events_socket(websocket: WebSocket, target_ip: str, window_minutes: int = 5):
    if window_minutes <= 0:
        await websocket.close(code=1008)
        return
    await manager.connect(target_ip, websocket)
    try:
        recent = repository.recent_for_target(target_ip, window_minutes)
        for event in recent:
            await websocket.send_json(event.model_dump())
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(target_ip, websocket)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
