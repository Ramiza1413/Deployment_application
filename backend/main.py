from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from dotenv import load_dotenv
load_dotenv()
from routers import auth, servers, deploy, metrics,admin, logs_ws

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(servers.router)
app.include_router(deploy.router)
app.include_router(metrics.router)
app.include_router(admin.router)
app.include_router(logs_ws.router)


@app.get("/")
def root():
    return {"status": "Deployment System Running"}