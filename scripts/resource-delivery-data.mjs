import {createHash} from 'node:crypto';
import '../assets/js/resource-core.js';
import '../assets/js/resource-delivery-core.js';

export function resourceDeliveryData(registry) {
  const core=globalThis.DongDaResources,delivery=globalThis.DongDaResourceDelivery;
  const files=registry.entries.flatMap(entry=>core.languages.map(language=>{
    const bytes=Buffer.from(core.downloadText(entry,language,registry),'utf8');
    const sha256=createHash('sha256').update(bytes).digest('hex'),legacyPath=core.filePath(entry,language);
    return {path:delivery.filename(legacyPath,sha256),legacyPath,resourceId:entry.id,productId:entry.productId,language,version:entry.version,updatedAt:entry.updatedAt,mediaType:'text/plain; charset=utf-8',size:bytes.length,sha256};
  }));
  const data={version:delivery.version,files};delivery.create(data,registry);return data;
}
