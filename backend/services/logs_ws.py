from collections import defaultdict
import asyncio
listeners = defaultdict(list)


def register(log_id, ws):
    listeners[log_id].append(ws)


def unregister(log_id, ws):
    if ws in listeners[log_id]:
        listeners[log_id].remove(ws)


async def broadcast(log_id: int, message: str):
    print(f"[WS SEND] log_id={log_id} -> {message}")   # debug

    for ws in list(listeners.get(log_id, [])):
        try:
            await ws.send_text(message)
        except Exception:
            pass
        except:
            listeners[log_id].remove(ws)