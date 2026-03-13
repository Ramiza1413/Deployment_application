import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import "./Dashboard.css";

function Dashboard() {
    const navigate = useNavigate();

    const [activeModule, setActiveModule] = useState("servers");
    const [isAdmin, setIsAdmin] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [userProfile, setUserProfile] = useState(null);
    const [showProfile, setShowProfile] = useState(false);

    const [servers, setServers] = useState([]);
    const [users, setUsers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [logs, setLogs] = useState([]);

    const [showModal, setShowModal] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [sshTestStatus, setSshTestStatus] = useState(null);
    const [pemFile, setPemFile] = useState(null);

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const [selectedUserId, setSelectedUserId] = useState(null);
    const [selectedGroupId, setSelectedGroupId] = useState(null);
    const [groupUsers, setGroupUsers] = useState([]);

    const [serverForm, setServerForm] = useState({
        id: null,
        name: "",
        host: "",
        username: "",
        app_path: "",
        deploy_type: "docker",
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
        } catch {
            localStorage.removeItem("token");
            navigate("/");
        }
    }, [navigate]);

    const fetchServers = useCallback(async () => {
        const res = await api.get("/servers");
        const serversWithStatus = await Promise.all(
            res.data.map(async (server) => {
                const status = await fetchEc2Status(server.host);
                return { ...server, ec2_status: status };
            })
        );
        setServers(serversWithStatus);
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
        try {
            await api.post("/logout");
        } catch (err) {
            console.error("Logout failed", err);
        }
        localStorage.removeItem("token");
        navigate("/");
    };

    const logoutAllDevices = async () => {
        if (!window.confirm("Logout from all devices?")) return;
        try {
            await api.post("/logout-all");
            localStorage.removeItem("token");
            navigate("/");
        } catch (err) {
            console.error("Logout all failed", err);
        }
    };

    const saveServer = async () => {
        const formData = new FormData();
        Object.keys(serverForm).forEach((key) => {
            if (serverForm[key] !== null) formData.append(key, serverForm[key]);
        });
        if (pemFile) formData.append("pem_file", pemFile);
        if (serverForm.id) {
            await api.put(`/servers/${serverForm.id}`, formData);
        } else {
            await api.post("/servers", formData);
        }
        setShowModal(null);
        setServerForm({ id: null, name: "", host: "", username: "", app_path: "", deploy_type: "docker" });
        fetchServers();
    };

    const editServer = (server) => {
        setServerForm({
            id: server.id,
            name: server.name,
            host: server.host,
            username: server.username,
            app_path: server.app_path,
            deploy_type: server.deploy_type,
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

    /* ================= RENDER TABLE ================= */

    const renderTable = () => {

        if (activeModule === "servers") {
            return (
                <>
                    {isAdmin && (
                        <button className="btn btn-primary" onClick={() => { resetServerForm(); setShowModal("server"); }}>
                            + Add Server
                        </button>
                    )}
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th><th>IP</th><th>Type</th><th>Status</th>
                                <th>Groups</th><th>Connect</th>
                                {isAdmin && <th>Assign Group</th>}
                                {isAdmin && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {servers.map((s) => (
                                <tr key={s.id}>
                                    <td>{s.name}</td>
                                    <td>{s.host}</td>
                                    <td>{s.deploy_type}</td>
                                    <td>
                                        <span className={
                                            s.ec2_status === "running" ? "status-running"
                                                : s.ec2_status === "stopped" ? "status-stopped"
                                                    : "status-unknown"
                                        }>{s.ec2_status || "loading..."}</span>
                                    </td>
                                    <td>{s.groups && s.groups.length > 0 ? s.groups.join(", ") : "-"}</td>
                                    <td>
                                        <button className="btn btn-success" onClick={() => navigate(`/server/${s.id}`)}>Connect</button>
                                    </td>
                                    {isAdmin && (
                                        <td>
                                            <select onChange={(e) => setSelectedGroupId(e.target.value)}>
                                                <option value="">Select</option>
                                                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                                            </select>
                                            <button className="btn btn-primary" onClick={() => assignServerToGroup(s.id)}>Assign</button>
                                        </td>
                                    )}
                                    {isAdmin && (
                                        <td>
                                            <button className="btn btn-warning" onClick={() => editServer(s)}>Edit</button>
                                            {s.ec2_status === "stopped" && <button className="btn btn-success" onClick={() => startEc2(s.host)}>Start</button>}
                                            {s.ec2_status === "running" && <button className="btn btn-danger" onClick={() => stopEc2(s.host)}>Stop</button>}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            );
        }

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
                                    <td>{u.id}</td>
                                    <td>{u.username}</td>
                                    <td>{u.email}</td>
                                    <td>
                                        <select onChange={(e) => { setSelectedUserId(u.id); setSelectedGroupId(e.target.value); }}>
                                            <option value="">Select</option>
                                            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                                        </select>
                                        <button className="btn btn-primary" onClick={assignUserToGroup}>Assign</button>
                                    </td>
                                    <td><button className="btn btn-danger" onClick={() => deleteItem("users", u.id)}>Delete</button></td>
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
                                    <td>{g.id}</td>
                                    <td>{g.name}</td>
                                    <td><button className="btn btn-secondary" onClick={() => fetchGroupUsers(g.id)}>View</button></td>
                                    <td><button className="btn btn-danger" onClick={() => deleteItem("groups", g.id)}>Delete</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {groupUsers.length > 0 && (
                        <div style={{ marginTop: "20px" }}>
                            <h4>Group Members</h4>
                            <table>
                                <thead><tr><th>ID</th><th>Username</th><th>Remove</th></tr></thead>
                                <tbody>
                                    {groupUsers.map((user) => (
                                        <tr key={user.id}>
                                            <td>{user.id}</td>
                                            <td>{user.username}</td>
                                            <td><button className="btn btn-danger" onClick={() => removeUserFromGroup(user.id, selectedGroupId)}>Remove</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
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
                                <tr key={log.id}>
                                    <td>{log.user_id}</td>
                                    <td>{log.action}</td>
                                    <td>{log.entity_type}</td>
                                    <td>{log.entity_id}</td>
                                    <td>{log.timestamp}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="pagination">
                        <button disabled={page === 1} onClick={() => fetchLogs(page - 1)}>Previous</button>
                        <span>Page {page} of {totalPages}</span>
                        <button disabled={page === totalPages} onClick={() => fetchLogs(page + 1)}>Next</button>
                    </div>
                </>
            );
        }
    };

    /* ================= RETURN ================= */

    return (
        <div className={`dashboard-layout ${sidebarOpen ? "" : "sidebar-collapsed"}`}>

            {/* ── SIDEBAR ── */}
            <div className="sidebar">

                {/* Hamburger toggle */}
                <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle sidebar">
                    <span></span>
                    <span></span>
                    <span></span>
                </button>

                {/* Brand */}
                <div className="sidebar-brand">
                    <div className="brand-icon"></div>
                    <span className="brand-label">Admin Panel</span>
                </div>

                <div className="sidebar-divider" />

                {/* Nav */}
                <nav className="sidebar-nav">
                    <button
                        className={activeModule === "servers" ? "active" : ""}
                        onClick={() => setActiveModule("servers")}
                    >
                        <span className="nav-icon">⬡</span>
                        <span className="nav-label">Servers</span>
                    </button>

                    {isAdmin && (
                        <>
                            <button
                                className={activeModule === "users" ? "active" : ""}
                                onClick={() => setActiveModule("users")}
                            >
                                <span className="nav-icon">◎</span>
                                <span className="nav-label">Users</span>
                            </button>

                            <button
                                className={activeModule === "groups" ? "active" : ""}
                                onClick={() => setActiveModule("groups")}
                            >
                                <span className="nav-icon">⬡</span>
                                <span className="nav-label">Groups</span>
                            </button>

                            <button
                                className={activeModule === "logs" ? "active" : ""}
                                onClick={() => setActiveModule("logs")}
                            >
                                <span className="nav-icon">≡</span>
                                <span className="nav-label">Audit Logs</span>
                            </button>
                        </>
                    )}
                </nav>

                {/* Spacer */}
                <div style={{ flex: 1 }} />

                <div className="sidebar-divider" />

                {/* Profile section */}
                {userProfile && (
                    <div className="profile-section" onClick={() => setShowProfile(true)} title="View profile">
                        <div className="profile-avatar">
                            {userProfile.username?.charAt(0).toUpperCase()}
                        </div>
                        <div className="profile-info">
                            <span className="profile-name">{userProfile.username}</span>
                            <span className="profile-role">{userProfile.is_admin ? "Administrator" : "Member"}</span>
                        </div>
                        <span className="profile-chevron">›</span>
                    </div>
                )}

                {/* Logout */}
                <button className="logout-btn" onClick={logout}>
                    <span className="nav-icon">⏻</span>
                    <span className="nav-label">Logout</span>
                </button>
            </div>

            {/* Overlay for mobile */}
            {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

            {/* ── MAIN ── */}
            <div className="main">
                {renderTable()}
            </div>

            {/* ── PROFILE MODAL ── */}
            {showProfile && userProfile && (
                <div className="modal" onClick={() => setShowProfile(false)}>
                    <div className="modal-content profile-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="profile-modal-header">
                            <div className="profile-modal-avatar">
                                {userProfile.username?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h3>{userProfile.username}</h3>
                                <span className={`role-badge ${userProfile.is_admin ? "role-admin" : "role-member"}`}>
                                    {userProfile.is_admin ? "Administrator" : "Member"}
                                </span>
                            </div>
                        </div>

                        <div className="profile-details">
                            <div className="profile-detail-row">
                                <span className="detail-label">Username</span>
                                <span className="detail-value">{userProfile.username}</span>
                            </div>
                            {userProfile.email && (
                                <div className="profile-detail-row">
                                    <span className="detail-label">Email</span>
                                    <span className="detail-value">{userProfile.email}</span>
                                </div>
                            )}
                            {userProfile.id && (
                                <div className="profile-detail-row">
                                    <span className="detail-label">User ID</span>
                                    <span className="detail-value">#{userProfile.id}</span>
                                </div>
                            )}
                            <div className="profile-detail-row">
                                <span className="detail-label">Role</span>
                                <span className="detail-value">{userProfile.is_admin ? "Administrator" : "Member"}</span>
                            </div>
                        </div>

                        <div className="modal-actions" style={{ marginTop: "8px" }}>
                            <div className="left-actions">
                                <button className="btn btn-danger" onClick={logoutAllDevices}>
                                    Logout All Devices
                                </button>
                            </div>
                            <div className="right-actions">
                                <button className="btn btn-secondary" onClick={() => setShowProfile(false)}>
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── SERVER MODAL ── */}
            {showModal === "server" && (
                <div className="modal">
                    <div className="modal-content">
                        <h3>{serverForm.id ? "Edit Server" : "Add Server"}</h3>
                        <div className="modal-body">
                            <div className="form-section">
                                <h4>Basic Information</h4>
                                <div className="form-group">
                                    <label>Server Name</label>
                                    <input type="text" value={serverForm.name} onChange={(e) => setServerForm({ ...serverForm, name: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Host / IP</label>
                                    <input type="text" value={serverForm.host} onChange={(e) => setServerForm({ ...serverForm, host: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>SSH Username</label>
                                    <input type="text" value={serverForm.username} onChange={(e) => setServerForm({ ...serverForm, username: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Application Path</label>
                                    <input type="text" value={serverForm.app_path} onChange={(e) => setServerForm({ ...serverForm, app_path: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-section">
                                <h4>Deployment Configuration</h4>
                                <div className="form-group">
                                    <label>Deployment Platform</label>
                                    <input type="text" value={serverForm.deploy_type} onChange={(e) => setServerForm({ ...serverForm, deploy_type: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-section">
                                <h4>SSH Key</h4>
                                <div className="form-group">
                                    <label>Upload PEM Key</label>
                                    <input type="file" accept=".pem" onChange={(e) => setPemFile(e.target.files[0])} />
                                </div>
                            </div>
                        </div>
                        <div className="modal-actions">
                            <div className="left-actions">
                                {serverForm.id && (
                                    <button className="btn btn-danger" onClick={async () => {
                                        if (!window.confirm("Delete this server?")) return;
                                        await deleteItem("servers", serverForm.id);
                                        resetServerForm();
                                        setShowModal(null);
                                    }}>Delete</button>
                                )}
                            </div>
                            <div className="right-actions">
                                <button className="btn btn-success" onClick={saveServer}>Save</button>
                                <button className="btn btn-secondary" onClick={() => { resetServerForm(); setShowModal(null); }}>Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── USER MODAL ── */}
            {showModal === "user" && (
                <div className="modal">
                    <div className="modal-content">
                        <h3>Add User</h3>
                        <input placeholder="Username" onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} />
                        <input placeholder="Email" onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
                        <input type="password" placeholder="Password" onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
                        <button className="btn btn-success" onClick={createUser}>Save</button>
                        <button className="btn btn-danger" onClick={() => setShowModal(null)}>Cancel</button>
                    </div>
                </div>
            )}

            {/* ── GROUP MODAL ── */}
            {showModal === "group" && (
                <div className="modal">
                    <div className="modal-content">
                        <h3>Add Group</h3>
                        <input placeholder="Group Name" onChange={(e) => setGroupForm({ name: e.target.value })} />
                        <button className="btn btn-success" onClick={createGroup}>Save</button>
                        <button className="btn btn-danger" onClick={() => setShowModal(null)}>Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Dashboard;