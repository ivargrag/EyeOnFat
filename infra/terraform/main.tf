# Eye on Fat — staging deploy skeleton (AWS: ECS Fargate + RDS Postgres + ALB).
# One command: terraform init && terraform apply -var-file=staging.tfvars
# This is the v1 scaffold: fill the tfvars, point the images at your registry
# (built from infra/*.Dockerfile), and store secrets in SSM/Secrets Manager —
# never in tfvars committed to git.

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = var.region
}

variable "region" { default = "me-central-1" } # UAE region; see PRD open question #3
variable "env" { default = "staging" }
variable "api_image" { type = string }
variable "web_image" { type = string }
variable "db_password" { type = string, sensitive = true }

# ── Network (default VPC for staging; dedicated VPC for prod) ──────────────
data "aws_vpc" "default" { default = true }
data "aws_subnets" "default" {
  filter { name = "vpc-id"; values = [data.aws_vpc.default.id] }
}

# ── RDS Postgres 16 with encryption at rest ────────────────────────────────
resource "aws_db_instance" "eof" {
  identifier              = "eyeonfat-${var.env}"
  engine                  = "postgres"
  engine_version          = "16"
  instance_class          = "db.t4g.medium"
  allocated_storage       = 50
  storage_encrypted       = true
  db_name                 = "eyeonfat"
  username                = "eof_owner"
  password                = var.db_password
  skip_final_snapshot     = var.env != "prod"
  backup_retention_period = 7
  deletion_protection     = var.env == "prod"
}

# ── ECS cluster + services ─────────────────────────────────────────────────
resource "aws_ecs_cluster" "eof" { name = "eyeonfat-${var.env}" }

# Task definitions / ALB / service wiring are environment-specific; the
# reference pattern is: one Fargate service per app (api :4000, web :3000),
# ALB with /api/* → api target group, everything else → web, TLS via ACM,
# secrets injected from SSM Parameter Store (JWT secrets, provider keys).
# See RUNBOOK.md §Deploy for the full checklist.

output "db_endpoint" { value = aws_db_instance.eof.endpoint }
