-- Visual store editor: template content by section, with a draft that only preview links render.
ALTER TABLE "Storefront" ADD COLUMN "templateContent" JSONB;
ALTER TABLE "Storefront" ADD COLUMN "templateDraft" JSONB;

-- Former flat texts move to their section. Banner titles emphasized their last line: it becomes
-- the banner emphasis. Empty values were "use the template text", so they are left out.
UPDATE "Storefront" s
SET "templateContent" = jsonb_strip_nulls(jsonb_build_object(
  'version', 1,
  'sections', jsonb_strip_nulls(jsonb_build_object(
    'hero', NULLIF(jsonb_strip_nulls(jsonb_build_object(
      'eyebrow', NULLIF(btrim(c->>'heroEyebrow'), ''),
      'title', NULLIF(btrim(c->>'heroTitle'), ''),
      'emphasis', NULLIF(btrim(c->>'heroEmphasis'), ''),
      'text', NULLIF(btrim(c->>'heroText'), ''),
      'note', NULLIF(btrim(c->>'heroNote'), '')
    )), '{}'::jsonb),
    'banner', NULLIF(jsonb_strip_nulls(jsonb_build_object(
      'eyebrow', NULLIF(btrim(c->>'bannerEyebrow'), ''),
      'title', NULLIF(CASE
        WHEN position(E'\n' IN btrim(c->>'bannerTitle', E' \n')) > 0
          THEN regexp_replace(btrim(c->>'bannerTitle', E' \n'), E'\\n[^\\n]*$', '')
        ELSE btrim(c->>'bannerTitle', E' \n')
      END, ''),
      'emphasis', CASE
        WHEN position(E'\n' IN btrim(c->>'bannerTitle', E' \n')) > 0
          THEN NULLIF(btrim(substring(btrim(c->>'bannerTitle', E' \n') FROM E'([^\\n]*)$')), '')
        WHEN NULLIF(btrim(c->>'bannerTitle'), '') IS NOT NULL THEN ''
      END,
      'text', NULLIF(btrim(c->>'bannerText'), ''),
      'image', NULLIF(btrim(c->>'bannerImageUrl'), '')
    )), '{}'::jsonb),
    'footer', NULLIF(jsonb_strip_nulls(jsonb_build_object(
      'closing', NULLIF(btrim(c->>'closingPhrase'), ''),
      'note', NULLIF(btrim(c->>'footerNote'), '')
    )), '{}'::jsonb)
  )),
  'faq', CASE WHEN jsonb_typeof(c->'faq') = 'array' AND jsonb_array_length(c->'faq') > 0 THEN c->'faq' END
))
FROM (SELECT "id", "templateCopy" AS c FROM "Storefront") old
WHERE s."id" = old."id" AND jsonb_typeof(old.c) = 'object';
