# RoseSale2627

The original Rose Sale cashier app, with sample products and PHP prices from the [RS '26 Encoder Sheet](https://docs.google.com/spreadsheets/d/1mb7eJ-7299Y3cxkLVZiVi4NxG-SGuPZN3YndVxySVI4/edit?gid=1042576733#gid=1042576733).

Live sample: https://rose-sale-sample.vercel.app/

## Preserved features

Student ID login and admin/cashier roles; product search and category filters; cart quantities and removal; cash and change calculation; pending GCash payments and admin verification; printable receipts; transaction search; voids and refunds with reasons; opening/closing shifts and drawer totals; CSV export; product management and pricing revisions; saved checkout recovery and duplicate transaction protection.

The original Flask backend, templates, JavaScript, styles, and deployment configuration were recovered from the October 22 Vercel deployment. Only the seed product source was changed. This remains the original temporary, per-visitor sample, not a production sales database.

## Sample products

`sample-products.json` contains 51 individually selectable products/variants. Prices are integer centavos (10000 = PHP 100). Names and variants come from Encoder Tab 3 and Inventory. Prices follow the product list and grand total formula in Encoder Tab 3, including PHP 25 per sticker. The inventory-only Red Lego Flower uses the Lego Flower group price. Historical inventory balances and customer/payment records are not imported.

Bundles and bouquets retain their sheet names and prices; the original cashier sells them as catalog items. No additional bundle configuration flow has been added.

If an existing sample session still shows the old catalog, sign out and sign back in to reset its temporary data. Do not reset a session with a checkout awaiting confirmation.

## Run locally

Install `requirements.txt`, set `ROSE_PUBLIC_DEMO=1`, and run `python app.py`. The sample listens at http://127.0.0.1:8080. Demo admin: 256298. Demo cashiers: 256299 and 256300. Do not enter real payments or personal details.

Vercel uses Flask and `python build_vercel.py`; retain the existing project's sample environment settings. Deployments from GitHub main update the live sample.
