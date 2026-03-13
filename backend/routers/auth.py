from fastapi import APIRouter, Depends, Form, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from database import SessionLocal
from models import User, UserSession
from utils.security import verify_password, create_access_token, get_current_user, hash_password
from services.audit_service import log_action

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------
# LOGIN (max 2 sessions)
# ---------------------------
@router.post("/login")
def login(
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):

    user = db.query(User).filter(User.username == username).first()

    if not user or not verify_password(password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # deactivate expired sessions
    db.query(UserSession).filter(
        UserSession.expires_at < datetime.utcnow()
    ).update({"is_active": False})

    # count active sessions
    active_sessions = db.query(UserSession).filter(
        UserSession.user_id == user.id,
        UserSession.is_active == True
    ).count()

    if active_sessions >= 2:
        raise HTTPException(
            status_code=403,
            detail="Maximum 2 active sessions allowed"
        )

    # create token
    token, expire = create_access_token(user.id)

    # store session
    session = UserSession(
        user_id=user.id,
        token=token,
        expires_at=expire,
        is_active=True
    )

    db.add(session)
    db.commit()

    # log action
    log_action(db, user.id, "LOGIN", "USER", user.id)

    return {"access_token": token}


# ---------------------------
# LOGOUT
# ---------------------------
from utils.security import oauth2_scheme
@router.post("/logout")
def logout(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):

    session = db.query(UserSession).filter(
        UserSession.token == token
    ).first()

    if session:
        session.is_active = False
        db.commit()

    return {"message": "Logged out"}

@router.post("/logout-all")
def logout_all(
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):

    user = db.query(User).filter(User.username == username).first()

    if not user or not verify_password(password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    db.query(UserSession).filter(
        UserSession.user_id == user.id
    ).update({"is_active": False})

    db.commit()

    return {"message": "All sessions cleared"}


# ---------------------------
# CREATE USER (admin only)
# ---------------------------
@router.post("/create-user")
def create_user(
    username: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    is_admin: bool = Form(False),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):

    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only admin can create users")

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

    log_action(db, current_user.id, "CREATE", "USER", new_user.id)

    return {"message": "User created successfully"}


# ---------------------------
# CURRENT USER INFO
# ---------------------------
@router.get("/me")
def get_me(current_user=Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "is_admin": current_user.is_admin
    }
    
    