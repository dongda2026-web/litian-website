import {parse} from 'parse5';
import {nodes,attribute,plainText} from './build-product-pages.mjs';
import {staticDeclarations,literal} from './publication-review-core.mjs';

// Read literal translations only; never execute embedded website scripts.
export function companyLegacy(source){
  const document=parse(source),data=Object.create(null),programs=[];
  for(const script of nodes(document,n=>n.tagName==='script'&&!attribute(n,'src')&&attribute(n,'type')!=='application/ld+json')){
    const extracted=staticDeclarations(plainText(script));Object.assign(data,extracted.data);programs.push(extracted.ast);
  }
  function walk(node){
    if(!node||typeof node!=='object')return;
    if(node.type==='CallExpression'&&node.callee?.object?.name==='Object'&&node.callee?.property?.name==='assign'){
      const target=node.arguments[0];
      if(target?.type==='MemberExpression'&&target.object?.name==='T'&&!target.computed&&data.T?.[target.property?.name]){
        for(const argument of node.arguments.slice(1))Object.assign(data.T[target.property.name],literal(argument));
      }
    }
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
  }
  programs.forEach(walk);
  return {document,...data};
}
