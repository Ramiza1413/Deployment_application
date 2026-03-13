import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


EMAIL_HOST = os.getenv("EMAIL_HOST")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", 587))
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS") == "True"
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD")
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL")


def send_ssh_setup_email(user_email, public_key, repo_url):

    subject = "SSH Setup Required for Deployment"

    body = f"""
Hello,

Deployment failed due to missing SSH authentication with Bitbucket.

Please add the following SSH public key to your Bitbucket repository:

{public_key}

Then ensure your repository remote is using SSH format:

git@bitbucket.org:org/repo.git

Repository URL:
{repo_url}

After adding the key, retry deployment.

Regards,
Deployment System
"""

    msg = MIMEMultipart()
    msg["From"] = DEFAULT_FROM_EMAIL
    msg["To"] = user_email
    msg["Subject"] = subject

    msg.attach(MIMEText(body, "plain"))

    try:
        server = smtplib.SMTP(EMAIL_HOST, EMAIL_PORT)
        if EMAIL_USE_TLS:
            server.starttls()

        server.login(EMAIL_HOST_USER, EMAIL_HOST_PASSWORD)
        server.send_message(msg)
        server.quit()

        return True

    except Exception as e:
        print("Email sending failed:", str(e))
        return False