# Transactional email: SES domain identity with Easy DKIM, custom MAIL FROM, configuration set,
# bounce/complaint events and reputation alarms.

locals {
  mail_from_domain = "${var.mail_from_subdomain}.${var.email_domain}"
  dmarc_report     = var.dmarc_report_email == null ? "" : " rua=mailto:${var.dmarc_report_email};"
}

resource "aws_sesv2_configuration_set" "transactional" {
  provider               = aws.ses
  configuration_set_name = "${local.name}-transactional"

  delivery_options {
    tls_policy = "REQUIRE"
  }
  reputation_options {
    reputation_metrics_enabled = true
  }
  sending_options {
    sending_enabled = true
  }
  suppression_options {
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }
}

resource "aws_sesv2_email_identity" "domain" {
  provider               = aws.ses
  email_identity         = var.email_domain
  configuration_set_name = aws_sesv2_configuration_set.transactional.configuration_set_name

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

# Easy DKIM always issues three tokens.
resource "cloudflare_dns_record" "dkim" {
  count   = 3
  zone_id = var.cloudflare_zone_id
  name    = "${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.email_domain}"
  type    = "CNAME"
  content = "${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"
  ttl     = 1
  proxied = false
  comment = "SES DKIM ${local.name} (Terraform)"
}

resource "aws_sesv2_email_identity_mail_from_attributes" "domain" {
  provider               = aws.ses
  email_identity         = aws_sesv2_email_identity.domain.email_identity
  mail_from_domain       = local.mail_from_domain
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

resource "cloudflare_dns_record" "mail_from_mx" {
  zone_id  = var.cloudflare_zone_id
  name     = local.mail_from_domain
  type     = "MX"
  content  = "feedback-smtp.${local.ses_region}.amazonses.com"
  priority = 10
  ttl      = 1
  comment  = "SES MAIL FROM ${local.name} (Terraform)"
}

resource "cloudflare_dns_record" "mail_from_spf" {
  zone_id = var.cloudflare_zone_id
  name    = local.mail_from_domain
  type    = "TXT"
  content = "\"v=spf1 include:amazonses.com ~all\""
  ttl     = 1
  comment = "SES MAIL FROM ${local.name} (Terraform)"
}

resource "cloudflare_dns_record" "dmarc" {
  count   = var.manage_dmarc ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = "_dmarc.${var.email_domain}"
  type    = "TXT"
  content = "\"v=DMARC1; p=${var.dmarc_policy};${local.dmarc_report} adkim=s; aspf=r\""
  ttl     = 1
  comment = "DMARC ${local.name} (Terraform)"
}

resource "aws_sesv2_account_suppression_attributes" "account" {
  count              = var.manage_account_settings ? 1 : 0
  provider           = aws.ses
  suppressed_reasons = ["BOUNCE", "COMPLAINT"]
}

# Alerts: SES delivery problems and reputation alarms go to one SNS topic.

resource "aws_sns_topic" "email_alerts" {
  provider = aws.ses
  name     = "${local.name}-email-alerts"
}

data "aws_iam_policy_document" "email_alerts" {
  statement {
    sid       = "AllowSesEvents"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.email_alerts.arn]
    principals {
      type        = "Service"
      identifiers = ["ses.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid       = "AllowCloudWatchAlarms"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.email_alerts.arn]
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "email_alerts" {
  provider = aws.ses
  arn      = aws_sns_topic.email_alerts.arn
  policy   = data.aws_iam_policy_document.email_alerts.json
}

resource "aws_sns_topic_subscription" "email_alerts" {
  count     = var.alerts_email == null ? 0 : 1
  provider  = aws.ses
  topic_arn = aws_sns_topic.email_alerts.arn
  protocol  = "email"
  endpoint  = var.alerts_email
}

resource "aws_sesv2_configuration_set_event_destination" "alerts" {
  provider               = aws.ses
  configuration_set_name = aws_sesv2_configuration_set.transactional.configuration_set_name
  event_destination_name = "delivery-problems"

  event_destination {
    enabled              = true
    matching_event_types = ["BOUNCE", "COMPLAINT", "REJECT", "RENDERING_FAILURE", "DELIVERY_DELAY"]
    sns_destination {
      topic_arn = aws_sns_topic.email_alerts.arn
    }
  }

  depends_on = [aws_sns_topic_policy.email_alerts]
}

# SES reviews accounts at 5 % bounces and 0.1 % complaints; alert before that.
resource "aws_cloudwatch_metric_alarm" "ses_bounce_rate" {
  count               = var.manage_account_settings ? 1 : 0
  provider            = aws.ses
  alarm_name          = "${local.name}-ses-bounce-rate"
  namespace           = "AWS/SES"
  metric_name         = "Reputation.BounceRate"
  statistic           = "Maximum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 0.04
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.email_alerts.arn]
  ok_actions          = [aws_sns_topic.email_alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "ses_complaint_rate" {
  count               = var.manage_account_settings ? 1 : 0
  provider            = aws.ses
  alarm_name          = "${local.name}-ses-complaint-rate"
  namespace           = "AWS/SES"
  metric_name         = "Reputation.ComplaintRate"
  statistic           = "Maximum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 0.0008
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.email_alerts.arn]
  ok_actions          = [aws_sns_topic.email_alerts.arn]
}
