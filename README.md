# RoseSale2627

A sample Rose Sale catalog based on the supplied [RS '26 Encoder Sheet](https://docs.google.com/spreadsheets/d/1mb7eJ-7299Y3cxkLVZiVi4NxG-SGuPZN3YndVxySVI4/edit?gid=1042576733#gid=1042576733), transcribed on November 6, 2026.

Open `index.html` in a browser. No installation or build is required. Search by product or variant and filter by category.

## Sample data

`catalog.js` holds 25 product groups, PHP prices, named variants, and stable sample IDs. It can also be loaded with `require('./catalog.js')` in Node.

- Prices come from **Encoder Tab 3!E13:K37**. Variant price mappings and the ₱25 individual sticker price are confirmed by **C61**, the grand total formula. Two large stickers cost ₱50.
- Product variants come from **Encoder Tab 3!B7:B59** and **Inventory!B3:B52**. Red Lego Flower appears only in Inventory and uses the Lego Flower group price. Capitalization, apostrophes, and “and”/“&” spelling are normalized.
- Stock is `null` (unspecified). Historical inventory quantities, including negative balances, are not presented as current availability.
- Bundle and bouquet prices are preserved, but their contents and selection rules are not inferred. This preview has no ordering or payment flow.
- No customer names, email addresses, payment references, or order records are included.

The catalog is a static sample, not a live Google Sheets connection. Edit `catalog.js` to change it.
