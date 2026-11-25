// Sample data from the assignment brief, as engine-shaped objects.

const rule = (ruleId, scope, appliesTo, type, value, stackable, minCartValue = null) => ({
  ruleId, scope, appliesTo, type, value, stackable, minCartValue,
})

export const SAMPLE_RULES = [
  rule('RULE-01', 'platform', 'Amazon India', 'percentage', 15, false),
  rule('RULE-02', 'brand', 'Natura Casa', 'flat', 150, false),
  rule('RULE-03', 'platform', 'Flipkart', 'percentage', 10, true),
  rule('RULE-04', 'cart', null, 'percentage', 10, false, 4000),
]

const item = (itemId, product, brand, platform, basePrice) => ({
  itemId, product, brand, platform, basePrice,
})

export const SAMPLE_CART = [
  item('ITEM-01', 'Cushion Cover', 'Natura Casa', 'Amazon India', 1299),
  item('ITEM-02', 'Bed Sheet Set', 'Natura Casa', 'Flipkart', 849),
  item('ITEM-03', 'Wall Shelf', 'LivSpace Pro', 'Amazon India', 599),
  item('ITEM-04', 'Ceramic Vase', 'LivSpace Pro', 'Noon', 2499),
  item('ITEM-05', 'Cutting Board', 'Nordic Basics', 'Amazon India', 449),
  item('ITEM-06', 'Desk Organiser', 'Nordic Basics', 'Flipkart', 899),
]
