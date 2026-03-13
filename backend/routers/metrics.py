from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Server
from utils.security import get_current_user
from services.ssh_service import ssh_connect
from services.ssh_manager import ssh_manager
from services.audit_service import log_action

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

from services.ssh_manager import ssh_manager

from fastapi import HTTPException
import paramiko
from datetime import datetime, timedelta, timezone
import boto3
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

router = APIRouter()

cloudwatch = boto3.client(
    "cloudwatch",
    region_name=os.getenv("AWS_DEFAULT_REGION"),
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
)

ec2 = boto3.client(
    "ec2",
    region_name=os.getenv("AWS_DEFAULT_REGION"),
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
)


def get_metric(instance_id, metric_name, start, end, namespace="AWS/EC2"):
    response = cloudwatch.get_metric_statistics(
        Namespace=namespace,
        MetricName=metric_name,
        Dimensions=[{"Name": "InstanceId", "Value": instance_id}],
        StartTime=start,
        EndTime=end,
        Period=300,
        Statistics=["Average"]
    )

    datapoints = sorted(response["Datapoints"], key=lambda x: x["Timestamp"])

    return [
        {
            "timestamp": point["Timestamp"].isoformat(),
            "value": round(point["Average"], 2)
        }
        for point in datapoints
    ]

def get_system_usage(ssh):
    # -------------------------
    # RAM
    # -------------------------
    stdin, stdout, stderr = ssh.exec_command(
        "free | awk '/Mem:/ {printf \"%.2f %.2f %.2f\", $3/1024, $2/1024, $3/$2 * 100}'"
    )

    ram_output = stdout.read().decode().strip()
    used_ram, total_ram, ram_percent = ram_output.split()

    used_ram = float(used_ram)
    total_ram = float(total_ram)
    ram_percent = float(ram_percent)

    # -------------------------
    # DISK
    # -------------------------
    stdin, stdout, stderr = ssh.exec_command(
        "df -BG / | awk 'NR==2 {print $3,$2,$5}'"
    )

    disk_output = stdout.read().decode().strip()
    used_disk, total_disk, disk_percent = disk_output.split()

    used_disk = float(used_disk.replace("G", ""))
    total_disk = float(total_disk.replace("G", ""))
    disk_percent = float(disk_percent.replace("%", ""))

    return {
        "ram": {
            "used_gb": round(used_ram, 2),
            "total_gb": round(total_ram, 2),
            "percent": round(ram_percent, 2)
        },
        "disk": {
            "used_gb": used_disk,
            "total_gb": total_disk,
            "percent": disk_percent
        }
    }
    
@router.get("/server/{server_id}/system")
def get_system_usage_api(
    server_id: int,
    db: Session = Depends(get_db)
):
    server = db.query(Server).filter(Server.id == server_id).first()

    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    try:
        ssh = ssh_manager.get_connection(server, db, None)
        usage = get_system_usage(ssh)

        return {
            "server_id": server_id,
            "ram": usage["ram"],
            "disk": usage["disk"]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from datetime import datetime, timezone
from fastapi import Query

@router.get("/server/{server_id}/metrics")
def get_metrics(
    server_id: int,
    start_time: str = Query(None),
    end_time: str = Query(None),
    db: Session = Depends(get_db)
    ):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    try:
        # Convert input times (ISO format)
        if start_time and end_time:
            start = datetime.fromisoformat(start_time).replace(tzinfo=timezone.utc)
            end = datetime.fromisoformat(end_time).replace(tzinfo=timezone.utc)
        else:
            # Default → last 1 hour
            end = datetime.now(timezone.utc)
            start = end - timedelta(hours=1)

        # Get instance ID
        response = ec2.describe_instances(
            Filters=[{"Name": "ip-address", "Values": [server.host]}]
        )

        instance_id = response["Reservations"][0]["Instances"][0]["InstanceId"]
        

        cpu = get_metric(instance_id, "CPUUtilization", start, end)
        disk_read = get_metric(instance_id, "VolumeReadBytes", start, end)
        disk_write = get_metric(instance_id, "VolumeWriteBytes", start, end)
        # ram = get_metric(instance_id, "mem_used_percent", start, end, namespace="CWAgent")
        network_in = get_metric(instance_id, "NetworkIn", start, end)
        network_out = get_metric(instance_id, "NetworkOut", start, end)
        
        ssh = ssh_manager.get_connection(server, db, None)

        return {
            "instance_id": instance_id,
            "cpu": cpu,
            "disk_read": disk_read,
            "disk_write": disk_write,
            "network_in": network_in,
            "network_out": network_out
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@router.post("/server/{server_id}/disconnect")
def disconnect_server(server_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    ssh_manager.close_connection(server_id)
    log_action(db, current_user.id, "DISCONNECT", "SSH", server_id)
    return {"message": "Disconnected"}


# from fastapi import APIRouter, HTTPException
import json

# router = APIRouter()

@router.get("/server/{server_id}/docker/containers")
def docker_ps(
    server_id: int,
    db: Session = Depends(get_db)
):

    server = db.query(Server).filter(Server.id == server_id).first()

    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    try:
        ssh = ssh_manager.get_connection(server, db, None)

        cmd = "sudo docker ps --format '{{json .}}'"
        stdin, stdout, stderr = ssh.exec_command(cmd)

        lines = stdout.read().decode().splitlines()

        containers = [json.loads(line) for line in lines]

        return {
            "server_id": server_id,
            "containers": containers
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.post("/server/{server_id}/docker/prune")
def docker_prune(
    server_id: int,
    db: Session = Depends(get_db)
):

    server = db.query(Server).filter(Server.id == server_id).first()

    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    try:
        ssh = ssh_manager.get_connection(server, db, None)

        cmd = "docker system prune -af"
        stdin, stdout, stderr = ssh.exec_command(cmd)

        output = stdout.read().decode()
        error = stderr.read().decode()

        return {
            "server_id": server_id,
            "status": "completed",
            "output": output,
            "error": error
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    