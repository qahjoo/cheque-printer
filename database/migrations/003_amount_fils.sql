-- =============================================================================
-- 003_amount_fils.sql — إضافة حقل amount_fils (الفلسات) للقوالب الموجودة
-- يُضاف هذا الحقل لكل قالب موجود لم يحتوِه بعد.
-- x_mm=50, y_mm=45 (بجانب حقل المبلغ الرقمي) — يمكن تعديله من المصمم.
-- =============================================================================

INSERT INTO template_fields (template_id, field_name, x_mm, y_mm, font_family, font_size, font_weight, color, align, direction, visible)
SELECT t.id, 'amount_fils', 30.0, 45.0, 'Arial', 13.0, '400', '#000000', 'left', 'ltr', 1
FROM templates t
WHERE NOT EXISTS (
  SELECT 1 FROM template_fields tf
  WHERE tf.template_id = t.id AND tf.field_name = 'amount_fils'
);
