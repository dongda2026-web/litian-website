import path from 'node:path';
import { ReleaseStore } from '../cms/release-store.mjs';
import { createCmsServer, createReleasedSiteServer, wordpressReader } from '../cms/service.mjs';

const local = process.env.CMS_LOCAL === '1';
const store = new ReleaseStore({ sourceRoot: process.cwd(), storageRoot: process.env.CMS_STORAGE_ROOT || path.resolve('var/cms/releases'),
  readExport: wordpressReader({ url: process.env.CMS_WORDPRESS_URL, username: process.env.CMS_EXPORT_USER, applicationPassword: process.env.CMS_EXPORT_PASSWORD, local }),
  assetOrigin: process.env.CMS_ASSET_ORIGIN || 'https://cn-dongda.com' });
await store.initialize();
const bridge = createCmsServer(store, process.env.CMS_BRIDGE_KEY), frontend = createReleasedSiteServer(store);
bridge.listen(Number(process.env.CMS_BRIDGE_PORT || 4193), '127.0.0.1');
frontend.listen(Number(process.env.CMS_PREVIEW_PORT || 4194), '127.0.0.1');
process.stdout.write(JSON.stringify({ event: 'cms_service_start', environment: local ? 'local' : 'configured', bridgePort: Number(process.env.CMS_BRIDGE_PORT || 4193), previewPort: Number(process.env.CMS_PREVIEW_PORT || 4194), cloudPublishing: false }) + '\n');
for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => { bridge.close(); frontend.close(); });
