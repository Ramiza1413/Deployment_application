from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Format: postgresql://username:password@localhost:5432/database_name
SQLALCHEMY_DATABASE_URL = "postgresql://admin_user:CiCD2026@localhost:5432/deployer_db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL
    # No check_same_thread=False here!
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()