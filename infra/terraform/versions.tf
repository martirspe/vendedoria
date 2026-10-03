terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # Partial configuration: values come from backend.hcl (see backend.hcl.example).
  # One state per Terraform workspace, named after the environment (staging, prod).
  backend "s3" {}
}

locals {
  name       = "${var.app_name}-${var.environment}"
  ses_region = coalesce(var.ses_region, var.aws_region)
  default_tags = {
    app         = var.app_name
    environment = var.environment
    managed-by  = "terraform"
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = local.default_tags
  }
}

# CloudFront only accepts ACM certificates issued in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = local.default_tags
  }
}

provider "aws" {
  alias  = "ses"
  region = local.ses_region
  default_tags {
    tags = local.default_tags
  }
}

# Reads CLOUDFLARE_API_TOKEN (Zone → DNS → Edit on the zone only).
provider "cloudflare" {}

data "aws_caller_identity" "current" {}
