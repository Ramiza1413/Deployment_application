from database import SessionLocal
from models import User
from utils.security import hash_password

db = SessionLocal()

admin = User(
    username="admin",
    email="ramizaskshaik786@gmail.com",
    password=hash_password("admin123"),
    is_admin=True
)

db.add(admin)
db.commit()

print("Admin created successfully")