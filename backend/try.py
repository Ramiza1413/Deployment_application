import os
import boto3
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone

load_dotenv()

# Create CloudWatch client
cloudwatch = boto3.client(
    "cloudwatch",
    region_name=os.getenv("AWS_DEFAULT_REGION"),
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
)

# Create EC2 client
ec2 = boto3.client(
    "ec2",
    region_name=os.getenv("AWS_DEFAULT_REGION"),
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
)


def get_cpu_metrics(instance_id):
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(minutes=30)

    response = cloudwatch.get_metric_statistics(
        Namespace="AWS/EC2",
        MetricName="CPUUtilization",
        Dimensions=[
            {"Name": "InstanceId", "Value": instance_id}
        ],
        StartTime=start_time,
        EndTime=end_time,
        Period=300,  # 5 minutes
        Statistics=["Average"]
    )

    return response["Datapoints"]


# 🔍 Replace with your public IP
public_ip = "13.234.96.145"

# Get instance ID from public IP
response = ec2.describe_instances(
    Filters=[{"Name": "ip-address", "Values": [public_ip]}]
)

instance_id = response["Reservations"][0]["Instances"][0]["InstanceId"]

cpu_data = get_cpu_metrics(instance_id)

print(cpu_data)

# response = ec2.describe_instances()

# print("-" * 100)
# print(f"{'Instance ID':<20} {'State':<12} {'Type':<15} {'Public IP':<18} {'Private IP':<18}")
# print("-" * 100)

# for reservation in response["Reservations"]:
#     for instance in reservation["Instances"]:
#         instance_id = instance["InstanceId"]
#         state = instance["State"]["Name"]
#         instance_type = instance["InstanceType"]
#         public_ip = instance.get("PublicIpAddress", "N/A")
#         private_ip = instance.get("PrivateIpAddress", "N/A")

#         print(f"{instance_id:<20} {state:<12} {instance_type:<15} {public_ip:<18} {private_ip:<18}")

# print("-" * 100)

# import os
# import boto3
# from dotenv import load_dotenv

# load_dotenv()

# ec2 = boto3.client(
#     "ec2",
#     region_name=os.getenv("AWS_DEFAULT_REGION"),
#     aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
#     aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
# )

# instance_id = "i-0eaf8aee87741cda2"

# # Stop instance
# ec2.stop_instances(InstanceIds=[instance_id])
# print("Stopping instance...")

# # Wait until fully stopped
# waiter = ec2.get_waiter('instance_stopped')
# waiter.wait(InstanceIds=[instance_id])

# print("Instance is now stopped ✅")

# response = ec2.describe_instances()

# print("-" * 100)
# print(f"{'Instance ID':<20} {'State':<12} {'Type':<15} {'Public IP':<18} {'Private IP':<18}")
# print("-" * 100)

# for reservation in response["Reservations"]:
#     for instance in reservation["Instances"]:
#         instance_id = instance["InstanceId"]
#         state = instance["State"]["Name"]
#         instance_type = instance["InstanceType"]
#         public_ip = instance.get("PublicIpAddress", "N/A")
#         private_ip = instance.get("PrivateIpAddress", "N/A")

#         print(f"{instance_id:<20} {state:<12} {instance_type:<15} {public_ip:<18} {private_ip:<18}")

# print("-" * 100)