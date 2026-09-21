import sharp from 'sharp';
for (const size of [192, 512]) await sharp('public/icons/icon.svg').resize(size,size).png().toFile('public/icons/icon-' + size + '.png');
console.log('Ícones PNG gerados.');

