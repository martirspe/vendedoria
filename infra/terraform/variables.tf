variable "app_name" {
  type    = string
  default = "vendedoria"
  validation {
    condition     = can(regex("^[a-z0-9-]{3,20}$", var.app_name))
    error_message = "app_name: 3 to 20 lowercase letters, digits or hyphens."
  }
}

variable "environment" {
  type        = string
  description = "Must match the selected Terraform workspace."
  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "environment must be staging or prod."
  }
}

variable "aws_region" {
  type        = string
  description = "Region of the media bucket (AWS_REGION of the API)."
}

variable "ses_region" {
  type        = string
  default     = null
  description = "SES region when it differs from aws_region (SES_REGION of the API)."
}

variable "cloudflare_zone_id" {
  type        = string
  description = "Cloudflare zone that holds media_domain and email_domain."
}

# Media (S3 + CloudFront)

variable "media_prefix" {
  type    = string
  default = "media"
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.media_prefix))
    error_message = "media_prefix must match the prefix MediaService writes (media)."
  }
}

variable "media_domain" {
  type        = string
  default     = null
  description = "Custom media host, e.g. media.example.pe. Null serves photos from the *.cloudfront.net domain."
}

variable "price_class" {
  type        = string
  default     = "PriceClass_All"
  description = "PriceClass_All includes South American edge locations."
  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "Invalid CloudFront price class."
  }
}

variable "web_acl_arn" {
  type        = string
  default     = null
  description = "Optional AWS WAF web ACL (CLOUDFRONT scope, us-east-1)."
}

variable "noncurrent_version_days" {
  type        = number
  default     = 30
  description = "Recovery window for deleted or overwritten photos."
}

# Email (SES)

variable "email_domain" {
  type        = string
  description = "Sender domain verified in SES; EMAIL_FROM must use it."
}

variable "email_from" {
  type        = string
  description = "EMAIL_FROM of the API, e.g. \"VendedorIA <pedidos@example.pe>\"."
  validation {
    condition     = can(regex("@[^>]+>?$", var.email_from))
    error_message = "email_from must contain an address."
  }
}

variable "mail_from_subdomain" {
  type        = string
  default     = "bounce"
  description = "Custom MAIL FROM subdomain of email_domain (SPF alignment)."
}

variable "manage_dmarc" {
  type        = bool
  default     = false
  description = "Create the _dmarc record. Keep false when the domain already publishes one: two DMARC records invalidate both."
}

variable "dmarc_policy" {
  type    = string
  default = "none"
  validation {
    condition     = contains(["none", "quarantine", "reject"], var.dmarc_policy)
    error_message = "dmarc_policy must be none, quarantine or reject."
  }
}

variable "dmarc_report_email" {
  type    = string
  default = null
}

variable "manage_account_settings" {
  type        = bool
  default     = true
  description = "Account-level SES settings (suppression list, reputation alarms). Enable in one environment per account and SES region only."
}

variable "alerts_email" {
  type        = string
  default     = null
  description = "Receives SES reputation alarms and bounce/complaint events (the subscription must be confirmed by email)."
}
