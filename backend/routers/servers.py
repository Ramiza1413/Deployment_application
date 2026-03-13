from fastapi import APIRouter, Depends, Form, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Server, Deployment, Deploymentlogs, UserGroup, ServerGroup
from utils.security import get_current_user
import os
import shutil
from services.audit_service import log_action

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


from fastapi import File, UploadFile, Form
import os
import shutil
@router.get("/servers")
def list_servers(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.is_admin:
        servers = db.query(Server).all()
    else:
        servers = (
            db.query(Server)
            .join(ServerGroup, Server.id == ServerGroup.server_id)
            .join(UserGroup, ServerGroup.group_id == UserGroup.group_id)
            .filter(UserGroup.user_id == current_user.id)
            .distinct()
            .all()
        )

    result = []

    for server in servers:
        # Get groups for each server
        groups = (
            db.query(ServerGroup)
            .filter(ServerGroup.server_id == server.id)
            .all()
        )

        group_ids = [g.group_id for g in groups]

        result.append({
            "id": server.id,
            "name": server.name,
            "username": server.username,
            "app_path": server.app_path,
            "pem_path": server.pem_path,
            "host": server.host,
            "deploy_type": server.deploy_type,
            "groups": group_ids
        })

    return result


@router.get("/deployment-scripts/{server_id}")
def get_deployment_scripts(
    server_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # server existence check
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # RBAC same as other endpoints
    if not current_user.is_admin and not user_has_server_access(db, current_user.id, server_id):
        raise HTTPException(status_code=403, detail="Access denied")

    deps = db.query(Deployment).filter(Deployment.server_id == server_id).all()
    result = []
    for dep in deps:
        result.append({
            "id": dep.id,
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
            "volume_mappings": dep.volume_mappings,
        })
    return result

def user_has_server_access(db: Session, user_id: int, server_id: int) -> bool:
    access = (
        db.query(ServerGroup)
        .join(UserGroup, ServerGroup.group_id == UserGroup.group_id)
        .filter(
            ServerGroup.server_id == server_id,
            UserGroup.user_id == user_id
        )
        .first()
    )

    return access is not None

@router.get("/deployments/{server_id}")
def get_server_deployments(
    server_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
    ):
    # =========================
    # Check server exists
    # =========================
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # =========================
    # RBAC Access Control
    # =========================
    if not current_user.is_admin:
        if not user_has_server_access(db, current_user.id, server_id):
            raise HTTPException(status_code=403, detail="Access denied")

    # =========================
    # Fetch Deployment Logs
    # =========================
    deployment_logs = (
        db.query(Deploymentlogs)
        .filter(Deploymentlogs.server_id == server_id)
        .order_by(Deploymentlogs.started_at.desc())
        .all()
    )

    # =========================
    # Audit Log
    # =========================
    log_action(db, current_user.id, "VIEW", "DEPLOYMENTS", server_id)

    # =========================
    # Response
    # =========================
    return [
        {
            "id": d.id,
            "deployment_id": d.deployment_id,
            "status": d.status,
            "commit_hash": d.commit_hash,
            "started_at": d.started_at.isoformat() if d.started_at else None,
            "completed_at": d.completed_at.isoformat() if d.completed_at else None,
            "logs": d.logs,
            "change_note": d.change_note,
            "error": d.error,
            "message": d.message,
            "branch": d.branch,
            "user_id": d.user_id,
            "volume_mappings": d.deployment.volume_mappings if d.deployment else None
        }
        for d in deployment_logs
    ]

@router.post("/servers")
async def create_server(
    name: str = Form(...),
    host: str = Form(...),
    username: str = Form(...),
    app_path: str = Form(...),
    deploy_type: str = Form(...),
    pem_file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):

    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    os.makedirs("secure_keys", exist_ok=True)

    # Prevent filename conflicts
    unique_filename = f"{name}_{pem_file.filename}"
    file_path = f"secure_keys/{unique_filename}"
    if os.path.exists(file_path):
        os.remove(file_path)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(pem_file.file, buffer)

    os.chmod(file_path, 0o400)

    new_server = Server(
        name=name,
        host=host,
        username=username,
        pem_path=file_path,
        app_path=app_path,
        deploy_type=deploy_type
    )

    db.add(new_server)      # ✅ Add to session
    db.commit()             # ✅ Save to DB
    db.refresh(new_server)

    # Log server creation
    log_action(db, current_user.id, "CREATE", "SERVER", new_server.id)

    return {"message": "Server created successfully"}

@router.put("/servers/{server_id}")
async def update_server(
    server_id: int,
    name: str = Form(...),
    host: str = Form(...),
    username: str = Form(...),
    app_path: str = Form(...),
    deploy_type: str = Form(...),
    pem_file: UploadFile = File(None),  # 👈 optional
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):

    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    server = db.query(Server).filter(Server.id == server_id).first()

    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # =============================
    # If new PEM file uploaded
    # =============================
    if pem_file:
        os.makedirs("secure_keys", exist_ok=True)

        # Prevent filename conflicts
        unique_filename = f"{name}_{pem_file.filename}"
        file_path = f"secure_keys/{unique_filename}"
        if server.pem_path and os.path.exists(server.pem_path):
            os.chmod(server.pem_path, 0o600)
            os.remove(server.pem_path)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(pem_file.file, buffer)

        os.chmod(file_path, 0o400)

        # Remove old key safely

        server.pem_path = file_path

    # =============================
    # Update fields
    # =============================
    server.name = name
    server.host = host
    server.username = username
    server.app_path = app_path
    server.deploy_type = deploy_type

    db.commit()

    # Log server update
    log_action(db, current_user.id, "UPDATE", "SERVER", server.id)

    return {"message": "Server updated successfully"}

@router.post("/servers/test-ssh")
async def test_ssh_connection(
    host: str = Form(...),
    username: str = Form(...),
    pem_file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    ):
    import paramiko, os, shutil

    key_path = f"temp_keys/{pem_file.filename}"
    
    os.makedirs("temp_keys", exist_ok=True)
    
    with open(key_path, "wb") as f:
        shutil.copyfileobj(pem_file.file, f)

    try:
        key = paramiko.RSAKey.from_private_key_file(key_path)
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(hostname=host, username=username, pkey=key, timeout=5)
        ssh.close()
        os.remove(key_path)
        return {"status": True}
    except:
        os.remove(key_path)
        return {"status": False}
    
import os
import boto3
from dotenv import load_dotenv

load_dotenv()

ec2 = boto3.client(
    "ec2",
    region_name=os.getenv("AWS_DEFAULT_REGION"),
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
)    

def get_instance_by_public_ip(public_ip: str):
    response = ec2.describe_instances(
        Filters=[
            {
                "Name": "ip-address",
                "Values": [public_ip]
            }
        ]
    )

    for reservation in response["Reservations"]:
        for instance in reservation["Instances"]:
            return {
                "instance_id": instance["InstanceId"],
                "state": instance["State"]["Name"]
            }

    return None

@router.get("/ec2/status/{public_ip}")
def get_status(public_ip: str):
    instance = get_instance_by_public_ip(public_ip)

    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")

    return {
        "public_ip": public_ip,
        "instance_id": instance["instance_id"],
        "status": instance["state"]
    }

@router.post("/ec2/start/{public_ip}")
def start_server(public_ip: str):
    instance = get_instance_by_public_ip(public_ip)

    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")

    ec2.start_instances(InstanceIds=[instance["instance_id"]])

    return {
        "message": "Instance starting",
        "instance_id": instance["instance_id"]
    }

@router.post("/ec2/stop/{public_ip}")
def stop_server(public_ip: str):
    instance = get_instance_by_public_ip(public_ip)

    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")

    ec2.stop_instances(InstanceIds=[instance["instance_id"]])

    return {
        "message": "Instance stopping",
        "instance_id": instance["instance_id"]
    }
