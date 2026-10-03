import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const siteRoot = resolve(scriptDir, '..');
const workRoot = resolve(siteRoot, '../..');
const themeRoot = resolve(workRoot, 'litian-wordpress-theme/litian-group');

const requiredFiles = [
  'style.css',
  'functions.php',
  'index.php',
  'front-page.php',
  'README.md',
  'STAGING-HANDOFF.md',
  'screenshot.png',
  'assets/img/litian-product-series-hero-20260722.png',
  'assets/img/litian-product-series-hero-20260722.webp',
  'assets/img/litian-product-series-hero-20260722-mobile.webp',
];

const failures = [];

for (const file of requiredFiles) {
  if (!existsSync(join(themeRoot, file))) {
    failures.push(`missing ${file}`);
  }
}

const styleCss = readFileSync(join(themeRoot, 'style.css'), 'utf8');
if (!/Theme Name:\s*DongDa/.test(styleCss)) failures.push('style.css missing Theme Name');
if (!/Version:\s*2026\.07\.23/.test(styleCss)) failures.push('style.css version is not 2026.07.23');

const frontPage = readFileSync(join(themeRoot, 'front-page.php'), 'utf8');
if (!frontPage.includes('wp_head();')) failures.push('front-page.php missing wp_head()');
if (!frontPage.includes('wp_footer();')) failures.push('front-page.php missing wp_footer()');
if (!frontPage.includes('get_template_directory_uri()')) failures.push('front-page.php missing theme asset URI conversion');
if (!frontPage.includes('litian-product-series-hero-20260722-mobile.webp')) failures.push('front-page.php missing mobile WebP hero source');
if (/["'=(]assets\//.test(frontPage) || /["'=(]workers\//.test(frontPage)) {
  failures.push('front-page.php has relative assets/ or workers/ references');
}

if (failures.length) {
  console.error('WordPress theme preflight failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('WordPress theme preflight passed.');
