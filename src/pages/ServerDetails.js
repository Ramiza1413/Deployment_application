import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef, useCallback } from "react";
import api from "../services/api";
import NewDeploymentModal from "../components/NewDeploymentModal";
import DeploymentLiveLog from "./DeploymentLiveLog"; // adjust path as needed
import {
    LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer
} from "recharts";

// ─── helpers ─────────────────────────────────────────────────────────────────
const API_BASE = (() => {
    if (process.env.NODE_ENV === "development")
        return `http://${window.location.hostname}:8000`;
    return `${window.location.protocol}//${window.location.host}/api`;
})();

const getToken = () => localStorage.getItem("token") || "";

/* ─────────────────────────────────────────────
   Deployment Config Fields
───────────────────────────────────────────── */
const DEP_FIELDS = [
    { key: "application_type", label: "App Type", required: true, placeholder: "Backend | frontend | nginx " },
    { key: "project_name", label: "Project Name", required: true, placeholder: "my-app" },
    { key: "repo_url", label: "Repo URL", placeholder: "git@bitbucket.org:ibianalytics/tras-data.git" },
    { key: "branch", label: "Branch", placeholder: "main" },
    { key: "repo_folder", label: "Repo Folder", placeholder: "./tras-data/" },
    { key: "dockerfile_path", label: "Dockerfile", required: true, placeholder: "./tras-data/Dockerfile.backend" },
    { key: "image_name", label: "Image Name", placeholder: "backend" },
    { key: "image_tag", label: "Image Tag", placeholder: "latest" },
    { key: "container_name", label: "Container", required: true, placeholder: "backend" },
    { key: "network_name", label: "Network", required: true, placeholder: "app_network" },
    { key: "cpus", label: "CPUs", placeholder: "1.0" },
    { key: "port_mapping", label: "Ports", required: true, placeholder: "8000:8000 or 3000:3000" },
    { key: "network_alias", label: "Net Alias", placeholder: "my-app" },
    { key: "restart_policy", label: "Restart Policy", required: true, placeholder: "unless-stopped" },
    { key: "volume_mappings", label: "Volumes", placeholder: '["/home/ubuntu/website/db/db.sqlite3:/django/db/db.sqlite3","/home/ubuntu/website/logs:/var/log/supervisor"]' },
];

/* ─────────────────────────────────────────────
   Create / Edit Deployment Modal
───────────────────────────────────────────── */
function DeploymentFormModal({ serverId, deployment, onClose, onSaved }) {
    const isEdit = !!deployment;
    const empty = DEP_FIELDS.reduce((acc, f) => { acc[f.key] = ""; return acc; }, {});
    const [form, setForm] = useState(() => {
        if (!deployment) return { ...empty, branch: "main", restart_policy: "unless-stopped" };
        const base = { ...empty };
        DEP_FIELDS.forEach(({ key }) => {
            const v = deployment[key];
            base[key] = v === null || v === undefined ? "" :
                typeof v === "object" ? JSON.stringify(v) : String(v);
        });
        return base;
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const submit = async () => {
        if (!form.application_type || !form.project_name) {
            setError("App Type and Project Name are required."); return;
        }
        setSaving(true); setError("");
        try {
            const fd = new FormData();
            if (!isEdit) fd.append("server_id", serverId);
            DEP_FIELDS.forEach(({ key }) => {
                if (form[key] !== "") fd.append(key, form[key]);
            });
            if (isEdit) await api.put(`/deployment/${deployment.id}`, fd);
            else await api.post("/deployment", fd);
            onSaved(); onClose();
        } catch (e) {
            setError(e?.response?.data?.detail || "Save failed.");
        } finally { setSaving(false); }
    };

    return (
        <>
            <style>
                {`
            input::placeholder {
                color: #64748b;
                opacity: 1;
                font-style: italic;
            }
        `}
            </style>

            <div style={S.overlay}>
                <div style={S.modal}>
                    <div style={S.mHead}>
                        <span style={S.mTitle}>{isEdit ? `Edit Deployment #${deployment.id}` : "New Deployment Config"}</span>
                        <button onClick={onClose} style={S.xBtn}>✕</button>
                    </div>
                    <div style={S.mBody}>
                        <div style={S.fGrid}>
                            {DEP_FIELDS.map(({ key, label, required, placeholder }) => (
                                <div key={key} style={S.fGroup}>
                                    <label style={S.fLabel}>{label}{required && <span style={{ color: "#f87171" }}> *</span>}</label>
                                    <input
                                        value={form[key]}
                                        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                        placeholder={placeholder}
                                        className=""
                                        style={S.fInput}
                                    />
                                </div>
                            ))}
                        </div>
                        {error && <div style={S.errBox}>{error}</div>}
                    </div>
                    <div style={S.mFoot}>
                        <button onClick={onClose} style={S.btnGray} disabled={saving}>Cancel</button>
                        <button onClick={submit} style={S.btnBlue} disabled={saving}>
                            {saving ? "Saving…" : isEdit ? "Update" : "Create"}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

/* ─────────────────────────────────────────────
   Info Drawer
───────────────────────────────────────────── */
function InfoDrawer({ dep, onClose, onEdit }) {
    return (
        <div style={S.overlay}>
            <div style={{ ...S.modal, maxWidth: 500 }}>
                <div style={S.mHead}>
                    <span style={S.mTitle}>Deployment Config #{dep.id} — Info</span>
                    <button onClick={onClose} style={S.xBtn}>✕</button>
                </div>
                <div style={S.mBody}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <tbody>
                            {Object.entries(dep).map(([k, v]) => (
                                <tr key={k} style={{ borderBottom: "1px solid #5a5f67", background: "#0f172a" }}>
                                    <td style={{ padding: "6px 8px", color: "#d6d7d9", fontWeight: 700, whiteSpace: "nowrap", width: 140, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.06em" }}>{k}</td>
                                    <td style={{ padding: "6px 8px", color: "#e2e8f0", wordBreak: "break-all", background: "#11192d", borderRadius: 4, fontFamily: "monospace" }}>
                                        {v === null || v === undefined || v === ""
                                            ? <span style={{ color: "#5b646f" }}>—</span>
                                            : typeof v === "object"
                                                ? <code style={{ background: "#1e293b", padding: "2px 6px", borderRadius: 3, fontSize: 11 }}>{JSON.stringify(v)}</code>
                                                : String(v)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div style={S.mFoot}>
                    <button onClick={onClose} style={S.btnGray}>Close</button>
                    <button onClick={() => { onClose(); onEdit(dep); }} style={S.btnBlue}>Edit</button>
                </div>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────
   Deployment Config Table
───────────────────────────────────────────── */
const CFG_COLS = ["id", "application_type", "project_name", "repo_url", "branch", "image_name", "port_mapping", "restart_policy", "created_at"];

function DeploymentConfigTable({ serverId, refresh, onRefresh }) {
    const [configs, setConfigs] = useState([]);
    const [showCreate, setShowCreate] = useState(false);
    const [editDep, setEditDep] = useState(null);
    const [infoDep, setInfoDep] = useState(null);

    const load = useCallback(async () => {
        try {
            const r = await api.get(`/deployment/${serverId}/info`);
            setConfigs(Array.isArray(r.data) ? r.data : []);
        } catch { }
    }, [serverId]);

    useEffect(() => { load(); }, [load, refresh]);

    const colLabel = (k) => ({ id: "ID", application_type: "App Type", project_name: "Project", repo_url: "Repo URL", branch: "Branch", image_name: "Image", port_mapping: "Ports", restart_policy: "Restart", created_at: "Created" }[k] || k);

    return (
        <div style={{ marginTop: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0, color: "#f1f5f9", fontSize: 15, fontWeight: 700, letterSpacing: "0.04em" }}>DEPLOYMENT CONFIGS</h3>
                <button onClick={() => setShowCreate(true)} style={{ ...S.btnBlue, fontSize: 12, padding: "6px 14px" }}>+ New Config</button>
            </div>

            <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #1e293b" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: "#0f172a" }}>
                            {CFG_COLS.map(k => (
                                <th key={k} style={{ padding: "10px 12px", textAlign: "left", color: "#475569", fontWeight: 700, whiteSpace: "nowrap", textTransform: "uppercase", fontSize: 10, letterSpacing: "0.07em", borderBottom: "1px solid #1e293b" }}>
                                    {colLabel(k)}
                                </th>
                            ))}
                            <th style={{ padding: "10px 12px", color: "#475569", fontWeight: 700, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.07em", borderBottom: "1px solid #1e293b" }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {configs.length === 0 ? (
                            <tr><td colSpan={CFG_COLS.length + 1} style={{ padding: 24, textAlign: "center", color: "#334155", fontSize: 13 }}>No configs yet.</td></tr>
                        ) : configs.map((d, i) => (
                            <tr key={d.id}
                                style={{ background: i % 2 === 0 ? "#0c1525" : "#0a1120", transition: "background 0.15s" }}
                                onMouseEnter={e => e.currentTarget.style.background = "#162032"}
                                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "#0c1525" : "#0a1120"}
                            >
                                {CFG_COLS.map(k => (
                                    <td key={k} style={{ padding: "8px 12px", color: k === "id" ? "#60a5fa" : "#94a3b8", borderBottom: "1px solid #0f172a", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {k === "created_at" && d[k]
                                            ? new Date(d[k]).toLocaleDateString()
                                            : k === "image_name"
                                                ? (d.image_name ? `${d.image_name}:${d.image_tag || "latest"}` : "—")
                                                : (d[k] ?? "—")}
                                    </td>
                                ))}
                                <td style={{ padding: "8px 12px", borderBottom: "1px solid #0f172a", whiteSpace: "nowrap" }}>
                                    <button onClick={() => setInfoDep(d)} style={{ ...S.tagBtn, background: "#1e3a5f", color: "#93c5fd", marginRight: 5 }}>Info</button>
                                    <button onClick={() => setEditDep(d)} style={{ ...S.tagBtn, background: "#1e3a5f", color: "#6ee7b7" }}>Edit</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showCreate && <DeploymentFormModal serverId={serverId} onClose={() => setShowCreate(false)} onSaved={() => { load(); onRefresh(); }} />}
            {editDep && <DeploymentFormModal serverId={serverId} deployment={editDep} onClose={() => setEditDep(null)} onSaved={() => { load(); onRefresh(); }} />}
            {infoDep && <InfoDrawer dep={infoDep} onClose={() => setInfoDep(null)} onEdit={(dep) => setEditDep(dep)} />}
        </div>
    );
}

/* ─────────────────────────────────────────────
   System Usage Bar
───────────────────────────────────────────── */
function UsageBar({ label, percent, used, total, unit = "GB", color }) {

    const safePercent = Number(percent) || 0;

    return (
        <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={S.metricLabel}>{label}</span>
                <span style={{ color, fontWeight: 700, fontSize: 13 }}>
                    {safePercent}%
                </span>
            </div>

            <div style={{ background: "#1e293b", height: 8, borderRadius: 4, overflow: "hidden" }}>
                <div
                    style={{
                        width: `${Math.min(safePercent, 100)}%`,
                        height: "100%",
                        background: `linear-gradient(90deg, ${color}, ${color}aa)`,
                        borderRadius: 4,
                        transition: "width 0.6s ease",
                    }}
                />
            </div>

            <div style={{ color: "#475569", fontSize: 11, marginTop: 4 }}>
                {used ?? "—"} / {total ?? "—"} {unit}
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────
   Main ServerDetails
───────────────────────────────────────────── */
function ServerDetails() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");
    const [metrics, setMetrics] = useState(null);
    const [connected, setConnected] = useState(false);
    const [checkingConnection, setCheckingConnection] = useState(false);
    const [deployments, setDeployments] = useState([]);
    const [deployScripts, setDeployScripts] = useState([]);
    const [configRefresh, setConfigRefresh] = useState(0);
    const [showNewDepModal, setShowNewDepModal] = useState(false);
    const [failCount, setFailCount] = useState(0);
    const [containers, setContainers] = useState([]);
    const [loadingContainers, setLoadingContainers] = useState(false);
    const [pruning, setPruning] = useState(false);

    // ── System Usage state ────────────────────────────────────────────────
    const [systemUsage, setSystemUsage] = useState(null);
    const [systemUsageError, setSystemUsageError] = useState(false);
    const systemUsageIntervalRef = useRef(null);

    // ── Live log state ────────────────────────────────────────────────────
    const [activeDeploymentId, setActiveDeploymentId] = useState(null);
    const [currentLogId, setCurrentLogId] = useState(null); // Added for tracking log IDs
    const [viewingLogId, setViewingLogId] = useState(null);
    const [deploying, setDeploying] = useState(false);

    const intervalRef = useRef(null);

    // ── Fetch system usage ────────────────────────────────────────────────
    const fetchSystemUsage = useCallback(async () => {
        try {
            const res = await api.get(`/server/${id}/system`);
            setSystemUsage(res.data);
            setSystemUsageError(false);
        } catch {
            setSystemUsageError(true);
        }
    }, [id]);
    const fetchContainers = useCallback(async () => {
        try {
            setLoadingContainers(true);

            const res = await api.get(`/server/${id}/docker/containers`);

            setContainers(res.data.containers || []);

        } catch (err) {
            console.error("Failed to fetch containers", err);
        } finally {
            setLoadingContainers(false);
        }
    }, [id]);
    const runDockerPrune = async () => {
        if (!window.confirm("This will delete unused Docker containers/images. Continue?"))
            return;

        try {
            setPruning(true);

            const res = await api.post(`/server/${id}/docker/prune`);

            alert("Docker cleanup completed");

            fetchContainers();

        } catch (err) {
            alert("Docker prune failed");
        } finally {
            setPruning(false);
        }
    };

    // ── Fetch helpers ─────────────────────────────────────────────────────
    const fetchMetrics = useCallback(async () => {
        try {
            setCheckingConnection(true);
            let url = `/server/${id}/metrics`;
            if (startTime && endTime) url += `?start_time=${startTime}&end_time=${endTime}`;
            const res = await api.get(url);
            setMetrics(res.data); setConnected(true); setFailCount(0);
        } catch {
            setConnected(false); setFailCount(p => p + 1);
        } finally { setCheckingConnection(false); }
    }, [id, startTime, endTime]);

    const fetchDeployments = useCallback(async () => {
        try {
            const res = await api.get(`/deployments/${id}`);
            setDeployments(res.data);
        } catch { }
    }, [id]);

    const fetchDeployScripts = useCallback(async () => {
        try {
            const r = await api.get(`/deployment/${id}/info`);
            setDeployScripts(Array.isArray(r.data) ? r.data : []);
        } catch { }
    }, [id]);

    useEffect(() => {
        fetchMetrics(); fetchDeployments(); fetchDeployScripts();
        intervalRef.current = setInterval(() => {
            if (failCount < 2) fetchMetrics(); else clearInterval(intervalRef.current);
        }, 60000);
        return () => clearInterval(intervalRef.current);
    }, [fetchMetrics, fetchDeployments, fetchDeployScripts]);

    // ── System usage: initial fetch + 15s polling ─────────────────────────
    useEffect(() => {
        fetchSystemUsage();
        systemUsageIntervalRef.current = setInterval(fetchSystemUsage, 15000);
        return () => clearInterval(systemUsageIntervalRef.current);
    }, [fetchSystemUsage]);

    useEffect(() => {
        fetchContainers();
    }, [fetchContainers]);

    // ── Trigger a deployment ──────────────────────────────────────────────
    const deployingRef = useRef(false);

    const startDeploy = async (deployment) => {

        const confirmDeploy = window.confirm(
            `Are you sure you want to deploy "${deployment.project_name || deployment.application_type}" ?`
        );

        if (!confirmDeploy) return;

        if (deployingRef.current) return;
        deployingRef.current = true;

        try {
            setDeploying(true);

            const fd = new FormData();
            fd.append("message", "Manual deploy from UI");

            const res = await api.post(`/deploy/${deployment.id}`, fd);

            // Updated to handle return from API including the log ID
            setCurrentLogId(res.data.deployment_log_id);
            setActiveDeploymentId(deployment.id);
            setViewingLogId(null);

        } catch (err) {
            const errorData = err.response?.data;
            if (errorData?.error === "Server Busy") {
                alert(`⚠️ SERVER BUSY: ${errorData.detail}`);
            } else {
                alert("Failed to trigger deployment");
            }
            setDeploying(false);
            deployingRef.current = false;
        }
    };

    // Cancellation logic
    const handleCancel = async () => {
        const logIdToCancel = viewingLogId || currentLogId;
        if (!logIdToCancel) return;

        if (!window.confirm("Are you sure you want to stop this deployment process?")) return;

        try {
            await api.post(`/deployment/cancel/${logIdToCancel}`);
            alert("Cancellation command sent to server.");
        } catch (err) {
            alert("Failed to send cancellation request.");
        }
    };

    const handleDeployDone = useCallback((finalStatus) => {
        setDeploying(false);
        deployingRef.current = false;
        fetchDeployments();
    }, [fetchDeployments]);

    const viewLog = (logId, deploymentId) => {
        setViewingLogId(logId);
        setCurrentLogId(logId);
        setActiveDeploymentId(deploymentId);
    };

    const disconnect = async () => {
        try { await api.post(`/server/${id}/disconnect`); } catch { }
        clearInterval(intervalRef.current);
        clearInterval(systemUsageIntervalRef.current);
        setConnected(false); setMetrics(null); navigate("/dashboard");
    };

    const statusColor = (s) => s === "completed" ? "#4ade80" : s === "failed" ? "#f87171" : s === "cancelled" ? "#94a3b8" : "#fbbf24";

    const showLogPanel = activeDeploymentId !== null;

    return (
        <div style={S.page}>

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div style={S.header}>
                <div>
                    <div style={S.headerLabel}>SERVER DASHBOARD</div>
                    <div style={S.serverIdBadge}>#{id}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ ...S.statusDot, background: checkingConnection ? "#fbbf24" : connected ? "#4ade80" : "#f87171" }} />
                    <span style={{ color: checkingConnection ? "#fbbf24" : connected ? "#4ade80" : "#f87171", fontSize: 13, fontWeight: 700 }}>
                        {checkingConnection ? "CHECKING…" : connected ? "CONNECTED" : "DISCONNECTED"}
                    </span>
                    {!connected && !checkingConnection && <button onClick={fetchMetrics} style={{ ...S.btnBlue, fontSize: 12 }}>Connect</button>}
                    {connected && <button onClick={disconnect} style={{ ...S.btnRed, fontSize: 12 }}>Disconnect</button>}
                    <button onClick={() => navigate(-1)} style={{ ...S.btnGray, fontSize: 12 }}>← Back</button>
                </div>
            </div>

            {/* ── System Usage (RAM + Disk, auto-refreshes every 15s) ──────── */}
            <div style={S.card}>
                <div style={S.cardHead}>
                    <span style={S.cardTitle}>SYSTEM USAGE</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {systemUsage?.ram && systemUsage?.disk && (<span style={{ fontSize: 10, color: "#334155", fontFamily: "inherit" }}>
                            ↻ auto-refresh 15s
                        </span>
                        )}
                        <button
                            onClick={fetchSystemUsage}
                            style={{ ...S.btnGray, fontSize: 11, padding: "4px 10px" }}
                        >
                            Refresh
                        </button>
                    </div>
                </div>

                {systemUsageError && (
                    <div style={{ color: "#f87171", fontSize: 12, padding: "8px 0" }}>
                        ⚠ Could not fetch system usage.
                    </div>
                )}

                {!systemUsage && !systemUsageError && (
                    <div style={{ color: "#334155", fontSize: 13 }}>Loading system usage…</div>
                )}

                {systemUsage && (
                    <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>

                        <UsageBar
                            label="RAM"
                            percent={systemUsage?.ram?.percent}
                            used={systemUsage?.ram?.used_gb}
                            total={systemUsage?.ram?.total_gb}
                            unit="GB"
                            color="#3b82f6"
                        />

                        <UsageBar
                            label="DISK"
                            percent={systemUsage?.disk?.percent}
                            used={systemUsage?.disk?.used_gb || systemUsage?.disk?.used}
                            total={systemUsage?.disk?.total_gb || systemUsage?.disk?.total}
                            unit="GB"
                            color="#10b981"
                        />

                    </div>
                )}
            </div>

            {/* ── Metrics ─────────────────────────────────────────────────── */}
            {metrics && (
                <div style={S.card}>
                    <div style={S.cardHead}>
                        <span style={S.cardTitle}>SERVER METRICS</span>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} style={S.dtInput} />
                            <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} style={S.dtInput} />
                            <button onClick={fetchMetrics} style={{ ...S.btnBlue, fontSize: 11, padding: "5px 12px" }}>Fetch</button>
                        </div>
                    </div>

                    <div style={S.chartGrid}>
                        <ChartCard title="CPU Usage (%)" data={metrics.cpu} color="#3b82f6" />
                        <ChartCard title="RAM Timeline" data={metrics.ram?.history || metrics.cpu} color="#8b5cf6" />
                        <ChartCard title="Network In (Bytes)" data={metrics.network_in} color="#10b981" />
                        <ChartCard title="Network Out (Bytes)" data={metrics.network_out} color="#f59e0b" />
                    </div>
                </div>
            )}
            {/* ── Docker Containers ───────────────────────────────────── */}
            <div style={S.card}>
                <div style={S.cardHead}>
                    <span style={S.cardTitle}>DOCKER CONTAINERS</span>

                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            onClick={fetchContainers}
                            style={{ ...S.btnGray, fontSize: 11 }}
                        >
                            Refresh
                        </button>

                        <button
                            onClick={runDockerPrune}
                            disabled={pruning}
                            style={{ ...S.btnRed, fontSize: 11 }}
                        >
                            {pruning ? "Cleaning..." : "Docker Cleanup"}
                        </button>
                    </div>
                </div>

                {loadingContainers ? (
                    <div style={{ color: "#334155" }}>Loading containers...</div>
                ) : containers.length === 0 ? (
                    <div style={{ color: "#334155" }}>No running containers.</div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                                <tr style={{ background: "#0f172a" }}>
                                    {["ID", "Image", "Command", "Running", "Ports", "Name"].map(h => (
                                        <th key={h} style={S.rTh}>{h}</th>
                                    ))}
                                </tr>
                            </thead>

                            <tbody>
                                {containers.map((c, i) => (
                                    <tr key={i} style={{ background: i % 2 === 0 ? "#0c1525" : "#0a1120" }}>
                                        <td style={S.rTd}>{c.ID?.slice(0, 12)}</td>
                                        <td style={S.rTd}>{c.Image}</td>
                                        <td style={S.rTd}>{c.Command}</td>
                                        <td style={S.rTd}>{c.RunningFor}</td>
                                        <td style={S.rTd}>{c.Ports || "—"}</td>
                                        <td style={{ ...S.rTd, color: "#4ade80" }}>{c.Names}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Deploy Scripts ───────────────────────────────────────────── */}
            <div style={S.card}>
                <div style={S.cardHead}>
                    <span style={S.cardTitle}>DEPLOY SCRIPTS</span>
                </div>
                {deployScripts.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {deployScripts.map(ds => (
                            <button
                                key={ds.id}
                                onClick={() => startDeploy(ds)}
                                disabled={deploying}
                                style={{ ...S.scriptBtn, opacity: deploying ? 0.5 : 1 }}
                            >
                                {deploying && activeDeploymentId === ds.id ? "⏳" : "▶"}{" "}
                                {ds.application_type || ds.project_name || `Script ${ds.id}`}
                            </button>
                        ))}
                    </div>
                ) : (
                    <p style={{ color: "#334155", fontSize: 13, margin: 0 }}>No scripts yet. Create one above.</p>
                )}
            </div>



            {showNewDepModal && (
                <NewDeploymentModal
                    serverId={id}
                    onClose={() => setShowNewDepModal(false)}
                    onCreated={() => { fetchDeployments(); fetchDeployScripts(); setConfigRefresh(c => c + 1); }}
                />
            )}

            {/* ── Live / History Log Viewer ────────────────────────────────── */}
            {showLogPanel && (
                <div style={S.card}>
                    <div style={S.cardHead}>
                        <span style={S.cardTitle}>
                            {viewingLogId
                                ? `LOG HISTORY — LOG #${viewingLogId}`
                                : `LIVE DEPLOYMENT LOG — DEPLOYMENT #${activeDeploymentId}`
                            }
                        </span>
                        <div style={{ display: "flex", gap: 8 }}>
                            {/* Cancellation Button */}
                            {(deploying || viewingLogId) && (
                                <button
                                    onClick={handleCancel}
                                    style={{ ...S.btnRed, fontSize: 11, padding: "4px 10px" }}
                                >
                                    🛑 Cancel Deployment
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    setActiveDeploymentId(null);
                                    setViewingLogId(null);
                                    setCurrentLogId(null);
                                    setDeploying(false);
                                }}
                                style={{ ...S.btnGray, fontSize: 11, padding: "4px 10px" }}
                            >
                                ✕ Close
                            </button>
                        </div>
                    </div>

                    <DeploymentLiveLog
                        key={`${activeDeploymentId}-${viewingLogId || currentLogId}`}
                        deploymentId={activeDeploymentId}
                        logId={viewingLogId || currentLogId}
                        apiBase={API_BASE}
                        token={getToken()}
                        onDone={handleDeployDone}
                    />
                </div>
            )}

            {/* ── Deployment Config Table ──────────────────────────────────── */}
            <div style={S.card}>
                <DeploymentConfigTable
                    serverId={id}
                    refresh={configRefresh}
                    onRefresh={() => setConfigRefresh(c => c + 1)}
                />
            </div>

            {/* ── Deployment Run History ───────────────────────────────────── */}
            <div style={S.card}>
                <div style={S.cardHead}><span style={S.cardTitle}>DEPLOYMENT RUN HISTORY</span></div>
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: "#0f172a" }}>
                                {["ID", "Dep ID", "Status", "Branch", "Commit", "Change Note", "Started", "Completed", "Logs"].map(h => (
                                    <th key={h} style={S.rTh}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {deployments.map((d, i) => (
                                <tr key={d.id} style={{ background: i % 2 === 0 ? "#0c1525" : "#0a1120" }}>
                                    <td style={S.rTd}>{d.id}</td>
                                    <td style={{ ...S.rTd, color: "#60a5fa" }}>{d.deployment_id || "—"}</td>
                                    <td style={{ ...S.rTd, color: statusColor(d.status), fontWeight: 700 }}>{d.status || "—"}</td>
                                    <td style={S.rTd}>{d.branch || "—"}</td>
                                    <td style={{ ...S.rTd, fontFamily: "monospace", fontSize: 11 }}>
                                        {d.commit_hash ? d.commit_hash.slice(0, 8) : "—"}
                                    </td>
                                    <td style={S.rTd}>{d.change_note || "—"}</td>
                                    <td style={S.rTd}>{d.started_at ? new Date(d.started_at).toLocaleString() : "—"}</td>
                                    <td style={S.rTd}>{d.completed_at ? new Date(d.completed_at).toLocaleString() : "—"}</td>
                                    <td style={S.rTd}>
                                        {d.id && d.deployment_id && (
                                            <button
                                                onClick={() => viewLog(d.id, d.deployment_id)}
                                                style={{ ...S.tagBtn, background: "#1e293b", color: "#94a3b8" }}
                                            >
                                                View
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────
   Chart Card helper
───────────────────────────────────────────── */
function ChartCard({ title, data, color }) {
    return (
        <div style={S.chartCard}>
            <div style={S.metricLabel}>{title}</div>
            <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="timestamp" tick={{ fill: "#475569", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#475569", fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: `1px solid ${color}`, borderRadius: 6, fontSize: 11 }} />
                    <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

/* ─────────────────────────────────────────────
   Styles
───────────────────────────────────────────── */
const S = {
    page: {
        minHeight: "100vh", background: "#060d1a", padding: "28px 32px",
        fontFamily: "'IBM Plex Mono','Courier New',monospace", color: "#e2e8f0",
    },
    header: {
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid #1e293b",
    },
    headerLabel: { color: "#475569", fontSize: 11, letterSpacing: "0.12em", fontWeight: 700, marginBottom: 4 },
    serverIdBadge: { color: "#60a5fa", fontSize: 22, fontWeight: 900 },
    statusDot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" },
    card: { background: "#0c1525", border: "1px solid #1e293b", borderRadius: 12, padding: 20, marginBottom: 20 },
    cardHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
    cardTitle: { fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#475569" },
    chartGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
    chartCard: { background: "#0a1120", borderRadius: 8, padding: "14px 16px", border: "1px solid #1e293b" },
    metricLabel: { fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#64748b", marginBottom: 8, textTransform: "uppercase" },
    dtInput: { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, color: "#94a3b8", padding: "5px 8px", fontSize: 11, fontFamily: "inherit" },
    scriptBtn: { background: "#1c2f1a", color: "#4ade80", border: "1px solid #166534", borderRadius: 6, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700, transition: "background 0.15s" },
    btnBlue: { background: "#1d4ed8", color: "white", border: "none", borderRadius: 7, padding: "7px 16px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" },
    btnRed: { background: "#991b1b", color: "white", border: "none", borderRadius: 7, padding: "7px 16px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" },
    btnGray: { background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 7, padding: "7px 16px", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" },
    btnGreen: { background: "#064e3b", color: "#4ade80", border: "1px solid #166534", borderRadius: 7, padding: "7px 16px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" },
    tagBtn: { border: "none", borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit" },
    rTh: { padding: "9px 12px", textAlign: "left", color: "#334155", fontWeight: 700, fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", borderBottom: "1px solid #1e293b", whiteSpace: "nowrap" },
    rTd: { padding: "8px 12px", color: "#64748b", borderBottom: "1px solid #0f172a", verticalAlign: "top" },
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
    modal: { background: "#0c1525", border: "1px solid #1e293b", borderRadius: 14, width: "90%", maxWidth: 720, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 30px 80px rgba(0,0,0,0.6)" },
    mHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #1e293b" },
    mTitle: { fontWeight: 700, fontSize: 14, color: "#e2e8f0" },
    xBtn: { background: "none", border: "none", color: "#475569", fontSize: 18, cursor: "pointer", lineHeight: 1 },
    mBody: { padding: 20, overflowY: "auto", flex: 1 },
    mFoot: { padding: "12px 20px", borderTop: "1px solid #1e293b", display: "flex", justifyContent: "flex-end", gap: 10 },
    fGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" },
    fGroup: { display: "flex", flexDirection: "column", gap: 4 },
    fLabel: { fontSize: 10, fontWeight: 700, color: "#7288a5", textTransform: "uppercase", letterSpacing: "0.06em" },
    fInput: { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, color: "#e2e8f0", padding: "7px 10px", fontSize: 12, fontFamily: "inherit", outline: "none" },
    errBox: { marginTop: 12, background: "#1c0a0a", color: "#f87171", padding: "10px 14px", borderRadius: 6, fontSize: 12, border: "1px solid #7f1d1d" },
    fplaceholder: { color: "#475569", fontStyle: "italic" },
};

export default ServerDetails;