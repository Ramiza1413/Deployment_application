import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import "./Dashboard.css";

function Dashboard() {
    const navigate = useNavigate();

    const [activeModule, setActiveModule] = useState("welcome");
    const [isAdmin, setIsAdmin] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [userProfile, setUserProfile] = useState(null);
    const [showProfile, setShowProfile] = useState(false);

    const [servers, setServers] = useState([]);
    const [serversGrouped, setServersGrouped] = useState({});
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [showServersDropdown, setShowServersDropdown] = useState(false);
    const [userGroups, setUserGroups] = useState([]);
    const [users, setUsers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [logs, setLogs] = useState([]);

    const [showModal, setShowModal] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [sshTestStatus, setSshTestStatus] = useState(null);
    const [pemFile, setPemFile] = useState(null);
    const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const [selectedUserId, setSelectedUserId] = useState(null);
    const [selectedGroupId, setSelectedGroupId] = useState(null);
    const [groupUsers, setGroupUsers] = useState([]);

    // MONITOR STATES
    const [monitorServer, setMonitorServer] = useState(null);
    const [monitorForm, setMonitorForm] = useState({
        bot_token: "",
        chat_ids: ""
    });
    const [monitorStatus, setMonitorStatus] = useState(null);

    // UPDATED SERVER FORM STATE (With Scheduling)
    const [serverForm, setServerForm] = useState({
        id: null,
        name: "",
        host: "",
        username: "",
        app_path: "",
        deploy_type: "docker",
        schedule: false,
        start_time: "09:00",
        end_time: "18:00",
        is_weekend_enabled: false,
        account: "",
        instance_id: "",
        private_ip: ""
    });

    const [userForm, setUserForm] = useState({
        username: "",
        email: "",
        password: "",
        is_admin: false
    });

    const resetServerForm = () => {
        setServerForm({
            id: null,
            name: "",
            host: "",
            username: "",
            app_path: "",
            deploy_type: "docker",
            schedule: false,
            start_time: "09:00",
            end_time: "18:00",
            is_weekend_enabled: false,
            account: "",
            instance_id: "",
            private_ip: ""
        });
        setPemFile(null);
    };

    const [groupForm, setGroupForm] = useState({ name: "" });

    /* ================= FETCH ================= */
    const fetchEc2Status = async (host) => {
        try {
            const res = await api.get(`/ec2/status/${host}`);
            return res.data.status;
        } catch (err) {
            return "unknown";
        }
    };

    const startEc2 = async (host) => {
        await api.post(`/ec2/start/${host}`);
        fetchServers();
    };

    const stopEc2 = async (host) => {
        await api.post(`/ec2/stop/${host}`);
        fetchServers();
    };

    const fetchUser = useCallback(async () => {
        try {
            const res = await api.get("/me");
            setIsAdmin(res.data.is_admin);
            setUserProfile(res.data);
            setUserGroups(res.data.groups || []);
        } catch {
            localStorage.removeItem("token");
            navigate("/");
        }
    }, [navigate]);

    const serverHasPermission = (server, permission) => {
        if (!server?.group_names) return false;
        return server.group_names.includes(permission);
    };

    const fetchServers = useCallback(async () => {
        const res = await api.get("/servers");
        const serversWithStatus = await Promise.all(
            res.data.map(async (server) => {
                const status = await fetchEc2Status(server.host);
                return { ...server, ec2_status: status };
            })
        );
        setServers(serversWithStatus);

        // Group by account
        const grouped = {};
        serversWithStatus.forEach(server => {
            const account = server.account || "No Account";
            if (!grouped[account]) grouped[account] = [];
            grouped[account].push(server);
        });
        setServersGrouped(grouped);
    }, []);

    const fetchUsers = useCallback(async () => {
        const res = await api.get("/users");
        setUsers(res.data);
    }, []);

    const fetchGroups = useCallback(async () => {
        const res = await api.get("/groups");
        setGroups(res.data);
    }, []);

    const fetchLogs = useCallback(async (pageNumber = 1) => {
        const res = await api.get(`/audit-logs?page=${pageNumber}&page_size=20`);
        setLogs(res.data.data);
        setTotalPages(res.data.total_pages);
        setPage(pageNumber);
    }, []);

    const fetchGroupUsers = async (groupId) => {
        const res = await api.get(`/groups/${groupId}/users`);
        setGroupUsers(res.data);
        setSelectedGroupId(groupId);
    };

    /* ================= MONITOR ACTIONS ================= */
    const openMonitorModal = async (server) => {
        setMonitorServer(server);
        setShowModal("monitor");

        try {
            const res = await api.get(`/monitor/check/${server.id}`);
            setMonitorStatus(res.data.status);

            if (res.data.status === "exists") {
                setShowReplaceConfirm(true);
            } else {
                setShowReplaceConfirm(false);
            }

            setMonitorForm({
                bot_token: "",
                chat_ids: ""
            });

        } catch (err) {
            alert("Error checking monitor");
        }
    };

    const setupMonitor = async () => {
        try {
            setIsLoading(true);

            const chatIdsArray = monitorForm.chat_ids
                .split(",")
                .map(id => parseInt(id.trim()))
                .filter(id => !isNaN(id));

            if (!monitorForm.bot_token || chatIdsArray.length === 0) {
                alert("Please enter bot token and valid chat ID");
                setIsLoading(false);
                return;
            }

            await api.post(`/monitor/setup/${monitorServer.id}`, {
                bot_token: monitorForm.bot_token,
                chat_ids: chatIdsArray,
                replace: monitorStatus === "exists"
            });

            alert("Monitor setup successful ✅");
            setShowModal(null);

        } catch (err) {
            alert(err?.response?.data?.message || "Failed ❌");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchUser(); }, [fetchUser]);

    useEffect(() => {
        fetchServers();
        if (isAdmin) {
            fetchUsers();
            fetchGroups();
        }
    }, [isAdmin, fetchServers, fetchUsers, fetchGroups]);

    useEffect(() => {
        if (activeModule === "logs" && isAdmin) {
            fetchLogs(1);
        }
    }, [activeModule, isAdmin, fetchLogs]);

    /* ================= ACTIONS ================= */

    const logout = async () => {
        try { await api.post("/logout"); } catch (err) { console.error("Logout failed", err); }
        localStorage.removeItem("token");
        navigate("/");
    };

    const logoutAllDevices = async () => {
        if (!window.confirm("Logout from all devices?")) return;
        try {
            await api.post("/logout-all");
            localStorage.removeItem("token");
            navigate("/");
        } catch (err) { console.error("Logout all failed", err); }
    };

    const saveServer = async () => {
        const formData = new FormData();
        // Standard fields
        formData.append("name", serverForm.name);
        formData.append("host", serverForm.host);
        formData.append("username", serverForm.username);
        formData.append("app_path", serverForm.app_path);
        formData.append("deploy_type", serverForm.deploy_type);

        // Scheduling fields
        formData.append("schedule", serverForm.schedule);
        formData.append("start_time", serverForm.start_time);
        formData.append("end_time", serverForm.end_time);
        formData.append("is_weekend_enabled", serverForm.is_weekend_enabled);

        // New fields
        formData.append("account", serverForm.account);
        formData.append("instance_id", serverForm.instance_id);
        formData.append("private_ip", serverForm.private_ip);

        if (pemFile) formData.append("pem_file", pemFile);

        try {
            if (serverForm.id) {
                await api.put(`/servers/${serverForm.id}`, formData);
            } else {
                await api.post("/servers", formData);
            }
            setShowModal(null);
            resetServerForm();
            fetchServers();
        } catch (err) {
            alert("Error saving server settings");
        }
    };

    const editServer = (server) => {
        setServerForm({
            id: server.id,
            name: server.name,
            host: server.host,
            username: server.username,
            app_path: server.app_path,
            deploy_type: server.deploy_type,
            schedule: server.schedule_enabled || false,
            start_time: server.schedule_details?.start_time || "09:00",
            end_time: server.schedule_details?.end_time || "18:00",
            is_weekend_enabled: server.schedule_details?.is_weekend_enabled || false,
            account: server.account || "",
            instance_id: server.instance_id || "",
            private_ip: server.private_ip || ""
        });
        setShowModal("server");
    };

    const createUser = async () => {
        const formData = new FormData();
        formData.append("username", userForm.username);
        formData.append("email", userForm.email);
        formData.append("password", userForm.password);
        formData.append("is_admin", userForm.is_admin);
        await api.post("/users", formData);
        setShowModal(null);
        fetchUsers();
    };

    const createGroup = async () => {
        const formData = new FormData();
        formData.append("name", groupForm.name);
        await api.post("/groups", formData);
        setShowModal(null);
        fetchGroups();
    };

    const assignUserToGroup = async () => {
        if (!selectedUserId || !selectedGroupId) { alert("Select user and group"); return; }
        const formData = new FormData();
        formData.append("user_id", selectedUserId);
        formData.append("group_id", selectedGroupId);
        await api.post("/assign-user-group", formData);
        alert("User assigned successfully");
    };

    const removeUserFromGroup = async (userId, groupId) => {
        const formData = new FormData();
        formData.append("user_id", userId);
        formData.append("group_id", groupId);
        await api.delete("/remove-user-group", { data: formData });
        fetchGroupUsers(groupId);
    };

    const assignServerToGroup = async (serverId) => {
        if (!selectedGroupId) { alert("Select group"); return; }
        const formData = new FormData();
        formData.append("server_id", serverId);
        formData.append("group_id", selectedGroupId);
        await api.post("/assign-server-group", formData);
        alert("Server assigned successfully");
    };

    const deleteItem = async (type, id) => {
        if (!window.confirm("Delete?")) return;
        await api.delete(`/${type}/${id}`);
        if (type === "servers") fetchServers();
        if (type === "users") fetchUsers();
        if (type === "groups") fetchGroups();
    };

    /* ================= RENDER TABLES ================= */

    const renderWelcome = () => (
        <div style={{ textAlign: "center", padding: "50px" }}>
            <h1>Welcome to Deployment Dashboard</h1>
            <p>Select an option from the sidebar to get started.</p>
        </div>
    );

    const renderTable = () => {
        if (activeModule === "welcome") {
            return renderWelcome();
        }

        if (activeModule === "servers") {
            const displayServers = selectedAccount ? serversGrouped[selectedAccount] || [] : [];
            return (
                <>
                    {/* WRAP THE HEADER AND BUTTON IN THIS FLEX CONTAINER */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                        <h3 style={{ margin: 0 }}>
                            {selectedAccount ? `Servers in ${selectedAccount}` : "Select an account from the sidebar"}
                        </h3>
                        {isAdmin && (
                            <button className="btn btn-primary" onClick={() => { resetServerForm(); setShowModal("server"); }}>
                                + Add Server
                            </button>
                        )}
                    </div>

                    {!selectedAccount ? (
                        <div className="info-box">Choose an account to view its servers and controls.</div>
                    ) : displayServers.length === 0 ? (
                        <div className="info-box">No servers available for this account.</div>
                    ) : (
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th><th>IP</th><th>Account</th><th>Instance ID</th><th>Status</th><th>Schedule</th>
                                    <th>Groups</th><th>Monitoring</th><th>Control</th>
                                    {isAdmin && <th>Assign Group</th>}
                                    {isAdmin && <th>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {displayServers.map((s) => (
                                    <tr key={s.id}>
                                        <td>{s.name}</td>
                                        <td>{s.host}</td>
                                        <td>{s.account || "-"}</td>
                                        <td>{s.instance_id || "-"}</td>
                                        <td>
                                            <span className={s.ec2_status === "running" ? "status-running" : s.ec2_status === "stopped" ? "status-stopped" : "status-unknown"}>
                                                {s.ec2_status || "loading..."}
                                            </span>
                                        </td>
                                        <td>
                                            {s.schedule_enabled ? (
                                                <span style={{ fontSize: "12px", color: "#4CAF50", fontWeight: "bold" }}>
                                                    🕒 {s.schedule_details?.start_time}-{s.schedule_details?.end_time}
                                                </span>
                                            ) : <span style={{ color: "#888" }}>Manual</span>}
                                        </td>
                                        <td>{s.groups && s.groups.length > 0 ? s.groups.join(", ") : "-"}</td>
                                        <td>
                                            {(isAdmin || serverHasPermission(s, "connect_server")) ? (
                                                <button className="btn btn-secondary btn-sm" onClick={() => openMonitorModal(s)}>
                                                    Monitor
                                                </button>
                                            ) : (
                                                <span style={{ color: "#bbb" }}>No access</span>
                                            )}
                                        </td>
                                        <td>
                                            {(isAdmin || serverHasPermission(s, "connect_server")) ? (
                                                <button className="btn btn-success btn-sm" onClick={() => navigate(`/server/${s.id}`)}>SSH/Deploy</button>
                                            ) : (
                                                <span style={{ color: "#bbb" }}>Restricted</span>
                                            )}
                                        </td>
                                        {isAdmin && (
                                            <td>
                                                <select className="select-sm" onChange={(e) => setSelectedGroupId(e.target.value)}>
                                                    <option value="">Select</option>
                                                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                                                </select>
                                                <button className="btn btn-primary btn-sm" onClick={() => assignServerToGroup(s.id)}>Assign</button>
                                            </td>
                                        )}
                                        {/* Simplified logic for the Actions column */}
                                        <td>
                                            {(isAdmin || serverHasPermission(s, "Edit_Server")) && (
                                                <button className="btn btn-warning btn-sm" onClick={() => editServer(s)}>Edit</button>
                                            )}
                                            {(isAdmin || serverHasPermission(s, "Start_stop")) && s.ec2_status === "stopped" && (
                                                <button className="btn btn-success btn-sm" onClick={() => startEc2(s.host)}>Start</button>
                                            )}
                                            {(isAdmin || serverHasPermission(s, "Start_stop")) && s.ec2_status === "running" && (
                                                <button className="btn btn-danger btn-sm" onClick={() => stopEc2(s.host)}>Stop</button>
                                            )}
                                            {!isAdmin && !serverHasPermission(s, "Edit_Server") && !serverHasPermission(s, "Start_stop") && (
                                                <span style={{ color: "#bbb" }}>No action rights</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </> // CLOSING FRAGMENT
            );
        }
        //     return null; // Ensure the function always returns something
        // };

        if (activeModule === "users" && isAdmin) {
            return (
                <>
                    <button className="btn btn-primary" onClick={() => setShowModal("user")}>+ Add User</button>
                    <table>
                        <thead>
                            <tr><th>ID</th><th>Username</th><th>Email</th><th>Assign Group</th><th>Delete</th></tr>
                        </thead>
                        <tbody>
                            {users.map((u) => (
                                <tr key={u.id}>
                                    <td>{u.id}</td><td>{u.username}</td><td>{u.email}</td>
                                    <td>
                                        <select onChange={(e) => { setSelectedUserId(u.id); setSelectedGroupId(e.target.value); }}>
                                            <option value="">Select</option>
                                            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                                        </select>
                                        <button className="btn btn-primary btn-sm" onClick={assignUserToGroup}>Assign</button>
                                    </td>
                                    <td><button className="btn btn-danger btn-sm" onClick={() => deleteItem("users", u.id)}>Delete</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            );
        }

        if (activeModule === "groups" && isAdmin) {
            return (
                <>
                    <button className="btn btn-primary" onClick={() => setShowModal("group")}>+ Add Group</button>
                    <table>
                        <thead>
                            <tr><th>ID</th><th>Name</th><th>Users</th><th>Delete</th></tr>
                        </thead>
                        <tbody>
                            {groups.map((g) => (
                                <tr key={g.id}>
                                    <td>{g.id}</td><td>{g.name}</td>
                                    <td><button className="btn btn-secondary btn-sm" onClick={() => fetchGroupUsers(g.id)}>View</button></td>
                                    <td><button className="btn btn-danger btn-sm" onClick={() => deleteItem("groups", g.id)}>Delete</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            );
        }

        if (activeModule === "logs" && isAdmin) {
            return (
                <>
                    <table>
                        <thead>
                            <tr><th>User</th><th>Action</th><th>Entity</th><th>ID</th><th>Time</th></tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => (
                                <tr key={log.id}><td>{log.user_id}</td><td>{log.action}</td><td>{log.entity_type}</td><td>{log.entity_id}</td><td>{log.timestamp}</td></tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="pagination">
                        <button disabled={page === 1} onClick={() => fetchLogs(page - 1)}>Prev</button>
                        <span>Page {page} of {totalPages}</span>
                        <button disabled={page === totalPages} onClick={() => fetchLogs(page + 1)}>Next</button>
                    </div>
                </>
            );
        }
    };

    return (
        <div className={`dashboard-layout ${sidebarOpen ? "" : "sidebar-collapsed"}`}>

            {/* SIDEBAR */}
            <div className="sidebar">
                <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
                    <span></span><span></span><span></span>
                </button>
                <div className="sidebar-brand"><span className="brand-label">Admin Panel</span></div>
                <div className="sidebar-divider" />
                <nav className="sidebar-nav">
                    <div className="nav-item">
                        <button className={activeModule === "servers" ? "active" : ""} onClick={() => setShowServersDropdown(!showServersDropdown)}>
                            <span className="nav-label">Servers</span>
                            <span className="nav-arrow">{showServersDropdown ? "▾" : "▸"}</span>
                        </button>
                        {showServersDropdown && (
                            <div className="account-list">
                                {Object.keys(serversGrouped).length > 0 ? (
                                    Object.keys(serversGrouped).map(account => (
                                        <button
                                            key={account}
                                            className={selectedAccount === account ? "sidebar-subnav active" : "sidebar-subnav"}
                                            onClick={() => {
                                                setSelectedAccount(account);
                                                setActiveModule("servers");
                                                // REMOVE THIS LINE BELOW:
                                                // setShowServersDropdown(false); 
                                            }}
                                        >
                                            {account}
                                        </button>
                                    ))
                                ) : (
                                    <div className="empty-note">No accounts available</div>
                                )}
                            </div>
                        )}
                    </div>
                    {isAdmin && (
                        <>
                            <button className={activeModule === "users" ? "active" : ""} onClick={() => setActiveModule("users")}>Users</button>
                            <button className={activeModule === "groups" ? "active" : ""} onClick={() => setActiveModule("groups")}>Groups</button>
                            <button className={activeModule === "logs" ? "active" : ""} onClick={() => setActiveModule("logs")}>Audit Logs</button>
                        </>
                    )}
                </nav>
                <div style={{ flex: 1 }} />
                {userProfile && (
                    <div className="profile-section" onClick={() => setShowProfile(true)}>
                        <div className="profile-avatar">{userProfile.username?.charAt(0).toUpperCase()}</div>
                        <div className="profile-info"><span className="profile-name">{userProfile.username}</span></div>
                    </div>
                )}
                <button className="logout-btn" onClick={logout}>Logout</button>
            </div>

            {/* MAIN CONTENT */}
            <div className="main">
                {renderTable()}
            </div>

            {/* PROFILE MODAL */}
            {showProfile && userProfile && (
                <div className="modal" onClick={() => setShowProfile(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h3>User Profile</h3>
                        <p><strong>Username:</strong> {userProfile.username}</p>
                        <p><strong>Email:</strong> {userProfile.email}</p>
                        <p><strong>Role:</strong> {userProfile.is_admin ? "Administrator" : "User"}</p>
                        <div className="modal-actions">
                            <button className="btn btn-danger" onClick={logoutAllDevices}>Logout All Devices</button>
                            <button className="btn btn-secondary" onClick={() => setShowProfile(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* SERVER MODAL (Updated with Scheduling) */}
            {showModal === "server" && (
                <div className="modal">
                    <div className="modal-content">
                        <h3>{serverForm.id ? "Edit Server" : "Add Server"}</h3>
                        <div className="modal-body">
                            <div className="form-section">
                                <h4>Basic Information</h4>
                                <div className="form-group"><label>Server Name</label><input type="text" value={serverForm.name} onChange={(e) => setServerForm({ ...serverForm, name: e.target.value })} /></div>
                                <div className="form-group"><label>Host / IP</label><input type="text" value={serverForm.host} onChange={(e) => setServerForm({ ...serverForm, host: e.target.value })} /></div>
                                <div className="form-group"><label>Private IP</label><input type="text" value={serverForm.private_ip} onChange={(e) => setServerForm({ ...serverForm, private_ip: e.target.value })} /></div>
                                <div className="form-group"><label>SSH Username</label><input type="text" value={serverForm.username} onChange={(e) => setServerForm({ ...serverForm, username: e.target.value })} /></div>
                                <div className="form-group"><label>Application Path</label><input type="text" value={serverForm.app_path} onChange={(e) => setServerForm({ ...serverForm, app_path: e.target.value })} /></div>
                                <div className="form-group"><label>Account</label><input type="text" value={serverForm.account} onChange={(e) => setServerForm({ ...serverForm, account: e.target.value })} /></div>
                                <div className="form-group"><label>Instance ID</label><input type="text" value={serverForm.instance_id} onChange={(e) => setServerForm({ ...serverForm, instance_id: e.target.value })} /></div>
                            </div>

                            <div className="form-section">
                                <h4>Automated Scheduling</h4>
                                <div className="form-group" style={{ flexDirection: 'row', gap: '10px', alignItems: 'center' }}>
                                    <input type="checkbox" style={{ width: 'auto' }} checked={serverForm.schedule} onChange={e => setServerForm({ ...serverForm, schedule: e.target.checked })} />
                                    <label style={{ margin: 0 }}>Enable Auto Start/Stop</label>
                                </div>
                                {serverForm.schedule && (
                                    <div className="schedule-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                                        <div style={{ display: 'flex', gap: '15px' }}>
                                            <div className="form-group" style={{ flex: 1 }}><label>Start</label><input type="time" value={serverForm.start_time} onChange={e => setServerForm({ ...serverForm, start_time: e.target.value })} /></div>
                                            <div className="form-group" style={{ flex: 1 }}><label>End</label><input type="time" value={serverForm.end_time} onChange={e => setServerForm({ ...serverForm, end_time: e.target.value })} /></div>
                                        </div>
                                        <div className="form-group" style={{ flexDirection: 'row', gap: '10px', alignItems: 'center', marginTop: '10px' }}>
                                            <input type="checkbox" style={{ width: 'auto' }} checked={serverForm.is_weekend_enabled} onChange={e => setServerForm({ ...serverForm, is_weekend_enabled: e.target.checked })} />
                                            <label style={{ margin: 0 }}>Enabled on Weekends</label>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="form-section">
                                <h4>SSH Key</h4>
                                <div className="form-group"><label>PEM Key</label><input type="file" accept=".pem" onChange={(e) => setPemFile(e.target.files[0])} /></div>
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-success" onClick={saveServer}>Save</button>
                            <button className="btn btn-secondary" onClick={() => { resetServerForm(); setShowModal(null); }}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MONITOR MODAL */}
            {showModal === "monitor" && monitorServer && (
                <div className="modal">
                    <div className="modal-content">

                        <h3>Monitor Setup: {monitorServer.name}</h3>

                        {/* 🔴 STEP 1: Show replace confirmation */}
                        {showReplaceConfirm ? (
                            <>
                                <p style={{ color: "#ff9800", fontWeight: "bold" }}>
                                    ⚠️ Script already exists. Do you want to replace it?
                                </p>

                                <div className="modal-actions">
                                    <button
                                        className="btn btn-danger"
                                        onClick={() => setShowReplaceConfirm(false)}
                                    >
                                        Yes, Replace
                                    </button>

                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setShowModal(null)}
                                    >
                                        No
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                {/* ✅ STEP 2: Show input form */}

                                <div className="form-group">
                                    <label>Bot Token</label>
                                    <input
                                        type="text"
                                        placeholder="Example: 123456:ABC-xyz"
                                        value={monitorForm.bot_token}
                                        onChange={(e) =>
                                            setMonitorForm({
                                                ...monitorForm,
                                                bot_token: e.target.value
                                            })
                                        }
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Chat IDs (CSV)</label>
                                    <input
                                        type="text"
                                        placeholder="Example: 987654321,123456789"
                                        value={monitorForm.chat_ids}
                                        onChange={(e) =>
                                            setMonitorForm({
                                                ...monitorForm,
                                                chat_ids: e.target.value
                                            })
                                        }
                                    />
                                </div>

                                <small style={{ color: "#888" }}>
                                    Example: Bot Token → 123456:ABC-xyz <br />
                                    Chat ID → 987654321
                                </small>

                                <div className="modal-actions">
                                    <button
                                        className="btn btn-success"
                                        onClick={setupMonitor}
                                        disabled={isLoading}
                                    >
                                        {isLoading ? "Processing..." : "Save & Deploy"}
                                    </button>

                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setShowModal(null)}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* USER & GROUP MODALS (Remain same) */}
            {showModal === "user" && (
                <div className="modal"><div className="modal-content"><h3>Add User</h3>
                    <input placeholder="Username" onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} />
                    <input placeholder="Email" onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
                    <input type="password" placeholder="Password" onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
                    <div className="modal-actions"><button className="btn btn-success" onClick={createUser}>Save</button><button className="btn btn-danger" onClick={() => setShowModal(null)}>Cancel</button></div>
                </div></div>
            )}

            {showModal === "group" && (
                <div className="modal"><div className="modal-content"><h3>Add Group</h3>
                    <input placeholder="Name" onChange={(e) => setGroupForm({ name: e.target.value })} />
                    <div className="modal-actions"><button className="btn btn-success" onClick={createGroup}>Save</button><button className="btn btn-danger" onClick={() => setShowModal(null)}>Cancel</button></div>
                </div></div>
            )}
        </div>
    );
}

export default Dashboard;