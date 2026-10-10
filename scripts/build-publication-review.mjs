import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {parse,serialize} from 'parse5';
import {nodes,attribute,inner} from './build-product-pages.mjs';
import {assessPublication,reviewVersion} from './publication-review-core.mjs';
import '../assets/js/public-review-copy.js';
export function localizeServiceBadge(document,locale){
  const badges=nodes(document,node=>attribute(node,'data-reviewed-service')!==undefined);
  if(badges.length!==1||attribute(badges[0],'data-i')!==undefined)throw new TypeError('Invalid reviewed service badge');
  inner(badges[0],globalThis.DongDaProductPage.escape(globalThis.DongDaPublicReviewCopy.service(locale)));
}
export async function buildPublicationReview({root,client,routes}){
  const review=await assessPublication(root);
  for(const route of [{path:'/',language:'en'},...routes]){
    const file=join(client,route.path,'index.html'),document=parse(await readFile(file,'utf8'));localizeServiceBadge(document,route.language);await writeFile(file,serialize(document));
  }
  const manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));
  manifest.publication_review={version:reviewVersion,publishable:review.publishable,status:review.publishable?'review-records-valid':'review-required'};
  await writeFile(join(client,'site-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  process.stdout.write(`Publication review: ${review.claims} private groups; publishable=${review.publishable}. Local build does NOT grant publication.\n`);
}
