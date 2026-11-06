"""Single-server Rose Sale cashier. Monetary values are integer centavos."""
import csv
import io
import json
import os
import re
import secrets
import sqlite3
import tempfile
from contextlib import closing, contextmanager
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from uuid import UUID

import click
from flask import Flask, abort, g, jsonify, redirect, render_template, request, session, url_for
from flask_login import LoginManager, UserMixin, current_user, login_required, login_user, logout_user


def now():
    return datetime.now(timezone.utc).isoformat()


def integer(value, name, minimum=0, maximum=100_000_000):
    if type(value) is not int or not minimum <= value <= maximum:
        abort(400, f'{name} must be an integer from {minimum} to {maximum}.')
    return value


def text_value(value, name, maximum=120):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        abort(400, f'{name} is required (maximum {maximum} characters).')
    return value.strip()


class User(UserMixin):
    def __init__(self, row):
        self.id, self.username, self.role = row['id'], row['username'], row['role']


DEMO_TABLES = ('settings', 'users', 'products', 'product_versions', 'shifts', 'sales', 'sale_items', 'payments', 'sale_actions')


def seed_demo_records(conn):
    for student_id, role in [('256298', 'admin'), ('256299', 'cashier'), ('256300', 'cashier')]:
        conn.execute("INSERT INTO users(username,password_hash,role) VALUES (?,'',?)", (student_id, role))
    for sku, name, category, price in json.loads(Path(__file__).with_name('sample-products.json').read_text(encoding='utf-8')):
        product_id = conn.execute('INSERT INTO products(sku) VALUES (?)', (sku,)).lastrowid
        revision = conn.execute('INSERT INTO product_versions(product_id,name,category,price,active,created_at) VALUES (?,?,?,?,1,?)', (product_id, name, category, price, now())).lastrowid
        conn.execute('UPDATE products SET current_revision=? WHERE id=?', (revision, product_id))


def create_app(config=None):
    public_demo = os.environ.get('ROSE_PUBLIC_DEMO') == '1'
    # Keep the live WAL database outside a potentially OneDrive-synced checkout.
    data_dir = Path(os.environ.get('ROSE_DATA_DIR') or Path(os.environ.get('LOCALAPPDATA', str(Path.home() / '.local' / 'share'))) / 'RoseSale').resolve()
    if public_demo:
        data_dir = Path(tempfile.gettempdir()) / 'rose-sale-public-demo'
    app = Flask(__name__, instance_path=str(data_dir), instance_relative_config=True)
    Path(app.instance_path).mkdir(parents=True, exist_ok=True)
    secret_path = Path(app.instance_path) / 'session-secret'
    if not secret_path.exists():
        try:
            with secret_path.open('x') as stream:
                stream.write(secrets.token_hex(32))
        except FileExistsError:
            pass
    app.config.update(PUBLIC_DEMO=public_demo, SECRET_KEY=os.environ.get('ROSE_SESSION_SECRET') or secret_path.read_text(), DATABASE=str(Path(app.instance_path) / 'rose.sqlite'),
                      SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE='Lax',
                      SESSION_COOKIE_SECURE=os.environ.get('ROSE_HTTPS') == '1', MAX_CONTENT_LENGTH=128 * 1024)
    if config:
        app.config.update(config)

    def db():
        if 'db' not in g:
            database = app.config['DATABASE']
            if app.config['PUBLIC_DEMO']:
                # Sample-only: reconstruct signed visitor state on any Vercel instance.
                database = ':memory:'
            g.db = sqlite3.connect(database, timeout=15, isolation_level=None)
            g.db.row_factory = sqlite3.Row
            g.db.execute('PRAGMA foreign_keys=ON')
            g.db.execute('PRAGMA journal_mode=WAL')
            g.db.execute('PRAGMA synchronous=FULL')
            if app.config['PUBLIC_DEMO']:
                g.db.executescript(Path(app.root_path, 'schema.sql').read_text())
                snapshot = session.get('demo_state')
                if snapshot:
                    g.db.execute('DELETE FROM settings')
                    for table in DEMO_TABLES:
                        rows = snapshot.get(table, [])
                        if rows:
                            placeholders = ','.join('?' for _ in rows[0])
                            g.db.executemany(f'INSERT INTO {table} VALUES ({placeholders})', rows)
                else:
                    seed_demo_records(g.db)
        return g.db

    @app.teardown_appcontext
    def close_db(error):
        if 'db' in g:
            g.pop('db').close()

    @contextmanager
    def write():
        connection = db()
        connection.execute('BEGIN IMMEDIATE')
        try:
            yield connection
            connection.commit()
        except BaseException:
            connection.rollback()
            raise

    login = LoginManager(app)
    login.login_view = 'signin'

    @login.user_loader
    def load_user(user_id):
        row = db().execute('SELECT * FROM users WHERE id=?', (user_id,)).fetchone()
        return User(row) if row else None

    @login.unauthorized_handler
    def unauthorized():
        if request.path.startswith('/api/'):
            abort(401, 'Sign in again, then retry the saved transaction.')
        return redirect(url_for('signin'))

    def admin_only(fn):
        @wraps(fn)
        @login_required
        def wrapped(*args, **kwargs):
            if current_user.role != 'admin':
                abort(403, 'Administrator permission required.')
            return fn(*args, **kwargs)
        return wrapped

    @app.before_request
    def protect_csrf():
        session.setdefault('csrf', secrets.token_hex(32))
        if request.method in ('POST', 'PUT', 'DELETE', 'PATCH'):
            supplied = request.headers.get('X-CSRF-Token') or request.form.get('csrf')
            if not supplied or not secrets.compare_digest(supplied, session['csrf']):
                abort(400, 'Session security token expired. Reload and try again.')
            if request.path.startswith('/api/') and not isinstance(request.get_json(silent=True), dict):
                abort(400, 'Expected a JSON object.')

    @app.after_request
    def headers(response):
        if app.config['PUBLIC_DEMO'] and 'db' in g and request.endpoint != 'signout':
            snapshot = {table: [list(row) for row in g.db.execute(f'SELECT * FROM {table}')] for table in DEMO_TABLES}
            candidate = dict(session, demo_state=snapshot)
            serializer = app.session_interface.get_signing_serializer(app)
            if len(serializer.dumps(candidate)) > 3500:
                # Reject before acknowledging: the previous signed snapshot is retained.
                response = jsonify(error='This sample session is full. Sign out and sign in to reset the demo.')
                response.status_code = 400
            else:
                session['demo_state'] = snapshot
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        return response

    @app.errorhandler(400)
    @app.errorhandler(401)
    @app.errorhandler(403)
    @app.errorhandler(404)
    @app.errorhandler(409)
    def request_error(error):
        if request.path.startswith('/api/'):
            return jsonify(error=error.description), error.code
        return render_template('error.html', message=error.description), error.code

    @app.errorhandler(sqlite3.IntegrityError)
    def integrity_error(error):
        app.logger.warning('Constraint rejected write: %s', error)
        return jsonify(error='The record conflicts with an existing record. Refresh and retry.'), 409

    @app.errorhandler(sqlite3.OperationalError)
    def database_error(error):
        app.logger.exception('Database operation failed')
        return jsonify(error='Database unavailable. Keep the saved transaction and retry.'), 503

    @app.template_filter('peso')
    def peso(value):
        return f'₱{value / 100:,.2f}'

    @app.context_processor
    def context():
        installation = db().execute("SELECT value FROM settings WHERE key='installation_id'").fetchone()
        return {'csrf': session['csrf'], 'installation': installation['value']}

    @app.route('/login', methods=['GET', 'POST'])
    def signin():
        error = None
        if request.method == 'POST':
            student_id = request.form.get('student_id', '').strip()
            row = db().execute('SELECT * FROM users WHERE username=?', (student_id,)).fetchone() if re.fullmatch(r'[0-9]{1,20}', student_id) else None
            if row:
                session.clear()
                session['csrf'] = secrets.token_hex(32)
                login_user(User(row))
                return redirect('/')
            error = 'Student ID is not registered. Ask the event administrator for access.'
        return render_template('login.html', error=error)

    @app.post('/logout')
    @login_required
    def signout():
        logout_user()
        session.clear()
        return redirect('/login')

    @app.get('/')
    @login_required
    def index():
        return render_template('cashier.html')

    @app.get('/api/catalog')
    @login_required
    def catalog():
        return jsonify([dict(r) for r in db().execute('SELECT p.id,p.sku,v.id revision,v.name,v.category,v.price,v.active FROM products p JOIN product_versions v ON v.id=p.current_revision ORDER BY v.category,v.name')])

    @app.post('/api/products')
    @admin_only
    def product_save():
        data = request.get_json()
        sku = text_value(data.get('sku'), 'SKU', 40)
        name = text_value(data.get('name'), 'Name')
        category = text_value(data.get('category'), 'Category', 60)
        price = integer(data.get('price'), 'Price')
        if type(data.get('active')) is not bool:
            abort(400, 'Active must be true or false.')
        with write() as conn:
            product_id = data.get('id')
            if product_id is None:
                product_id = conn.execute('INSERT INTO products(sku) VALUES (?)', (sku,)).lastrowid
            else:
                integer(product_id, 'Product ID', 1)
                if not conn.execute('SELECT id FROM products WHERE id=?', (product_id,)).fetchone():
                    abort(404)
                conn.execute('UPDATE products SET sku=? WHERE id=?', (sku, product_id))
            revision = conn.execute('INSERT INTO product_versions(product_id,name,category,price,active,created_at) VALUES (?,?,?,?,?,?)',
                                    (product_id, name, category, price, data['active'], now())).lastrowid
            conn.execute('UPDATE products SET current_revision=? WHERE id=?', (revision, product_id))
        return jsonify(id=product_id, revision=revision)

    @app.get('/api/shift')
    @login_required
    def current_shift():
        row = db().execute('SELECT * FROM shifts WHERE cashier_id=? AND closed_at IS NULL', (current_user.id,)).fetchone()
        return jsonify(dict(row) if row else None)

    @app.post('/api/shifts')
    @login_required
    def open_shift():
        data = request.get_json()
        device = text_value(data.get('device'), 'Device', 80)
        opening = 0
        with write() as conn:
            shift_id = conn.execute('INSERT INTO shifts(cashier_id,device,opened_at,opening_cash) VALUES (?,?,?,?)', (current_user.id, device, now(), opening)).lastrowid
        return jsonify(id=shift_id)

    def shift_summary(shift_id):
        shift = db().execute('SELECT * FROM shifts WHERE id=?', (shift_id,)).fetchone()
        if not shift:
            abort(404)
        if current_user.role != 'admin' and shift['cashier_id'] != int(current_user.id):
            abort(403)
        totals = {'cash': 0, 'gcash': 0, 'pending': 0, 'refunds': 0, 'voids': 0}
        for sale in db().execute('SELECT s.total,s.status,p.method,p.status payment_status FROM sales s JOIN payments p ON p.sale_id=s.id WHERE shift_id=?', (shift_id,)):
            if sale['status'] != 'completed':
                totals['refunds' if sale['status'] == 'refunded' else 'voids'] += sale['total']
            elif sale['payment_status'] == 'pending_verification':
                totals['pending'] += sale['total']
            else:
                totals[sale['method']] += sale['total']
        totals['expected_cash'] = shift['opening_cash'] + totals['cash']
        return {'shift': dict(shift), 'totals': totals}

    @app.get('/api/shifts/<int:shift_id>')
    @login_required
    def get_shift(shift_id):
        return jsonify(shift_summary(shift_id))

    @app.post('/api/shifts/<int:shift_id>/close')
    @login_required
    def close_shift(shift_id):
        closing = integer(request.get_json().get('closing_cash'), 'Counted cash')
        with write() as conn:
            shift_summary(shift_id)
            if not conn.execute('UPDATE shifts SET closed_at=?,closing_cash=? WHERE id=? AND closed_at IS NULL', (now(), closing, shift_id)).rowcount:
                abort(409, 'Shift already closed.')
        return jsonify(shift_summary(shift_id))

    def receipt_data(sale_id):
        row = db().execute('SELECT s.*,u.username cashier FROM sales s JOIN users u ON u.id=s.cashier_id WHERE s.id=?', (sale_id,)).fetchone()
        if not row:
            abort(404)
        result = dict(row)
        result.pop('payload')
        result['items'] = [dict(r) for r in db().execute('SELECT * FROM sale_items WHERE sale_id=?', (sale_id,))]
        result['payment'] = dict(db().execute('SELECT p.*,u.username verifier FROM payments p LEFT JOIN users u ON u.id=p.verified_by WHERE sale_id=?', (sale_id,)).fetchone())
        result['actions'] = [dict(r) for r in db().execute('SELECT a.*,u.username actor FROM sale_actions a JOIN users u ON u.id=a.actor_id WHERE sale_id=? ORDER BY a.id', (sale_id,))]
        result['sync_status'] = 'synced'
        return result

    @app.post('/api/sales')
    @login_required
    def submit_sale():
        data = request.get_json()
        if not isinstance(data, dict):
            abort(400, 'Expected a sale object.')
        try:
            transaction_id = str(UUID(data.get('transaction_id', '')))
        except (ValueError, TypeError, AttributeError):
            abort(400, 'A transaction UUID is required.')
        payload = json.dumps(data, sort_keys=True, separators=(',', ':'), ensure_ascii=True)
        with write() as conn:
            existing = conn.execute('SELECT * FROM sales WHERE transaction_id=?', (transaction_id,)).fetchone()
            if existing:
                if existing['cashier_id'] != int(current_user.id):
                    abort(403, 'This transaction belongs to another cashier.')
                if existing['payload'] != payload:
                    abort(409, 'Transaction UUID already exists with different contents. Do not create a second sale; find the original receipt.')
                sale_id = existing['id']
            else:
                device = text_value(data.get('device'), 'Device', 80)
                shift_id = integer(data.get('shift_id'), 'Shift', 1)
                shift = conn.execute('SELECT * FROM shifts WHERE id=? AND cashier_id=? AND closed_at IS NULL', (shift_id, current_user.id)).fetchone()
                if not shift or shift['device'] != device:
                    abort(409, 'Open a shift on this device before checkout.')
                client_at = text_value(data.get('client_at'), 'Client timestamp', 50)
                try:
                    if datetime.fromisoformat(client_at.replace('Z', '+00:00')).tzinfo is None:
                        raise ValueError()
                except ValueError:
                    abort(400, 'Client timestamp must include a timezone.')
                method = data.get('method')
                if method not in ('cash', 'gcash'):
                    abort(400, 'Unsupported payment method.')
                received = integer(data.get('received'), 'Cash received')
                items = data.get('items')
                if not isinstance(items, list) or not 1 <= len(items) <= 100:
                    abort(400, 'Cart must contain 1 to 100 items.')
                lines, seen, total = [], set(), 0
                for item in items:
                    if not isinstance(item, dict):
                        abort(400, 'Invalid cart item.')
                    product_id = integer(item.get('product_id'), 'Product', 1)
                    revision = integer(item.get('revision'), 'Revision', 1)
                    quantity = integer(item.get('quantity'), 'Quantity', 1, 999)
                    if product_id in seen:
                        abort(400, 'Combine duplicate products into one cart line.')
                    seen.add(product_id)
                    product = conn.execute('SELECT p.sku,v.* FROM products p JOIN product_versions v ON v.id=p.current_revision WHERE p.id=? AND v.id=? AND v.active=1', (product_id, revision)).fetchone()
                    if not product:
                        abort(409, 'Catalog changed. Review current prices and start a fresh checkout after checking transaction history.')
                    total += product['price'] * quantity
                    lines.append((product_id, revision, product['sku'], product['name'], product['price'], quantity))
                integer(total, 'Total')
                if method == 'cash' and received < total:
                    abort(400, 'Cash received is less than the total.')
                if method == 'gcash' and received != 0:
                    abort(400, 'GCash does not accept cash received.')
                sale_id = conn.execute('INSERT INTO sales(transaction_id,payload,cashier_id,device,shift_id,client_at,created_at,currency,total) VALUES (?,?,?,?,?,?,?,?,?)',
                                       (transaction_id, payload, current_user.id, device, shift_id, client_at, now(), 'PHP', total)).lastrowid
                # Sequence is allocated under the same transaction and UNIQUE receipt constraint.
                conn.execute('UPDATE sales SET receipt=? WHERE id=?', (f'RS-{sale_id:07d}', sale_id))
                conn.executemany('INSERT INTO sale_items(sale_id,product_id,revision,sku,name,price,quantity) VALUES (?,?,?,?,?,?,?)', [(sale_id, *line) for line in lines])
                conn.execute('INSERT INTO payments(sale_id,method,status,received,change_due) VALUES (?,?,?,?,?)',
                             (sale_id, method, 'paid' if method == 'cash' else 'pending_verification', received, received - total if method == 'cash' else 0))
        # No success response is constructed until COMMIT has returned.
        return jsonify(receipt_data(sale_id))

    @app.post('/api/sales/<int:sale_id>/action')
    @admin_only
    def sale_action(sale_id):
        data = request.get_json()
        kind = data.get('kind')
        reason = text_value(data.get('reason'), 'Reason', 500)
        with write() as conn:
            sale = conn.execute('SELECT s.*,p.status payment_status,p.method FROM sales s JOIN payments p ON p.sale_id=s.id WHERE s.id=?', (sale_id,)).fetchone()
            if not sale:
                abort(404)
            if sale['status'] != 'completed':
                abort(409, 'This sale was already reversed.')
            if kind == 'verify':
                if sale['method'] != 'gcash' or sale['payment_status'] != 'pending_verification':
                    abort(409, 'Payment is not awaiting GCash verification.')
                reference = text_value(data.get('reference'), 'GCash reference', 100)
                conn.execute("UPDATE payments SET status='paid',reference=?,verified_by=?,verified_at=? WHERE sale_id=?", (reference, current_user.id, now(), sale_id))
            elif kind in ('void', 'refund'):
                if kind == 'refund' and sale['payment_status'] != 'paid':
                    abort(409, 'Unverified payments must be voided, not refunded.')
                conn.execute('UPDATE sales SET status=? WHERE id=?', ('voided' if kind == 'void' else 'refunded', sale_id))
            else:
                abort(400, 'Unsupported action.')
            conn.execute('INSERT INTO sale_actions(sale_id,kind,actor_id,reason,created_at) VALUES (?,?,?,?,?)', (sale_id, kind, current_user.id, reason, now()))
        return jsonify(receipt_data(sale_id))

    @app.get('/api/sales')
    @login_required
    def sales_search():
        query = request.args.get('q', '')[:120]
        rows = db().execute('SELECT s.id,s.receipt,s.created_at,s.total,s.status,u.username cashier,p.method,p.status payment_status FROM sales s JOIN users u ON u.id=s.cashier_id JOIN payments p ON p.sale_id=s.id WHERE s.receipt LIKE ? OR s.transaction_id=? ORDER BY s.id DESC LIMIT 100', (f'%{query}%', query))
        return jsonify([dict(r) for r in rows])

    @app.get('/receipt/<int:sale_id>')
    @login_required
    def receipt(sale_id):
        return render_template('receipt.html', sale=receipt_data(sale_id))

    @app.get('/api/export.csv')
    @admin_only
    def export_csv():
        output = io.StringIO(newline='')
        writer = csv.writer(output)
        writer.writerow(['Receipt', 'UUID', 'Server time UTC', 'Client time', 'Cashier', 'Device', 'Shift', 'Currency', 'Total centavos', 'Sale status', 'Method', 'Payment status', 'Received centavos', 'Change centavos', 'GCash reference', 'Verifier', 'Verified at'])
        rows = db().execute('SELECT s.receipt,s.transaction_id,s.created_at,s.client_at,u.username,s.device,s.shift_id,s.currency,s.total,s.status,p.method,p.status,p.received,p.change_due,p.reference,v.username,p.verified_at FROM sales s JOIN payments p ON p.sale_id=s.id JOIN users u ON u.id=s.cashier_id LEFT JOIN users v ON v.id=p.verified_by ORDER BY s.id')
        for row in rows:
            writer.writerow([safe_csv(value) for value in row])
        return app.response_class(output.getvalue(), mimetype='text/csv', headers={'Content-Disposition': 'attachment; filename=rose-sales.csv'})

    @app.cli.command('init-db')
    def init_db():
        db().executescript(Path(app.root_path, 'schema.sql').read_text())
        click.echo('Schema version 1 ready (existing records retained).')

    def validate_student_id(student_id):
        if not re.fullmatch(r'[0-9]{1,20}', student_id):
            raise click.ClickException('Student ID must contain 1 to 20 digits.')

    @app.cli.command('add-user')
    @click.argument('student_id')
    @click.option('--admin', is_flag=True)
    def add_user(student_id, admin):
        validate_student_id(student_id)
        with write() as conn:
            conn.execute("INSERT INTO users(username,password_hash,role) VALUES (?,'',?)", (student_id, 'admin' if admin else 'cashier'))
        click.echo('Student ID registered.')

    @app.cli.command('set-student-id')
    @click.argument('existing_username')
    @click.argument('student_id')
    def set_student_id(existing_username, student_id):
        validate_student_id(student_id)
        with write() as conn:
            if not conn.execute("UPDATE users SET username=?,password_hash='' WHERE username=?", (student_id, existing_username)).rowcount:
                raise click.ClickException('Existing account not found.')
        click.echo('Student ID assigned; role, sales and shifts retained.')

    @app.cli.command('seed-demo')
    def seed_demo():
        with write() as conn:
            if conn.execute('SELECT count(*) FROM users').fetchone()[0] or conn.execute('SELECT count(*) FROM products').fetchone()[0]:
                raise click.ClickException('Demo seed requires an empty database. Use a separate demo directory.')
            seed_demo_records(conn)
        click.echo('DEMO users and catalog created. Never use this database for event sales.')

    @app.cli.command('backup')
    @click.argument('destination', type=click.Path())
    def backup(destination):
        if Path(destination).exists():
            raise click.ClickException('Destination already exists.')
        with closing(sqlite3.connect(destination)) as target:
            db().backup(target)
        click.echo('Consistent SQLite backup complete.')

    return app


def safe_csv(value):
    if isinstance(value, str) and (value.startswith(('\t', '\r', '\n')) or value.lstrip().startswith(('=', '+', '-', '@'))):
        return "'" + value
    return value


app = create_app({'DATABASE': os.environ['ROSE_DATABASE']} if os.environ.get('ROSE_DATABASE') else None)

if __name__ == '__main__':
    from waitress import serve
    serve(app, host=os.environ.get('ROSE_HOST', '127.0.0.1'), port=int(os.environ.get('ROSE_PORT', '8080')), threads=8)