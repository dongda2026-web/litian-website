import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(scriptDir, '..');
const workspaceWorkRoot = resolve(siteRoot, '../..');
const themeRoot = resolve(workspaceWorkRoot, 'litian-wordpress-theme/litian-group');
const sourceHtmlPath = join(siteRoot, 'index.html');
const outputPhpPath = join(themeRoot, 'front-page.php');

const themeUri = "<?php echo esc_url(get_template_directory_uri()); ?>";
const homeUrl = "<?php echo esc_url(home_url('/')); ?>";

let html = readFileSync(sourceHtmlPath, 'utf8');

html = html.replace('<html lang="en">', '<html <?php language_attributes(); ?>>');
html = html.replace('<meta charset="utf-8"/>', '<meta charset="<?php bloginfo(\'charset\'); ?>"/>');
html = html.replace(/https:\/\/china-litian\.pages\.dev\/assets\//g, `${themeUri}/assets/`);
html = html.replace(/https:\/\/china-litian\.pages\.dev\//g, homeUrl);
html = html.replace(/(["'(])assets\//g, `$1${themeUri}/assets/`);
html = html.replace(/(["'(])workers\//g, `$1${themeUri}/workers/`);

if (!html.includes('wp_head()')) {
  html = html.replace('</head>', '<?php wp_head(); ?>\n</head>');
}

if (!html.includes('wp_footer()')) {
  html = html.replace('</body>', '<?php wp_footer(); ?>\n</body>');
}

const phpHeader = `<?php
/**
 * Template Name: DongDa Home
 *
 * Generated from work/litian-upgrade/litian-website/index.html.
 */
if (!defined('ABSPATH')) {
    exit;
}
?>
`;

mkdirSync(dirname(outputPhpPath), { recursive: true });
writeFileSync(outputPhpPath, `${phpHeader}${html}`, 'utf8');

const themeAssetDir = join(themeRoot, 'assets/img');
mkdirSync(themeAssetDir, { recursive: true });

const legacyImgDir = join(themeRoot, 'img');
const heroAssets = [
  'litian-product-series-hero-20260722.png',
  'litian-product-series-hero-20260722.webp',
  'litian-product-series-hero-20260722-mobile.webp',
];
const brandAssets = [
  'logo_dongda_official.png',
  'logo_litian.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

for (const asset of [...heroAssets, ...brandAssets]) {
  const sourceAsset = join(siteRoot, 'assets/img', asset);
  if (!existsSync(sourceAsset)) {
    continue;
  }

  const targetAsset = join(themeAssetDir, asset);
  mkdirSync(dirname(targetAsset), { recursive: true });
  copyFileSync(sourceAsset, targetAsset);
  if (existsSync(legacyImgDir)) {
    const legacyTarget = join(legacyImgDir, asset);
    mkdirSync(dirname(legacyTarget), { recursive: true });
    copyFileSync(sourceAsset, legacyTarget);
  }
}

console.log(`Synced ${outputPhpPath}`);
console.log(`Copied ${heroAssets.length + brandAssets.length} hero and brand assets into WordPress theme assets`);
