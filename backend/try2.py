from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base

# SQLite DB
sqlite_engine = create_engine("sqlite:///./deployments.db")

# PostgreSQL DB
postgres_engine = create_engine(
    "postgresql://admin_user:CiCD2026@localhost:5432/deployer_db"
)

SQLiteSession = sessionmaker(bind=sqlite_engine)
PostgresSession = sessionmaker(bind=postgres_engine)

sqlite_session = SQLiteSession()
pg_session = PostgresSession()

# Create tables in PostgreSQL
Base.metadata.create_all(postgres_engine)

for table in Base.metadata.sorted_tables:
    rows = sqlite_session.execute(table.select()).fetchall()

    if rows:
        pg_session.execute(table.insert(), [dict(row._mapping) for row in rows])
        print(f"Migrated {len(rows)} rows from {table.name}")

pg_session.commit()

sqlite_session.close()
pg_session.close()

print("Migration completed successfully.")