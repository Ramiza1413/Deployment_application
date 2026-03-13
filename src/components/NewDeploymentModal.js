import { useState } from "react";
import api from "../services/api";

function NewDeploymentModal({ serverId, onClose, onCreated }) {
    const [applicationType, setApplicationType] = useState("");
    const [projectName, setProjectName] = useState("");
    const [repoUrl, setRepoUrl] = useState("");
    const [branch, setBranch] = useState("main");
    const [repoFolder, setRepoFolder] = useState("");
    const [dockerfilePath, setDockerfilePath] = useState("");
    const [imageName, setImageName] = useState("");
    const [imageTag, setImageTag] = useState("");
    const [containerName, setContainerName] = useState("");
    const [networkName, setNetworkName] = useState("");
    const [volumeMappings, setVolumeMappings] = useState("");

    const create = async () => {
        const form = new FormData();
        form.append("server_id", serverId);
        if (applicationType) form.append("application_type", applicationType);
        if (projectName) form.append("project_name", projectName);
        if (repoUrl) form.append("repo_url", repoUrl);
        if (branch) form.append("branch", branch);
        if (repoFolder) form.append("repo_folder", repoFolder);
        if (dockerfilePath) form.append("dockerfile_path", dockerfilePath);
        if (imageName) form.append("image_name", imageName);
        if (imageTag) form.append("image_tag", imageTag);
        if (containerName) form.append("container_name", containerName);
        if (networkName) form.append("network_name", networkName);
        if (volumeMappings) form.append("volume_mappings", volumeMappings);

        const res = await api.post("/deployment", form);
        alert("Deployment record created");
        onCreated();
        onClose();
    };

    return (
        <div style={{ background: "#00000088", position: "fixed", inset: 0, zIndex: 1000 }}>
            <div style={{ background: "white", padding: 30, margin: 100, maxWidth: 400, zIndex: 1001 }}>
                <h3>New Deployment</h3>
                <div style={{ marginBottom: 8 }}>
                    <label>Application Type</label>
                    <input
                        type="text"
                        style={{ width: "100%" }}
                        value={applicationType}
                        onChange={(e) => setApplicationType(e.target.value)}
                    />
                </div>
                <div style={{ marginBottom: 8 }}>
                    <label>Project Name</label>
                    <input
                        type="text"
                        style={{ width: "100%" }}
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                    />
                </div>
                <div style={{ marginBottom: 8 }}>
                    <label>Repo URL</label>
                    <input
                        type="text"
                        style={{ width: "100%" }}
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                    />
                </div>
                <div style={{ marginBottom: 8 }}>
                    <label>Branch</label>
                    <input
                        type="text"
                        style={{ width: "100%" }}
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                    />
                </div>
                <div style={{ marginBottom: 8 }}>
                    <label>Repo Folder</label>
                    <input
                        type="text"
                        style={{ width: "100%" }}
                        value={repoFolder}
                        onChange={(e) => setRepoFolder(e.target.value)}
                    />
                </div>
                <div style={{ marginBottom: 8 }}>
                    <label>Dockerfile Path</label>
                    <input
                        type="text"
                        style={{ width: "100%" }}
                        value={dockerfilePath}
                        onChange={(e) => setDockerfilePath(e.target.value)}
                    />
                </div>
                <div style={{ marginBottom: 8 }}>
                    <label>Image Name</label>
                    <input
                        type="text"
                        style={{ width: "100%" }}
                        value={imageName}
                        onChange={(e) => setImageName(e.target.value)}
                    />
                </div>
                <div style={{ marginBottom: 8 }}>
                    <label>Image Tag</label>
                    <input
                        type="text"
                        style={{ width: "100%" }}
                        value={imageTag}
                        onChange={(e) => setImageTag(e.target.value)}
                    />
                </div>
                <div style={{ marginBottom: 8 }}>
                    <label>Container Name</label>
                    <input
                        type="text"
                        style={{ width: "100%" }}
                        value={containerName}
                        onChange={(e) => setContainerName(e.target.value)}
                    />
                </div>
                <div style={{ marginBottom: 8 }}>
                    <label>Network Name</label>
                    <input
                        type="text"
                        style={{ width: "100%" }}
                        value={networkName}
                        onChange={(e) => setNetworkName(e.target.value)}
                    />
                </div>
                <div style={{ marginBottom: 8 }}>
                    <label>Volume Mappings (JSON)</label>
                    <textarea
                        rows="3"
                        style={{ width: "100%" }}
                        value={volumeMappings}
                        onChange={(e) => setVolumeMappings(e.target.value)}
                    />
                </div>
                <button onClick={create} style={{ marginRight: 10 }}>Create</button>
                <button onClick={onClose}>Cancel</button>
            </div>
        </div>
    );
}

export default NewDeploymentModal;
