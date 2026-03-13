# backend/services/deploy_utils.py

def validate_git_access(ssh, repo_url):
    """Check that the supplied Git repository is reachable from the
    remote host.  Previously the function took a Server object and
    pulled ``repo_url`` from it; the URL is now passed directly since
    we no longer store it on `Server`.
    """

    # Ensure root known_hosts has bitbucket
    ssh.exec_command(
        "sudo mkdir -p /root/.ssh",
        get_pty=True
    )

    ssh.exec_command(
        "sudo ssh-keyscan bitbucket.org >> /root/.ssh/known_hosts",
        get_pty=True
    )

    cmd = f"sudo /usr/bin/git ls-remote {repo_url}"

    stdin, stdout, stderr = ssh.exec_command(
        cmd,
        timeout=30,
        get_pty=True
    )

    stdout_data = stdout.read().decode()
    stderr_data = stderr.read().decode()

    print("GIT STDOUT:", stdout_data)
    print("GIT STDERR:", stderr_data)

    if stderr_data:
        return False, stderr_data

    if stdout_data.strip() == "":
        return False, "Unknown Git access failure."

    return True, None


def ensure_ssh_key(ssh):
    stdin, stdout, stderr = ssh.exec_command("ls ~/.ssh")
    files = stdout.read().decode()

    if "id_ed25519" not in files:
        ssh.exec_command(
            'ssh-keygen -t ed25519 -C "ec2-server" -f ~/.ssh/id_ed25519 -N ""'
        )

    stdin, stdout, stderr = ssh.exec_command("cat ~/.ssh/id_ed25519.pub")
    return stdout.read().decode().strip()