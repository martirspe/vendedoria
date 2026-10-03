# IAM user of the API: upload/delete product photos and send transactional email, nothing else.
# Its access key is created by hand (aws iam create-access-key) so the secret never lands in the state.

resource "aws_iam_user" "api" {
  name = "${local.name}-api"
}

data "aws_iam_policy_document" "api" {
  statement {
    sid       = "ManageProductMedia"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.media.arn}/${var.media_prefix}/*"]
  }

  statement {
    sid     = "SendTransactionalEmail"
    actions = ["ses:SendEmail"]
    resources = [
      aws_sesv2_email_identity.domain.arn,
      aws_sesv2_configuration_set.transactional.arn,
    ]
    condition {
      test     = "StringLike"
      variable = "ses:FromAddress"
      values   = ["*@${var.email_domain}"]
    }
  }
}

resource "aws_iam_policy" "api" {
  name        = "${local.name}-api"
  description = "VendedorIA API: product media in S3 and transactional email through SES"
  policy      = data.aws_iam_policy_document.api.json
}

resource "aws_iam_user_policy_attachment" "api" {
  user       = aws_iam_user.api.name
  policy_arn = aws_iam_policy.api.arn
}
