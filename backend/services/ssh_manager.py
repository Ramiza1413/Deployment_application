import paramiko
from services.ssh_service import ssh_connect
import threading

class SSHManager:
    def __init__(self):
        self.connections = {}
        self.locks = {}  # Add locks for thread safety

    def get_connection(self, server, db=None, user_id=None, force_new=False):
        server_id = server.id

        # Ensure we have a lock for this server
        if server_id not in self.locks:
            self.locks[server_id] = threading.Lock()

        with self.locks[server_id]:
            # For deployments, always create a new connection to avoid interference
            if force_new:
                ssh = ssh_connect(server, db, user_id)
                return ssh

            # For other operations, reuse connections if available
            if server_id in self.connections:
                ssh = self.connections[server_id]

                # Check if still active
                transport = ssh.get_transport()
                if transport and transport.is_active():
                    return ssh

            # Otherwise reconnect
            ssh = ssh_connect(server, db, user_id)
            self.connections[server_id] = ssh
            return ssh

    def close_connection(self, server_id):
        if server_id in self.locks:
            with self.locks[server_id]:
                if server_id in self.connections:
                    self.connections[server_id].close()
                    del self.connections[server_id]


ssh_manager = SSHManager()