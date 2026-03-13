from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from database import SessionLocal
from models import Deploymentlogs
from services.logs_ws import register, unregister

router = APIRouter()

@router.websocket("/ws/log/{log_id}")
async def deployment_logs_ws(websocket: WebSocket, log_id: int):

    await websocket.accept()

    # create db session
    db = SessionLocal()

    try:
        register(log_id, websocket)

        # send existing logs
        log = db.query(Deploymentlogs).filter(Deploymentlogs.id == log_id).first()

        if log and log.logs:
            for line in log.logs.split("\n"):
                await websocket.send_text(line)

        # keep connection alive
        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        unregister(log_id, websocket)

    finally:
        db.close()