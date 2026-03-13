from models import AuditLog
from datetime import datetime

def log_action(db, user_id, action, entity_type, entity_id):
    log = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        timestamp=datetime.utcnow()
    )
    db.add(log)
    db.commit()