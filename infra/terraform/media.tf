# Product media: private S3 bucket readable only by CloudFront (Origin Access Control).

locals {
  has_media_domain = var.media_domain != null
}

resource "aws_s3_bucket" "media" {
  bucket = "${var.app_name}-media-${var.environment}-${data.aws_caller_identity.current.account_id}"

  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = terraform.workspace == var.environment
      error_message = "Select the workspace of this environment first: terraform workspace select ${var.environment}"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket     = aws_s3_bucket.media.id
  depends_on = [aws_s3_bucket_versioning.media]

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_days
    }
  }

  rule {
    id     = "remove-expired-delete-markers"
    status = "Enabled"
    filter {}
    expiration {
      expired_object_delete_marker = true
    }
  }

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "expire-healthchecks"
    status = "Enabled"
    filter {
      prefix = "${var.media_prefix}/_healthcheck/"
    }
    expiration {
      days = 1
    }
  }
}

data "aws_iam_policy_document" "media_bucket" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.media.arn}/${var.media_prefix}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.media.arn]
    }
  }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.media.arn, "${aws_s3_bucket.media.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "media" {
  bucket     = aws_s3_bucket.media.id
  policy     = data.aws_iam_policy_document.media_bucket.json
  depends_on = [aws_s3_bucket_public_access_block.media]
}

# CloudFront

resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "${local.name}-media"
  description                       = "Signs CloudFront requests to the private media bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_response_headers_policy" "security_headers" {
  name = "Managed-SecurityHeadersPolicy"
}

resource "aws_acm_certificate" "media" {
  count             = local.has_media_domain ? 1 : 0
  provider          = aws.us_east_1
  domain_name       = var.media_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "cloudflare_dns_record" "media_certificate_validation" {
  for_each = {
    for option in try(aws_acm_certificate.media[0].domain_validation_options, []) : option.domain_name => option
  }
  zone_id = var.cloudflare_zone_id
  name    = trimsuffix(each.value.resource_record_name, ".")
  type    = each.value.resource_record_type
  content = trimsuffix(each.value.resource_record_value, ".")
  ttl     = 1
  proxied = false
  comment = "ACM validation for ${local.name} media (Terraform)"
}

resource "aws_acm_certificate_validation" "media" {
  count                   = local.has_media_domain ? 1 : 0
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.media[0].arn
  validation_record_fqdns = [for record in cloudflare_dns_record.media_certificate_validation : record.name]
}

resource "aws_cloudfront_distribution" "media" {
  enabled         = true
  comment         = "${local.name} product media"
  http_version    = "http2and3"
  is_ipv6_enabled = true
  price_class     = var.price_class
  aliases         = local.has_media_domain ? [var.media_domain] : []
  web_acl_id      = var.web_acl_arn

  origin {
    origin_id                = "media-bucket"
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  default_cache_behavior {
    target_origin_id       = "media-bucket"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    # Honours the immutable Cache-Control set on upload; photos never need invalidations.
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security_headers.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = !local.has_media_domain
    acm_certificate_arn            = local.has_media_domain ? aws_acm_certificate_validation.media[0].certificate_arn : null
    ssl_support_method             = local.has_media_domain ? "sni-only" : null
    minimum_protocol_version       = local.has_media_domain ? "TLSv1.2_2021" : "TLSv1"
  }
}

# DNS only (not proxied): CloudFront must terminate TLS for the alias.
resource "cloudflare_dns_record" "media" {
  count   = local.has_media_domain ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = var.media_domain
  type    = "CNAME"
  content = aws_cloudfront_distribution.media.domain_name
  ttl     = 1
  proxied = false
  comment = "${local.name} media CDN (Terraform)"
}
