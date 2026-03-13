from fastapi import APIRouter, Depends, Form
from sqlalchemy.orm import Session
from datetime import datetime
from database import SessionLocal
from models import Server, Deployment, Deploymentlogs
from utils.security import get_current_user
from services.ssh_manager import ssh_manager
from services.deploy_templates import dynamic_deploy_script, docker_deploy_script
from services.deploy_utils import validate_git_access, ensure_ssh_key
from services.email_service import send_ssh_setup_email
from services.audit_service import log_action
from services.logs_ws import broadcast as ws_broadcast

router = APIRouter()


# -------------------------
# DB Dependency
# -------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

import json

def parse_volumes(vols):
    if not vols:
        return []

    # If already list → return
    if isinstance(vols, list):
        return vols

    # If string → clean and parse
    if isinstance(vols, str):
        try:
            # Remove extra wrapping quotes if present
            cleaned = vols.strip()

            # If wrapped in extra quotes
            if cleaned.startswith('"') and cleaned.endswith('"'):
                cleaned = cleaned[1:-1]

            return json.loads(cleaned)
        except Exception:
            return []

    return []
# -------------------------
# Deployment CRUD Endpoints
# -------------------------
@router.post("/deployment")
def create_deployment(
    server_id: int = Form(...),
    application_type: str = Form(...),
    project_name: str = Form(...),
    repo_url: str = Form(None),
    branch: str = Form("main"),
    repo_folder: str = Form(None),
    dockerfile_path: str = Form(None),
    image_name: str = Form(None),
    image_tag: str = Form(None),
    container_name: str = Form(None),
    network_name: str = Form(None),
    cpus: str = Form(None),
    port_mapping: str = Form(None),
    network_alias: str = Form(None),
    restart_policy: str = Form("unless-stopped"),
    volume_mappings: str = Form(None),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    parsed_volumes = parse_volumes(volume_mappings)

    new_dep = Deployment(
        server_id=server_id,
        user_id=current_user.id,
        application_type=application_type,
        project_name=project_name,
        repo_url=repo_url,
        branch=branch,
        repo_folder=repo_folder,
        dockerfile_path=dockerfile_path,
        image_name=image_name,
        image_tag=image_tag or "latest",
        container_name=container_name,
        network_name=network_name,
        cpus=cpus,
        port_mapping=port_mapping,
        network_alias=network_alias,
        restart_policy=restart_policy,
        volume_mappings=parsed_volumes,
    )

    db.add(new_dep)
    db.commit()
    db.refresh(new_dep)

    return {"deployment_id": new_dep.id}


@router.get("/deployment/{server_id}/info")
def get_deployments_by_server(
    server_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
    ):
    deployments = db.query(Deployment).filter(Deployment.server_id == server_id).all()

    if not deployments:
        return {"error": "No deployments found for this server"}

    return [
        {
            "id": dep.id,
            "server_id": dep.server_id,
            "application_type": dep.application_type,
            "project_name": dep.project_name,
            "repo_url": dep.repo_url,
            "branch": dep.branch,
            "repo_folder": dep.repo_folder,
            "dockerfile_path": dep.dockerfile_path,
            "image_name": dep.image_name,
            "image_tag": dep.image_tag,
            "container_name": dep.container_name,
            "network_name": dep.network_name,
            "cpus": dep.cpus,
            "port_mapping": dep.port_mapping,
            "network_alias": dep.network_alias,
            "restart_policy": dep.restart_policy,
            "volume_mappings": dep.volume_mappings,
            "created_at": dep.created_at.isoformat(),
        }
        for dep in deployments
    ]

@router.put("/deployment/{deployment_id}")
def update_deployment(
    deployment_id: int,
    application_type: str = Form(None),
    project_name: str = Form(None),
    repo_url: str = Form(None),
    branch: str = Form(None),
    repo_folder: str = Form(None),
    dockerfile_path: str = Form(None),
    image_name: str = Form(None),
    image_tag: str = Form(None),
    container_name: str = Form(None),
    network_name: str = Form(None),
    cpus: str = Form(None),
    port_mapping: str = Form(None),
    network_alias: str = Form(None),
    restart_policy: str = Form(None),
    volume_mappings: str = Form(None),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
    ):
    dep = db.query(Deployment).filter(Deployment.id == deployment_id).first()
    if not dep:
        return {"error": "not found"}

    parsed_volumes = parse_volumes(volume_mappings) if volume_mappings is not None else None

    if application_type is not None:
        dep.application_type = application_type
    if project_name is not None:
        dep.project_name = project_name
    if repo_url is not None:
        dep.repo_url = repo_url
    if branch is not None:
        dep.branch = branch
    if repo_folder is not None:
        dep.repo_folder = repo_folder
    if dockerfile_path is not None:
        dep.dockerfile_path = dockerfile_path
    if image_name is not None:
        dep.image_name = image_name
    if image_tag is not None:
        dep.image_tag = image_tag
    if container_name is not None:
        dep.container_name = container_name
    if network_name is not None:
        dep.network_name = network_name
    if cpus is not None:
        dep.cpus = cpus
    if port_mapping is not None:
        dep.port_mapping = port_mapping
    if network_alias is not None:
        dep.network_alias = network_alias
    if restart_policy is not None:
        dep.restart_policy = restart_policy
    if volume_mappings is not None:
        dep.volume_mappings = parsed_volumes

    db.commit()

    return {"status": "updated"}

# -------------------------
# Trigger deployment run
# -------------------------
import asyncio
from datetime import datetime
from sqlalchemy.orm import Session

from models import Server, Deployment, Deploymentlogs
from services.ssh_manager import ssh_manager
from services.deploy_templates import dynamic_deploy_script, docker_deploy_script
from services.deploy_utils import validate_git_access
from services.logs_ws import broadcast
from services.audit_service import log_action
import pytz
import uuid




async def run_deployment(db: Session, deployment_id: int, user_id: int, log_id: int):

    deployment = db.query(Deployment).filter(Deployment.id == deployment_id).first()
    server = db.query(Server).filter(Server.id == deployment.server_id).first()
    deployment_log = db.query(Deploymentlogs).filter(Deploymentlogs.id == log_id).first()

    logs = []

    async def push_log(msg: str):
        logs.append(msg)
        await broadcast(log_id, msg)

    try:

        await push_log("===== DEPLOYMENT STARTED =====")
        await push_log(f"Server: {server.name}")
        await push_log(f"Triggered By: User {user_id}")
        await push_log(f"Time: {datetime.utcnow()}")
        await push_log("")

        # SSH connection
        await push_log("[STEP 1] Establishing SSH connection...")
        ssh = ssh_manager.get_connection(server, db, user_id, force_new=True)
        await push_log("SSH connection successful.")
        await push_log("")

        # Git validation
        await push_log("[STEP 2] Validating Git access...")
        valid, git_error = validate_git_access(ssh, deployment.repo_url or "")

        if not valid:
            await push_log("Git validation failed")
            await push_log(str(git_error))

            deployment_log.status = "failed"
            deployment_log.logs = "\n".join(logs)
            ist = pytz.timezone("Asia/Kolkata")
            deployment_log.completed_at = datetime.now(ist)
            # deployment_log.completed_at = datetime.utcnow()
            db.commit()
            return

        await push_log("Git validation successful.")
        await push_log("")

        # Prepare script

        await push_log("[STEP 3] Preparing deployment script...")

        script_name = f"deploy_{deployment.application_type}.sh"
        remote_path = f"{server.app_path}/{script_name}"

        # Get last successful deployment time
        last_deploy = db.query(Deploymentlogs).filter(
            Deploymentlogs.deployment_id == deployment.id,
            Deploymentlogs.status == "completed"
        ).order_by(Deploymentlogs.completed_at.desc()).first()

        script_exists = False

        check_cmd = f"cd {server.app_path} && test -f {script_name} && echo OK"
        stdin, stdout, stderr = ssh.exec_command(check_cmd, get_pty=True)
        exists = stdout.read().decode().strip()

        if exists == "OK":
            script_exists = True

        recreate_script = False

        if script_exists:
            if last_deploy and deployment.updated_at and deployment.updated_at > last_deploy.completed_at:
                recreate_script = True
                await push_log("Deployment config updated. Recreating script.")

                random_name = f"{script_name}.{uuid.uuid4().hex[:6]}"
                rename_cmd = f"sudo mv {remote_path} {server.app_path}/{random_name}"
                ssh.exec_command(rename_cmd)

                await push_log(f"Old script renamed to {random_name}")

        else:
            recreate_script = True

        # Create new script if needed
        if recreate_script:

            if server.deploy_type.lower() == "docker":
                script_content = docker_deploy_script(deployment)
            else:
                script_content = dynamic_deploy_script(deployment)

            ssh.exec_command(
                f"echo '{script_content}' | sudo tee {remote_path} > /dev/null"
            )

            ssh.exec_command(f"sudo chmod +x {remote_path}")

            await push_log("New deployment script created.")

        else:
            await push_log("Existing deployment script reused.")

        await push_log("")

        # Execute deployment
        await push_log("[STEP 4] Executing deployment script...")

        command = f"sudo bash -c 'cd {server.app_path} && stdbuf -oL -eL bash {script_name}'"

        stdin, stdout, stderr = ssh.exec_command(command, get_pty=True)

        channel = stdout.channel

        await push_log("----- SCRIPT OUTPUT -----")

        while not channel.exit_status_ready():
            # Check for cancellation flag in DB
            db.refresh(deployment_log)
            if deployment_log.status == "cancelling":
                await push_log("\n[!] CANCELLATION DETECTED. Killing remote processes...")
                
                # Kill the process group using the PID file
                kill_cmd = f"sudo bash -c 'if [ -f {pid_file} ]; then PID=$(cat {pid_file}); kill -TERM -$PID; rm {pid_file}; fi'"
                ssh.exec_command(kill_cmd)
                
                deployment_log.status = "cancelled"
                ist = pytz.timezone("Asia/Kolkata")
                deployment_log.completed_at = datetime.now(ist)
                # deployment_log.completed_at = datetime.utcnow()
                deployment_log.logs = "\n".join(logs)
                db.commit()
                ssh.close()
                return

            # Read stream
            if channel.recv_ready():
                data = channel.recv(1024).decode(errors='replace')
                for line in data.splitlines():
                    await push_log(line)
            
            await asyncio.sleep(0.5)

        exit_status = channel.recv_exit_status()

        await push_log("-------------------------")
        await push_log(f"Exit Status: {exit_status}")
        await push_log("")

        # Finalize
        if exit_status == 0:
            deployment_log.status = "completed"
            await push_log("===== DEPLOYMENT COMPLETED SUCCESSFULLY =====")
        else:
            deployment_log.status = "failed"
            await push_log("===== DEPLOYMENT FAILED =====")

        deployment_log.logs = "\n".join(logs)
        ist = pytz.timezone("Asia/Kolkata")
        deployment_log.completed_at = datetime.now(ist)
        # deployment_log.completed_at = datetime.utcnow()

        db.commit()

        ssh.close()

        log_action(db, user_id, deployment_log.status.upper(), "DEPLOYMENT", deployment_id)

    except Exception as e:

        await push_log("===== DEPLOYMENT CRASHED =====")
        await push_log(str(e))

        deployment_log.status = "failed"
        deployment_log.logs = "\n".join(logs)
        deployment_log.error = str(e)
        ist = pytz.timezone("Asia/Kolkata")
        deployment_log.completed_at = datetime.now(ist)
        # deployment_log.completed_at = datetime.utcnow()

        db.commit()
        
from fastapi import BackgroundTasks
# from services.deploy_runner import run_deployment


@router.post("/deploy/{deployment_id}")
async def deploy(
    deployment_id: int,
    background_tasks: BackgroundTasks,
    change_note: str = Form(None),
    message: str = Form("Manual deployment"),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
    ):
    # 1. Fetch the deployment config
    deployment = db.query(Deployment).filter(Deployment.id == deployment_id).first()

    if not deployment:
        return {"error": "Deployment not found"}

    # 2. SERVER LOCK CHECK
    # Check if ANY deployment is currently running on this specific server
    active_task = db.query(Deploymentlogs).filter(
        Deploymentlogs.server_id == deployment.server_id,
        Deploymentlogs.status.in_(["started", "cancelling"]),
        Deploymentlogs.completed_at.is_(None)
    ).first()

    if active_task:
        return {
            "error": "Server Busy", 
            "detail": f"This server is currently busy with deployment #{active_task.deployment_id}. Please wait."
        }

    # 3. Create the log entry
    # FIX: Changed server.id to deployment.server_id
    deployment_log = Deploymentlogs(
        deployment_id=deployment.id,
        server_id=deployment.server_id, 
        user_id=current_user.id,
        status="started",
        started_at=datetime.utcnow(),
        change_note=change_note,
        message=message,
        branch=deployment.branch,
    )

    db.add(deployment_log)
    db.commit()
    db.refresh(deployment_log)

    # 4. Log the action in audit service
    log_action(db, current_user.id, "START", "DEPLOYMENT", deployment.id)

    # 5. Run deployment in background
    background_tasks.add_task(
        run_deployment, # Ensure this function name matches your background logic
        db,
        deployment.id,
        current_user.id,
        deployment_log.id
    )

    return {
        "status": "started",
        "deployment_id": deployment.id,
        "deployment_log_id": deployment_log.id
    }
    
    
@router.post("/deployment/cancel/{log_id}")
async def cancel_deployment(
    log_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    log = db.query(Deploymentlogs).filter(Deploymentlogs.id == log_id).first()
    if not log:
        return {"error": "Log not found"}
    
    if log.status != "started":
        return {"error": f"Cannot cancel deployment in '{log.status}' state"}

    # Set status to 'cancelling'. 
    # The background task loop will pick this up and kill the process.
    log.status = "cancelling"
    db.commit()
    
    return {"message": "Cancellation command sent to server"}

@router.get("/deployment/log/{log_id}")
def get_deployment_log_detail(
    log_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = db.query(Deploymentlogs).filter(Deploymentlogs.id == log_id).first()
    if not log:
        return {"error": "Log not found"}

    return {
        "id": log.id,
        "deployment_id": log.deployment_id,
        "server_id": log.server_id,
        "status": log.status,
        "started_at": log.started_at.isoformat() if log.started_at else None,
        "completed_at": log.completed_at.isoformat() if log.completed_at else None,
        "branch": log.branch,
        "commit_hash": log.commit_hash,
        "change_note": log.change_note,
        "message": log.message,
        "logs": log.logs,
        "error": log.error,
    }      
              
@router.get("/deployment/{deployment_id}")
def get_deployment_status(
    deployment_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    deployment = db.query(Deployment).filter(
        Deployment.id == deployment_id
    ).first()

    if not deployment:
        return {"error": "Not found"}

    # Get the deployment logs
    deployment_log = db.query(Deploymentlogs).filter(
        Deploymentlogs.deployment_id == deployment_id
    ).order_by(Deploymentlogs.id.desc()).first()

    # Log deployment status view
    log_action(db, current_user.id, "VIEW", "DEPLOYMENT", deployment.id)

    return {
        "status": deployment_log.status if deployment_log else "unknown",
        "logs": deployment_log.logs if deployment_log else None,
        "commit": deployment_log.commit_hash if deployment_log else None,
        "deployment_log_id": deployment_log.id if deployment_log else None,
    }
