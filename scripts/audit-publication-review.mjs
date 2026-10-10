import {assessPublication,requirePublication} from './publication-review-core.mjs';
const args=process.argv.slice(2);if(args.some(arg=>arg!=='--preview')||args.length>1)throw new TypeError('Unknown publication audit mode');
try{
  const result=await assessPublication(process.cwd());
  process.stdout.write(JSON.stringify({scope:args.includes('--preview')?'draft-preview':'production-publication',...result})+'\n');
  if(!args.includes('--preview'))requirePublication(result);
}catch(error){process.stderr.write((error.code||'PUBLICATION_REVIEW_INVALID')+': '+error.message+'\n');process.exitCode=1;}
