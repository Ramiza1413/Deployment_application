def dynamic_deploy_script(deployment):
    """
    Generate a simple git-based deployment script using values stored
    on the `Deployment` record.  We no longer persist build/stop/run
    commands in the database, so the script only pulls the requested
    branch and leaves any further application-specific steps to be
    handled manually on the server.
    """
    return f"""#!/bin/bash
set -e

echo "===== DEPLOYMENT STARTED ====="
date

# Change into the working folder (should already exist)
cd {deployment.repo_folder}

# clone if repo missing
if [ ! -d ".git" ]; then
    echo "Cloning repository {deployment.repo_url}..."
    git clone {deployment.repo_url} .
else
    echo "Fetching latest changes from {deployment.branch}..."
    git fetch origin
    git checkout {deployment.branch}
    git pull origin {deployment.branch}
fi

# NOTE: any build/run steps must be configured on the server itself.

echo "===== DEPLOYMENT COMPLETED ====="
date
"""

import json

def docker_deploy_script(deployment):
    
    vol_flags = ""
    if deployment.volume_mappings:
        try:
            vols = deployment.volume_mappings
            if isinstance(vols, str):
                vols = json.loads(vols)

            if isinstance(vols, (list, tuple)):
                for v in vols:
                    vol_flags += f" -v {v}"
        except Exception:
            pass
    if deployment.application_type == "nginx":
        return f"""#!/bin/bash
set -e
set -o pipefail

echo "===== DEPLOYMENT STARTED ====="
date

echo "Building Docker image..."
docker build -t {deployment.image_name} -f ./Dockerfile.nginx .

echo "Stopping old container..."
docker stop {deployment.container_name} || true

echo "Removing old container..."
docker rm {deployment.container_name} || true

echo "Starting new container..."
docker run -d --network {deployment.network_name} --name {deployment.container_name}  --restart {deployment.restart_policy} -p 443:443  {vol_flags} {deployment.image_name}

echo "===== DEPLOYMENT COMPLETED ====="
date
"""


    # -----------------------
    # Volume flags
    # -----------------------

    # -----------------------
    # Optional flags
    # -----------------------
    cpu_flag = f'--cpus="{deployment.cpus}"' if deployment.cpus else "6.0"
    port_flag = f"-p {deployment.port_mapping}" if deployment.port_mapping else "8000:8000"
    alias_flag = f"--network-alias {deployment.network_alias}" if deployment.network_alias else "backend"
    restart_flag = f"--restart {deployment.restart_policy}" if deployment.restart_policy else "unless-stopped"

    image_tag = deployment.image_tag or ""

    return f"""#!/bin/bash
set -e
set -o pipefail

echo "===== DEPLOYMENT STARTED ====="
date

cd {deployment.repo_folder}

git fetch
git checkout {deployment.branch}
git pull origin {deployment.branch}

cd ..

echo "Building Docker image..."
docker build -t {deployment.image_name}:{image_tag} -f {deployment.dockerfile_path} {deployment.repo_folder}

echo "Stopping old container..."
docker stop {deployment.container_name} || true

echo "Removing old container..."
docker rm {deployment.container_name} || true

echo "Starting new container..."
docker run {cpu_flag} \
--network {deployment.network_name or "bridge"} \
--name {deployment.container_name} \
{alias_flag} \
{restart_flag} \
{port_flag} \
-d {vol_flags} \
{deployment.image_name}:{image_tag}

echo "===== DEPLOYMENT COMPLETED ====="
date
"""  
    
    