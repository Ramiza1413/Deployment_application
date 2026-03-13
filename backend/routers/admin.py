from fastapi import APIRouter, Depends, Form, HTTPException
from sqlalchemy.orm import Session
from database import SessionLocal
from models import User, Group, UserGroup, ServerGroup, Server,AuditLog
from utils.security import get_current_user, hash_password
from services.audit_service import log_action
router = APIRouter()


# =========================
# DB Dependency
# =========================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =========================
# ADMIN CHECK
# =========================
def admin_required(current_user=Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return current_user


# =========================
# USERS
# =========================

@router.get("/users")
def list_users(
    current_user=Depends(admin_required),
    db: Session = Depends(get_db)
):
    return db.query(User).all()


@router.post("/users")
def create_user(
    username: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    is_admin: bool = Form(False),
    current_user=Depends(admin_required),
    db: Session = Depends(get_db)
    ):
    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")

    new_user = User(
        username=username,
        email=email,
        password=hash_password(password),
        is_admin=is_admin
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    log_action(db, current_user.id, "CREATE", "USER", new_user.id)

    return {
        "id": new_user.id,
        "username": new_user.username,
        "email": new_user.email
    }
# =========================
# GROUPS
# =========================

@router.get("/groups")
def list_groups(
    current_user=Depends(admin_required),
    db: Session = Depends(get_db)
):
    return db.query(Group).all()

@router.get("/groups/{group_id}/users")
def get_group_users(
    group_id: int,
    current_user=Depends(admin_required),
    db: Session = Depends(get_db)
    ):
    users = (
        db.query(User)
        .join(UserGroup, User.id == UserGroup.user_id)
        .filter(UserGroup.group_id == group_id)
        .all()
    )

    return users


@router.post("/groups")
def create_group(
    name: str = Form(...),
    current_user=Depends(admin_required),
    db: Session = Depends(get_db)
):
    existing = db.query(Group).filter(Group.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Group already exists")

    group = Group(name=name)
    db.add(group)
    db.commit()
    db.refresh(group)

    log_action(db, current_user.id, "CREATE", "GROUP", group.id)

    return {
        "id": group.id,
        "name": group.name
    }


# =========================
# USER → GROUP ASSIGN
# =========================
@router.delete("/remove-user-group")
def remove_user_group(
    user_id: int = Form(...),
    group_id: int = Form(...),
    current_user=Depends(admin_required),
    db: Session = Depends(get_db)
):
    mapping = db.query(UserGroup).filter(
        UserGroup.user_id == user_id,
        UserGroup.group_id == group_id
    ).first()

    if not mapping:
        raise HTTPException(status_code=404)

    db.delete(mapping)
    db.commit()

    log_action(db, current_user.id, "REMOVE", "USER_GROUP", user_id)

    return {"message": "User removed from group"}

@router.post("/assign-user-group")
def assign_user_group(
    user_id: int = Form(...),
    group_id: int = Form(...),
    current_user=Depends(admin_required),
    db: Session = Depends(get_db)
):
    existing = db.query(UserGroup).filter(
        UserGroup.user_id == user_id,
        UserGroup.group_id == group_id
    ).first()

    if existing:
        return {"message": "Already assigned"}

    mapping = UserGroup(user_id=user_id, group_id=group_id)
    db.add(mapping)
    db.commit()
    log_action(db, current_user.id, "ASSIGN", "USER_GROUP", mapping.id)
    return {"message": "User assigned to group"}


# =========================
# SERVER → GROUP ASSIGN
# =========================

@router.post("/assign-server-group")
def assign_server_group(
    server_id: int = Form(...),
    group_id: int = Form(...),
    current_user=Depends(admin_required),
    db: Session = Depends(get_db)
):
    existing = db.query(ServerGroup).filter(
        ServerGroup.server_id == server_id,
        ServerGroup.group_id == group_id
    ).first()

    if existing:
        return {"message": "Already assigned"}

    mapping = ServerGroup(server_id=server_id, group_id=group_id)
    db.add(mapping)
    db.commit()
    log_action(db, current_user.id, "ASSIGN", "SERVER_GROUP", server_id)
    return {"message": "Server assigned to group"}

@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    current_user=Depends(admin_required),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404)

    db.delete(user)
    db.commit()

    log_action(db, current_user.id, "DELETE", "USER", user_id)

    return {"message": "User deleted"}

@router.delete("/groups/{group_id}")
def delete_group(
    group_id: int,
    current_user=Depends(admin_required),
    db: Session = Depends(get_db)
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404)

    db.delete(group)
    db.commit()

    log_action(db, current_user.id, "DELETE", "GROUP", group_id)

    return {"message": "Group deleted"}

@router.delete("/servers/{server_id}")
def delete_server(
    server_id: int,
    current_user=Depends(admin_required),
    db: Session = Depends(get_db)
):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404)

    db.delete(server)
    db.commit()

    log_action(db, current_user.id, "DELETE", "SERVER", server_id)

    return {"message": "Server deleted"}

from fastapi import Query
from sqlalchemy import func

@router.get("/audit-logs")
def get_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    current_user=Depends(admin_required),
    db: Session = Depends(get_db)
):
    total = db.query(func.count(AuditLog.id)).scalar()

    logs = (
        db.query(AuditLog)
        .order_by(AuditLog.timestamp.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "data": logs
    }
