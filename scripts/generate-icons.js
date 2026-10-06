import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const logoPath = path.resolve('public/nita-logo.jpg');
const logoBuffer = fs.readFileSync(logoPath);

async function generate() {
  // 192x192
  await sharp(logoBuffer)
    .resize(192, 192, { fit: 'cover' })
    .png()
    .toFile(path.resolve('public/pwa-192x192.png'));

  // 512x512
  await sharp(logoBuffer)
    .resize(512, 512, { fit: 'cover' })
    .png()
    .toFile(path.resolve('public/pwa-512x512.png'));

  // 180x180 for iOS Apple Touch Icon
  await sharp(logoBuffer)
    .resize(180, 180, { fit: 'cover' })
    .png()
    .toFile(path.resolve('public/apple-touch-icon.png'));

  // 512x512 maskable (with 10% safe zone padding as required by PWA standards)
  const innerSize = Math.round(512 * 0.85);
  const innerIcon = await sharp(logoBuffer)
    .resize(innerSize, innerSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite([{ input: innerIcon, gravity: 'center' }])
    .png()
    .toFile(path.resolve('public/pwa-maskable-512x512.png'));

  console.log('Successfully generated all PWA icons with official Nita logo!');
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
