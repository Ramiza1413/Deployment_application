let socket = null;
let listeners = {};

export function connectWS(url) {
    if (socket) return socket;

    socket = new WebSocket(url);

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (listeners[data.log_id]) {
            listeners[data.log_id].forEach(cb => cb(data.message));
        }
    };

    return socket;
}

export function subscribe(logId, callback) {
    if (!listeners[logId]) listeners[logId] = [];
    listeners[logId].push(callback);
}

export function unsubscribe(logId, callback) {
    listeners[logId] = listeners[logId]?.filter(c => c !== callback);
}