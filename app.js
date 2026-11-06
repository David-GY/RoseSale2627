const search = document.getElementById('search');
const category = document.getElementById('category');
const items = document.getElementById('items');
const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
for (const name of new Set(catalog.map(item => item.category))) {
  category.add(new Option(name, name));
}
function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function render() {
  const query = search.value.trim().toLowerCase();
  const matches = catalog.filter(item => (!category.value || item.category === category.value)
    && [item.name, ...item.variants].join(' ').toLowerCase().includes(query));
  items.replaceChildren();
  for (const item of matches) {
    const card = document.createElement('article');
    card.append(element('span', item.category, 'category'), element('h2', item.name), element('div', money.format(item.price), 'price'));
    if (item.variants.length) {
      const list = document.createElement('ul');
      for (const variant of item.variants) list.append(element('li', variant));
      card.append(list);
    }
    items.append(card);
  }
  document.getElementById('count').textContent = matches.length ? `${matches.length} product groups` : 'No items found. Try another search or category.';
}
search.addEventListener('input', render);
category.addEventListener('change', render);
render();
