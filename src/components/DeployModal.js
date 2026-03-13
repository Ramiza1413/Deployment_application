import { useState } from "react";

function DeployModal({ onClose, onDeploy }) {
    const [note, setNote] = useState("");
    const [repoUrl, setRepoUrl] = useState("");
    const [branch, setBranch] = useState("main");
    const [repoFolder, setRepoFolder] = useState("");
    const [dockerfilePath, setDockerfilePath] = useState("");
    const [imageName, setImageName] = useState("");
    const [imageTag, setImageTag] = useState("");
    const [containerName, setContainerName] = useState("");
    const [networkName, setNetworkName] = useState("");

    const deploy = () => {
        onDeploy({
            change_note: note,
            repo_url: repoUrl,
            branch,
            repo_folder: repoFolder,
            dockerfile_path: dockerfilePath,
            image_name: imageName,
            image_tag: imageTag,
            container_name: containerName,
            network_name: networkName,
        });
        onClose();
    };

    return (
        <div style={{ background: "#00000088", position: "fixed", inset: 0, zIndex: 1000 }}>
            <div style={{ background: "white", padding: 30, margin: 100, maxWidth: 400, zIndex: 1001 }}>
                <h3>Deployment Details</h3>

                <div style={{ marginBottom: 8 }}>
                    <label>Change Note</label>
                    <textarea
                        rows="2"
                        style={{ width: "100%" }}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
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
                    <label>Repository Folder</label>
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

                <button onClick={deploy} style={{ marginRight: 10 }}>Deploy</button>
                <button onClick={onClose}>Cancel</button>
            </div>
        </div>
    );
}

export default DeployModal;