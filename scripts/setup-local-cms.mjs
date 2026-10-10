import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';

const root = process.cwd(), directory = path.resolve('var/cms'), configFile = path.join(directory, 'local-identities.json');
await fs.mkdir(directory, { recursive: true, mode: 0o700 });
let config;
try { config = JSON.parse(await fs.readFile(configFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error;
  const password = () => randomBytes(32).toString('hex');
  config = { adminPassword: password(), reviewerPassword: password(), authorPassword: password(), dbPassword: password(), dbRootPassword: password(), bridgeKey: password() };
  await fs.writeFile(configFile, JSON.stringify(config), { mode: 0o600 });
}
const dockerEnv = path.join(directory, 'docker.env');
await fs.writeFile(dockerEnv, `CMS_DB_PASSWORD=${config.dbPassword}\nCMS_DB_ROOT_PASSWORD=${config.dbRootPassword}\nCMS_BRIDGE_KEY=${config.bridgeKey}\n`, { mode: 0o600 });
const compose = ['compose', '--env-file', dockerEnv, '-f', path.resolve('cms/wordpress/compose.yaml')];
execFileSync('docker', [...compose, 'up', '-d', '--wait'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000 });
const container = execFileSync('docker', [...compose, 'ps', '-q', 'wordpress'], { encoding: 'utf8' }).trim();
execFileSync('docker', ['cp', 'cms/wordpress/install-local.php', container + ':/tmp/dongda-install-local.php'], { stdio: 'ignore' });
const input = { adminPassword: config.adminPassword, reviewerPassword: config.reviewerPassword, authorPassword: config.authorPassword, existingApplicationPasswords: config.applicationPasswords || null };
const result = await new Promise((resolve, reject) => {
  const child = spawn('docker', ['exec', '-i', container, 'php', '/tmp/dongda-install-local.php'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', diagnostic = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => diagnostic += chunk);
  child.on('error', reject); child.on('exit', code => { if (code !== 0) reject(new Error('Local WordPress setup failed; inspect container diagnostics without printing secrets')); else resolve(JSON.parse(output)); });
  child.stdin.end(JSON.stringify(input));
});
if (!config.applicationPasswords) config.applicationPasswords = result.applicationPasswords;
config.users = result.users; await fs.writeFile(configFile, JSON.stringify(config), { mode: 0o600 });
await fs.writeFile(path.join(directory, 'service.env'), `CMS_LOCAL=1\nCMS_WORDPRESS_URL=http://127.0.0.1:4192\nCMS_EXPORT_USER=dd-cms-exporter\nCMS_EXPORT_PASSWORD=${config.applicationPasswords['dd-cms-exporter']}\nCMS_BRIDGE_KEY=${config.bridgeKey}\nCMS_STORAGE_ROOT=${path.join(directory, 'releases')}\nCMS_ASSET_ORIGIN=http://127.0.0.1:4191\n`, { mode: 0o600 });
await fs.writeFile(path.join(directory, 'runtime-identity.json'), JSON.stringify({ wordpress: result.version, php: result.php, importedDrafts: result.newRecords, environment: 'isolated-local', cmsUrl: 'http://127.0.0.1:4192/wp-admin/admin.php?page=dongda-content', publicPreview: 'http://127.0.0.1:4194/', cloudWrites: false }, null, 2));
process.stdout.write(JSON.stringify({ wordpress: result.version, php: result.php, importedDrafts: result.newRecords, cmsUrl: 'http://127.0.0.1:4192/wp-admin/admin.php?page=dongda-content', secretFilesPrinted: false, existingErpContainersChanged: false }) + '\n');
