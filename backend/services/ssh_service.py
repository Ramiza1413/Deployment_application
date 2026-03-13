import paramiko
from services.audit_service import log_action


def ssh_connect(server, db=None, user_id=None):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    key = paramiko.RSAKey.from_private_key_file(server.pem_path)

    try:
        ssh.connect(
            hostname=server.host,
            username=server.username,
            pkey=key,
            timeout=10
        )
        
        # Log successful SSH connection if db and user_id provided
        if db and user_id:
            log_action(db, user_id, "CONNECT", "SSH", server.id)
        
        return ssh
    except Exception as e:
        # Log failed SSH connection if db and user_id provided
        if db and user_id:
            log_action(db, user_id, "CONNECT_FAILED", "SSH", server.id)
        raise e