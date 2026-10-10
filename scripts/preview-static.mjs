import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { staticPreview } from '../server/static-preview.mjs';
import { loadStaticDelivery } from './load-static-delivery.mjs';

const root=resolve(process.argv[2]||'dist/client'),port=Number(process.argv[3]||4201);
if(!Number.isInteger(port)||port<1024||port>65535)throw new TypeError('Invalid static preview port');
if(process.argv.slice(4).some(value=>value!=='--delivery')||process.argv.slice(4).length>1)throw new TypeError('Invalid static preview option');
const options=process.argv.includes('--delivery')?await loadStaticDelivery(root):{};
const server=createServer(staticPreview(root,undefined,options));
server.listen(port,'127.0.0.1',()=>process.stdout.write(`Static-only preview: http://127.0.0.1:${port}/\nNo inquiry, upload or CRM endpoint is enabled.\nDelivery/compression acceptance profile: ${options.delivery===true?'enabled (local only)':'disabled'}\n`));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>process.exit(0)));
