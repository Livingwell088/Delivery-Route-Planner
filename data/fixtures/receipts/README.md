# Synthetic receipt image set

This directory contains 20 synthetic Ming House receipt images for OCR and
workflow testing. They are derived from an anonymized visual template and are
clearly marked as test data.

The delivery destinations are publicly listed Worcester civic, educational,
cultural, or commercial addresses. They are not presented as real customer
orders. All telephone numbers are `000-000-0000`, and the order numbers and
times are synthetic.

`ground-truth.csv` records the exact order number, time, address, and test
categories expected from each image. Use it to measure extraction accuracy.

The set covers:

- Clean receipts
- Blur and motion blur
- Tilt and perspective distortion
- Warm, cool, dim, uneven, and shadowed lighting
- Suite and room secondary-address lines
- Similar Main Street and Salisbury Street destinations
- Missing ZIP codes
- Reprints and faded thermal printing
- Alternate POS layouts
- Wrinkled, curled, and folded paper

Generated images are useful for development but do not replace validation with
properly anonymized photographs of real printed receipts.
