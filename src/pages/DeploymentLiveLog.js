import { useState, useEffect, useRef, useCallback } from "react";

// ─── UTILS ────────────────────────────────────────────────────────────────────
const classify = (line) => {
    if (!line) return "blank";
    const l = line.toLowerCase();
    if (l.includes("error") || l.includes("failed") || l.includes("crash")) return "error";
    if (l.includes("warn")) return "warn";
    if (l.includes("success") || l.includes("completed") || l.includes("✓")) return "success";
    if (l.startsWith("[step") || l.startsWith("=====")) return "heading";
    if (l.startsWith("commit:") || l.startsWith("exit status")) return "meta";
    return "default";
};

const STATUS_META = {
    started: { label: "Running", color: "#f59e0b", dot: "#f59e0b", pulse: true },
    completed: { label: "Success", color: "#22c55e", dot: "#22c55e", pulse: false },
    failed: { label: "Failed", color: "#ef4444", dot: "#ef4444", pulse: false },
    unknown: { label: "Unknown", color: "#6b7280", dot: "#6b7280", pulse: false },
};

const kindColor = {
    error: "#f87171",
    warn: "#fbbf24",
    success: "#4ade80",
    heading: "#a78bfa",
    meta: "#67e8f9",
    default: "#d1d5db",
    blank: "transparent",
};

// ─── COMPONENT ────────────────────────────────────────────────────────────────
// Props:
//   deploymentId  — Deployment config id (used for WS channel + latest log fetch)
//   logId         — specific Deploymentlogs row id (for viewing a past run, skips WS)
//   apiBase       — e.g. "http://localhost:8000"
//   token         — JWT token string
//   onDone        — optional callback(status) fired when deployment finishes
export default function DeploymentLiveLog({ deploymentId, logId, apiBase, token, onDone }) {
    const [lines, setLines] = useState([]);
    const [status, setStatus] = useState("started");
    const [wsConnected, setWsConnected] = useState(false);
    const [filter, setFilter] = useState("");
    const [autoScroll, setAutoScroll] = useState(true);

    const bottomRef = useRef(null);
    const scrollRef = useRef(null);
    const wsRef = useRef(null);
    const lineIdRef = useRef(0);
    const doneRef = useRef(false);

    // ── Push a block of text (handles \n-separated output) ────────────────────
    const pushBlock = useCallback((raw) => {
        if (!raw) return;
        const newLines = raw.split("\n").map((text) => ({
            id: lineIdRef.current++,
            text: text.replace(/\r/g, ""),
            kind: classify(text.replace(/\r/g, "").toLowerCase()),
        }));
        setLines((prev) => {
            const existing = new Set(prev.map(l => l.text));
            const filtered = newLines.filter(l => !existing.has(l.text));
            return [...prev, ...filtered];
        });
    }, []);

    // ── Push a single WS message line ─────────────────────────────────────────
    const pushLine = useCallback((raw) => {
        const lines = raw.split('\n').map((text) => ({
            id: lineIdRef.current++,
            text: text.replace(/\r/g, ''),
            kind: classify(text.replace(/\r/g, '').toLowerCase()),
        })).filter(l => l.text.trim() !== '');

        setLines((prev) => [...prev, ...lines]);
    }, []);

    const markDone = useCallback((finalStatus) => {
        if (doneRef.current) return;
        doneRef.current = true;
        setStatus(finalStatus);
        setWsConnected(false);
        wsRef.current?.close();
        onDone?.(finalStatus);
    }, [onDone]);

    // ── Open WebSocket — only when deployment is still running ────────────────
    const openWS = useCallback((wsLogId) => {

        if (wsRef.current) return; // prevent duplicate connections

        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        const host = apiBase.replace(/^https?:\/\//, "");
        const ws = new WebSocket(`${protocol}://${host}/ws/log/${wsLogId}?token=${token}`);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('WS connected');
            setWsConnected(true);
        };
        ws.onmessage = (evt) => {
            console.log('WS message received:', evt.data);
            pushLine(evt.data);
            // ... rest of the code
        };
        ws.onerror = (err) => {
            console.error('WS error:', err);
        };

        ws.onmessage = (evt) => {
            const msg = evt.data;

            console.log("WS MESSAGE:", msg); // debug

            pushLine(msg);

            if (msg.includes("DEPLOYMENT COMPLETED")) markDone("completed");
            if (msg.includes("DEPLOYMENT FAILED") || msg.includes("DEPLOYMENT CRASHED")) markDone("failed");
        };
    }, [apiBase, token, pushLine, markDone]);

    // ── Main effect ───────────────────────────────────────────────────────────
    // 1. Reset state
    // 2. Fetch existing logs from REST
    // 3. If status === "started" → open WS for live tail
    // 4. If already done → just show the stored logs, no WS
    useEffect(() => {
        if (!deploymentId) return;

        // Reset
        doneRef.current = false;
        setLines([]);
        setStatus("started");
        setWsConnected(false);
        lineIdRef.current = 0;

        const url = logId
            ? `${apiBase}/deployment/log/${logId}`        // specific past run
            : `${apiBase}/deployment/${deploymentId}`;    // latest run for this deployment

        fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => r.json())
            .then((data) => {
                console.log("FETCHED DATA:", data);
                const s = data.status || "unknown";
                setStatus(s);

                // Viewing history → only API logs
                if (logId) {
                    wsRef.current?.close();   // ensure WS is closed
                    setWsConnected(false);

                    if (data.logs) pushBlock(data.logs);
                    return;
                }

                // Live deployment
                if (data.logs) {
                    pushBlock(data.logs);   // load already saved logs
                }
                if (s === "started") {
                    const wsLogId = data.deployment_log_id;
                    console.log("OPENING WS FOR LOG:", data.deployment_log_id);
                    if (wsLogId) {
                        openWS(wsLogId); // slight delay ensures UI ready
                    }
                }
            })
            .catch(() => {
                // Fetch failed — do nothing, no WS
            });

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deploymentId, logId]);

    // ── Auto-scroll ───────────────────────────────────────────────────────────
    useEffect(() => {
        if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [lines, autoScroll]);

    const handleScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
    };

    const visible = filter
        ? lines.filter((l) => l.text.toLowerCase().includes(filter.toLowerCase()))
        : lines;

    const meta = STATUS_META[status] || STATUS_META.unknown;
    const isLive = wsConnected && status === "started";

    return (
        <div style={ST.shell}>

            {/* ── Header ─────────────────────────────────────────────────────────── */}
            <div style={ST.header}>
                <div style={ST.headerLeft}>
                    <div style={ST.trafficLights}>
                        <span style={{ ...ST.dot, background: "#ef4444" }} />
                        <span style={{ ...ST.dot, background: "#f59e0b" }} />
                        <span style={{ ...ST.dot, background: "#22c55e" }} />
                    </div>
                    <span style={ST.title}>
                        deploy_log{" "}
                        <span style={ST.dimTitle}>
                            {logId ? `log#${logId}` : `dep#${deploymentId}`}
                        </span>
                    </span>
                </div>

                <div style={ST.headerRight}>
                    {isLive && (
                        <span style={ST.liveChip}>
                            <span style={ST.liveDot} />
                            LIVE
                        </span>
                    )}
                    <span style={{ ...ST.statusBadge, borderColor: meta.color, color: meta.color }}>
                        <span style={{
                            ...ST.statusDot,
                            background: meta.dot,
                            animation: meta.pulse ? "depPulse 1.2s ease-in-out infinite" : "none",
                        }} />
                        {meta.label}
                    </span>
                </div>
            </div>

            {/* ── Toolbar ────────────────────────────────────────────────────────── */}
            <div style={ST.toolbar}>
                <input
                    style={ST.filterInput}
                    placeholder="Filter logs…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
                <span style={ST.lineCount}>{visible.length} lines</span>
                <button
                    style={{ ...ST.toolBtn, opacity: autoScroll ? 0.35 : 1 }}
                    onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                >
                    ↓ bottom
                </button>
                <button style={ST.toolBtn} onClick={() => setLines([])}>clear</button>
            </div>

            {/* ── Log body ───────────────────────────────────────────────────────── */}
            <div ref={scrollRef} onScroll={handleScroll} style={ST.logBody}>
                {visible.length === 0 && (
                    <div style={ST.empty}>
                        <span style={{ fontSize: 28 }}>⏳</span>
                        <span>Waiting for deployment output…</span>
                    </div>
                )}

                {visible.map((line, i) => (
                    <div key={line.id} style={ST.logRow}>
                        <span style={ST.lineNum}>{String(i + 1).padStart(4, " ")}</span>
                        <span style={{
                            ...ST.lineText,
                            color: kindColor[line.kind] || kindColor.default,
                            fontWeight: line.kind === "heading" ? 700 : 400,
                        }}>
                            {line.text || "\u00A0"}
                        </span>
                    </div>
                ))}

                {isLive && (
                    <div style={ST.logRow}>
                        <span style={ST.lineNum}>    </span>
                        <span style={ST.cursor}>█</span>
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            {/* ── Footer ─────────────────────────────────────────────────────────── */}
            <div style={ST.footer}>
                <span style={{ color: "#3d444d" }}>
                    {new Date().toLocaleTimeString()} · {logId ? `log #${logId}` : `deployment #${deploymentId}`}
                </span>
                {status === "completed" && <span style={{ color: "#22c55e" }}>✓ Completed successfully</span>}
                {status === "failed" && <span style={{ color: "#ef4444" }}>✗ Deployment failed</span>}
            </div>

            <style>{`
        @keyframes depPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.3; transform: scale(0.8); }
        }
        @keyframes depBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes depLivePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.6); }
          50%       { box-shadow: 0 0 0 5px rgba(34,197,94,0); }
        }
      `}</style>
        </div>
    );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const ST = {
    shell: {
        fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code',monospace",
        background: "#0d1117", border: "1px solid #21262d", borderRadius: 10,
        overflow: "hidden", display: "flex", flexDirection: "column",
        height: 520, width: "100%", boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
    },
    header: {
        background: "#161b22", borderBottom: "1px solid #21262d",
        padding: "9px 14px", display: "flex", alignItems: "center",
        justifyContent: "space-between", flexShrink: 0,
    },
    headerLeft: { display: "flex", alignItems: "center", gap: 10 },
    headerRight: { display: "flex", alignItems: "center", gap: 8 },
    trafficLights: { display: "flex", gap: 5 },
    dot: { display: "inline-block", width: 11, height: 11, borderRadius: "50%" },
    title: { color: "#8b949e", fontSize: 12 },
    dimTitle: { color: "#3d444d" },

    liveChip: {
        display: "flex", alignItems: "center", gap: 5,
        fontSize: 10, fontWeight: 700, color: "#22c55e",
        background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)",
        borderRadius: 20, padding: "2px 8px", letterSpacing: "0.08em",
    },
    liveDot: {
        width: 6, height: 6, borderRadius: "50%", background: "#22c55e",
        animation: "depLivePulse 1.2s ease-in-out infinite",
    },
    statusBadge: {
        display: "flex", alignItems: "center", gap: 5,
        fontSize: 10, fontWeight: 700, border: "1px solid",
        borderRadius: 20, padding: "2px 10px",
        letterSpacing: "0.06em", textTransform: "uppercase",
    },
    statusDot: { width: 6, height: 6, borderRadius: "50%", display: "inline-block" },

    toolbar: {
        background: "#161b22", borderBottom: "1px solid #21262d",
        padding: "5px 14px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
    },
    filterInput: {
        background: "#0d1117", border: "1px solid #21262d", borderRadius: 5,
        color: "#c9d1d9", fontSize: 12, padding: "3px 9px", outline: "none",
        flex: 1, fontFamily: "inherit",
    },
    lineCount: { color: "#3d444d", fontSize: 11, whiteSpace: "nowrap" },
    toolBtn: {
        background: "transparent", border: "1px solid #21262d", borderRadius: 5,
        color: "#8b949e", fontSize: 11, padding: "3px 9px", cursor: "pointer",
        fontFamily: "inherit", whiteSpace: "nowrap",
    },

    logBody: {
        flex: 1, overflowY: "auto", padding: "10px 0",
        background: "#0d1117", scrollbarWidth: "thin", scrollbarColor: "#21262d #0d1117",
    },
    logRow: { display: "flex", alignItems: "flex-start", padding: "1px 0", lineHeight: 1.65, fontSize: 12 },
    lineNum: {
        color: "#3d444d", userSelect: "none", paddingRight: 14, paddingLeft: 10,
        flexShrink: 0, fontSize: 11, lineHeight: 1.65, whiteSpace: "pre",
    },
    lineText: { whiteSpace: "pre-wrap", wordBreak: "break-all", flex: 1, paddingRight: 14 },
    cursor: { color: "#58a6ff", animation: "depBlink 1s step-end infinite", fontSize: 13 },

    empty: {
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100%", gap: 10, color: "#3d444d", fontSize: 13,
    },
    footer: {
        background: "#161b22", borderTop: "1px solid #21262d",
        padding: "5px 14px", display: "flex", justifyContent: "space-between",
        fontSize: 10, flexShrink: 0,
    },
};