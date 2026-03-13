import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import "./Login.css";

function Login() {

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [showSessionPopup, setShowSessionPopup] = useState(false);

    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const form = new FormData();
            form.append("username", username);
            form.append("password", password);

            const res = await api.post("/login", form);

            localStorage.setItem("token", res.data.access_token);

            navigate("/dashboard");

        } catch (err) {

            const message = err?.response?.data?.detail;

            if (message === "Maximum 2 active sessions allowed") {
                setShowSessionPopup(true);
            } else {
                alert("Invalid Credentials");
            }

        } finally {
            setLoading(false);
        }
    };

    const logoutAllDevices = async () => {
        try {

            const form = new FormData();
            form.append("username", username);
            form.append("password", password);

            await api.post("/logout-all");

            setShowSessionPopup(false);

            // retry login
            const res = await api.post("/login", form);

            localStorage.setItem("token", res.data.access_token);

            navigate("/dashboard");

        } catch {
            alert("Unable to logout sessions");
        }
    };

    return (
        <div className="login-container">

            <div className="login-card">

                <h2 className="login-title">Welcome Back</h2>
                <p className="login-subtitle">Please login to continue</p>

                <form onSubmit={handleLogin} className="login-form">

                    <input
                        type="text"
                        placeholder="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                    />

                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />

                    <button type="submit" disabled={loading}>
                        {loading ? "Logging in..." : "Login"}
                    </button>

                </form>
            </div>


            {/* SESSION POPUP */}

            {showSessionPopup && (
                <div className="session-popup">

                    <div className="session-popup-card">

                        <h3>Too Many Sessions</h3>

                        <p>
                            You are already logged in on 2 devices.
                            Do you want to logout all existing sessions?
                        </p>

                        <div className="popup-buttons">

                            <button
                                className="btn-danger"
                                onClick={logoutAllDevices}
                            >
                                Logout All Devices
                            </button>

                            <button
                                className="btn-secondary"
                                onClick={() => setShowSessionPopup(false)}
                            >
                                Cancel
                            </button>

                        </div>

                    </div>

                </div>
            )}

        </div>
    );
}

export default Login;