locals {
  media_cdn_url = local.has_media_domain ? "https://${var.media_domain}" : "https://${aws_cloudfront_distribution.media.domain_name}"
}

output "server_env" {
  description = "Non-secret API variables for the server .env (add the access key of api_iam_user by hand)."
  value = join("\n", compact([
    "AWS_REGION=${var.aws_region}",
    "MEDIA_STORAGE=s3",
    "MEDIA_S3_BUCKET=${aws_s3_bucket.media.id}",
    "MEDIA_CDN_URL=${local.media_cdn_url}",
    "EMAIL_PROVIDER=ses",
    "EMAIL_FROM=${var.email_from}",
    local.ses_region == var.aws_region ? "" : "SES_REGION=${local.ses_region}",
    "SES_CONFIGURATION_SET=${aws_sesv2_configuration_set.transactional.configuration_set_name}",
  ]))
}

output "cloudfront_distribution_id" {
  description = "CLOUDFRONT_DISTRIBUTION_ID for the AWS audit script."
  value       = aws_cloudfront_distribution.media.id
}

output "media_cdn_url" {
  value = local.media_cdn_url
}

output "api_iam_user" {
  description = "Create its access key by hand: aws iam create-access-key --user-name <this>."
  value       = aws_iam_user.api.name
}

output "email_alerts_topic_arn" {
  value = aws_sns_topic.email_alerts.arn
}
