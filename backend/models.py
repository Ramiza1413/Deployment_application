from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from database import Base

# ================= USERS =================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True)
    email = Column(String, unique=True)
    password = Column(String)
    is_admin = Column(Boolean, default=False)
    groups = relationship(
        "Group",
        secondary="user_groups",
        backref="users"
    )



# Requirement: Limit login to 2 sessions
class UserSession(Base):
    __tablename__ = "user_sessions"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    token = Column(String, unique=True, index=True)
    is_active = Column(Boolean, default=True)

    expires_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime, default=datetime.utcnow)

# ================= GROUPS =================
class Group(Base):
    __tablename__ = "groups"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True)

class UserGroup(Base):
    __tablename__ = "user_groups"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    group_id = Column(Integer, ForeignKey("groups.id"))

# ================= SERVERS =================
class Server(Base):
    __tablename__ = "servers"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    host = Column(String)
    username = Column(String)
    pem_path = Column(String)
    app_path = Column(String)
    deploy_type = Column(String)
    
class ServerGroup(Base):
    __tablename__ = "server_groups"
    id =  Column(Integer, primary_key=True)
    server_id = Column(Integer, ForeignKey("servers.id"))
    group_id = Column(Integer, ForeignKey("groups.id"))
    

# ================= DEPLOYMENT =================
class Deployment(Base):
    __tablename__ = "deployments"
    id = Column(Integer, primary_key=True, index=True)
    application_type = Column(String(50), nullable=False)
    server_id = Column(Integer, ForeignKey("servers.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    project_name = Column(String(100), nullable=False)
    repo_url = Column(String(255), nullable=True)
    branch = Column(String(100), default="main")
    repo_folder = Column(String(255), nullable=True)
    dockerfile_path = Column(String(255), nullable=False)
    image_name = Column(String(100), nullable=True)
    image_tag = Column(String(50), nullable=True)
    container_name = Column(String(100), nullable=True)
    network_name = Column(String(100), nullable=True)
    volume_mappings = Column(JSON, nullable=True) # Postgres handles this as JSONB
    script_path = Column(String(255), nullable=True)
    cpus = Column(String(20), nullable=True)
    port_mapping = Column(String(100), nullable=True)
    network_alias = Column(String(100), nullable=True)
    restart_policy = Column(String(50), nullable=True, default="unless-stopped")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

# ================= DEPLOYMENT LOGS =================
class Deploymentlogs(Base):
    __tablename__ = "deployment_logs"
    id = Column(Integer, primary_key=True)
    deployment_id = Column(Integer, ForeignKey("deployments.id"), nullable=True)
    server_id = Column(Integer, ForeignKey("servers.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    status = Column(String)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)
    change_note = Column(Text)
    logs = Column(Text)
    error = Column(Text)
    branch = Column(String, nullable=True)
    commit_hash = Column(String, nullable=True)
    message = Column(Text, nullable=True)

    user = relationship("User")
    server = relationship("Server")
    deployment = relationship("Deployment")

# ================= AUDIT LOG =================
class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    action = Column(String)
    entity_type = Column(String)
    entity_id = Column(Integer)
    timestamp = Column(DateTime, default=datetime.utcnow)