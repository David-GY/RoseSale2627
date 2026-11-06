// Sample catalog transcribed from Encoder Tab 3 and Inventory on 2026-11-06.
// Prices are PHP. Stock is intentionally unspecified; this is not a live inventory.
const catalog = [
  ['Bundles', 'Just Stick Around Bundle', 350, []],
  ['Bundles', 'Yours Everyday Bundle', 450, []],
  ['Bundles', "Valentina's Bundle", 500, []],
  ['Bundles', 'The Konvy Bundle', 700, []],
  ['Bouquets', 'Rose Bouquet', 300, []],
  ['Bouquets', 'Carnation Bouquet', 300, []],
  ['Bouquets', 'Tulip Bouquet', 700, []],
  ['Flowers', 'Roses', 100, ['Red Rose', 'White Rose', 'Pink Rose']],
  ['Flowers', 'Carnations', 100, ['Light Pink Carnation', 'Pomelo Carnation', 'Two-Toned Carnation']],
  ['Flowers', 'Tulips', 250, ['Yellow Tulip', 'Pink Tulip']],
  ['Flowers', 'Gerberas', 150, ['Yellow Gerbera', 'Pink Gerbera']],
  ['Flowers', 'Premium Carnations', 120, ['Blue Carnation', 'Lavender Carnation']],
  ['Flowers', 'Lego Flower', 120, ['Transparent Red Lego Flower', 'Red Lego Flower', 'Pink Lego Flower', 'Blue Lego Flower']],
  ['Flowers', 'Foil Flower', 150, ['Purple Foil Flower', 'White Foil Flower']],
  ['Flowers', 'Crochet Flower', 200, ['Light Pink Crochet Flower', 'Yellow Crochet Flower', 'Red Crochet Flower']],
  ['Gifts', 'Magnetic Couple Keychain', 200, ['Chiikawa Magnetic Couple Keychain', 'Dog Magnetic Couple Keychain']],
  ['Gifts', 'Tangled Couple Bracelet', 300, []],
  ['Gifts', 'Couple Bracelet', 200, ['Yin & Yang Couple Bracelet', 'Bear & Rabbit Couple Bracelet']],
  ['Gifts', 'Flower Clamps', 100, ['Pink Flower Clamps', 'Blue Flower Clamps', 'Purple Flower Clamps', 'Acrylic Flower Clamps']],
  ['Gifts', 'Cassette Recorder', 120, ['Red Cassette Recorder', 'Blue Cassette Recorder']],
  ['Gifts', 'Octopus Reversible Plushie', 120, ['Light Blue & Blue Octopus Reversible Plushie', 'Blue & Pink Octopus Reversible Plushie']],
  ['Cards & stickers', "Valentine's Day Card", 20, ["Rose Heart Valentine's Day Card", "Rose Ribbon Valentine's Day Card", "Tulip Valentine's Day Card"]],
  ['Cards & stickers', 'Large Sticker', 25, ['Lovebound Sticker', 'Soft Spot Sticker', 'Bloom Besties Sticker', "Panda's Serenade Sticker", 'Heart Strings Sticker']],
  ['Add-ons', 'Letter', 10, []],
  ['Add-ons', 'Advocacy Flower', 80, []]
].map(([category, name, price, variants], index) => ({
  id: `sample-${String(index + 1).padStart(2, '0')}`,
  category, name, price, currency: 'PHP', variants, stock: null
}));

if (typeof module !== 'undefined') module.exports = catalog;
