-- Spice Garden - seed data.
-- Re-runnable: clears the tables and resets the order-number sequence first.
-- Fixed UUIDs keep the data stable across resets so links stay valid.

TRUNCATE order_items, orders, customers RESTART IDENTITY CASCADE;
ALTER SEQUENCE order_number_seq RESTART WITH 1001;

INSERT INTO customers (id, name, email, phone, created_at) VALUES
  ('11111111-1111-4111-8111-000000000001', 'Aarav Sharma',    'aarav.sharma@example.com',  '+919810012001', now() - interval '40 days'),
  ('11111111-1111-4111-8111-000000000002', 'Priya Nair',      'priya.nair@example.com',    '+919810012002', now() - interval '38 days'),
  ('11111111-1111-4111-8111-000000000003', 'Rohan Mehta',     NULL,                        '+919810012003', now() - interval '31 days'),
  ('11111111-1111-4111-8111-000000000004', 'Ananya Iyer',     'ananya.iyer@example.com',   '+919810012004', now() - interval '25 days'),
  ('11111111-1111-4111-8111-000000000005', 'Vikram Singh',    'vikram.singh@example.com',  '+919810012005', now() - interval '19 days'),
  ('11111111-1111-4111-8111-000000000006', 'Meera Krishnan',  NULL,                        '+919810012006', now() - interval '12 days'),
  ('11111111-1111-4111-8111-000000000007', 'Kabir Chatterjee','kabir.c@example.com',       '+919810012007', now() - interval '6 days'),
  ('11111111-1111-4111-8111-000000000008', 'Sneha Reddy',     'sneha.reddy@example.com',   '+919810012008', now() - interval '2 days');

-- Orders. total_amount / item_count are intentionally left to the
-- recalc_order_totals() trigger, which fires as the items below are inserted.
INSERT INTO orders (id, customer_id, status, created_at) VALUES
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000001', 'COMPLETED', now() - interval '9 days'),
  ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000002', 'COMPLETED', now() - interval '8 days'),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000003', 'CANCELLED', now() - interval '7 days'),
  ('22222222-2222-4222-8222-000000000004', '11111111-1111-4111-8111-000000000004', 'COMPLETED', now() - interval '6 days'),
  ('22222222-2222-4222-8222-000000000005', '11111111-1111-4111-8111-000000000001', 'COMPLETED', now() - interval '5 days'),
  ('22222222-2222-4222-8222-000000000006', '11111111-1111-4111-8111-000000000005', 'CANCELLED', now() - interval '4 days'),
  ('22222222-2222-4222-8222-000000000007', '11111111-1111-4111-8111-000000000006', 'COMPLETED', now() - interval '3 days'),
  ('22222222-2222-4222-8222-000000000008', '11111111-1111-4111-8111-000000000007', 'COMPLETED', now() - interval '2 days'),
  ('22222222-2222-4222-8222-000000000009', '11111111-1111-4111-8111-000000000002', 'READY',     now() - interval '5 hours'),
  ('22222222-2222-4222-8222-000000000010', '11111111-1111-4111-8111-000000000008', 'READY',     now() - interval '3 hours'),
  ('22222222-2222-4222-8222-000000000011', '11111111-1111-4111-8111-000000000004', 'PREPARING', now() - interval '90 minutes'),
  ('22222222-2222-4222-8222-000000000012', '11111111-1111-4111-8111-000000000003', 'PREPARING', now() - interval '55 minutes'),
  ('22222222-2222-4222-8222-000000000013', '11111111-1111-4111-8111-000000000005', 'CONFIRMED', now() - interval '25 minutes'),
  ('22222222-2222-4222-8222-000000000014', '11111111-1111-4111-8111-000000000007', 'CONFIRMED', now() - interval '11 minutes'),
  ('22222222-2222-4222-8222-000000000015', '11111111-1111-4111-8111-000000000006', 'CONFIRMED', now() - interval '3 minutes');

INSERT INTO order_items (order_id, item_name, quantity, unit_price) VALUES
  ('22222222-2222-4222-8222-000000000001', 'Paneer Butter Masala', 2,  320.00),
  ('22222222-2222-4222-8222-000000000001', 'Garlic Naan',          4,   70.00),
  ('22222222-2222-4222-8222-000000000001', 'Masala Chai',          2,   60.00),

  ('22222222-2222-4222-8222-000000000002', 'Hyderabadi Biryani',   1,  420.00),
  ('22222222-2222-4222-8222-000000000002', 'Mirchi ka Salan',      1,  110.00),

  ('22222222-2222-4222-8222-000000000003', 'Tandoori Chicken',     1,  480.00),
  ('22222222-2222-4222-8222-000000000003', 'Fresh Lime Soda',      2,   90.00),

  ('22222222-2222-4222-8222-000000000004', 'Masala Dosa',          3,  180.00),
  ('22222222-2222-4222-8222-000000000004', 'Filter Coffee',        3,   80.00),

  ('22222222-2222-4222-8222-000000000005', 'Dal Makhani',          1,  290.00),
  ('22222222-2222-4222-8222-000000000005', 'Jeera Rice',           2,  190.00),
  ('22222222-2222-4222-8222-000000000005', 'Gulab Jamun',          4,   60.00),

  ('22222222-2222-4222-8222-000000000006', 'Chicken Chettinad',    2,  460.00),

  ('22222222-2222-4222-8222-000000000007', 'Veg Thali',            2,  350.00),
  ('22222222-2222-4222-8222-000000000007', 'Sweet Lassi',          2,  120.00),

  ('22222222-2222-4222-8222-000000000008', 'Mutton Rogan Josh',    1,  540.00),
  ('22222222-2222-4222-8222-000000000008', 'Butter Naan',          3,   65.00),
  ('22222222-2222-4222-8222-000000000008', 'Raita',                1,   90.00),

  ('22222222-2222-4222-8222-000000000009', 'Chole Bhature',        2,  240.00),
  ('22222222-2222-4222-8222-000000000009', 'Mango Lassi',          2,  140.00),

  ('22222222-2222-4222-8222-000000000010', 'Prawn Koliwada',       1,  520.00),
  ('22222222-2222-4222-8222-000000000010', 'Kerala Parotta',       4,   55.00),

  ('22222222-2222-4222-8222-000000000011', 'Palak Paneer',         1,  310.00),
  ('22222222-2222-4222-8222-000000000011', 'Tandoori Roti',        4,   45.00),
  ('22222222-2222-4222-8222-000000000011', 'Boondi Raita',         1,   95.00),

  ('22222222-2222-4222-8222-000000000012', 'Fish Curry Meals',     2,  380.00),

  ('22222222-2222-4222-8222-000000000013', 'Idli Sambar',          2,  140.00),
  ('22222222-2222-4222-8222-000000000013', 'Medu Vada',            2,  120.00),
  ('22222222-2222-4222-8222-000000000013', 'Filter Coffee',        2,   80.00),

  ('22222222-2222-4222-8222-000000000014', 'Chicken Biryani',      2,  400.00),
  ('22222222-2222-4222-8222-000000000014', 'Double ka Meetha',     1,  150.00),

  ('22222222-2222-4222-8222-000000000015', 'Veg Hakka Noodles',    1,  260.00),
  ('22222222-2222-4222-8222-000000000015', 'Gobi Manchurian',      1,  280.00),
  ('22222222-2222-4222-8222-000000000015', 'Fresh Lime Soda',      2,   90.00);

-- Keep the sequence ahead of the seeded order numbers.
SELECT setval('order_number_seq', 1001 + (SELECT count(*) FROM orders));
