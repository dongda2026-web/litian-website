import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import '../assets/js/form-feedback-core.js';
export async function buildFormFeedback({client}){
  const path=join(client,'site-manifest.json'),manifest=JSON.parse(await readFile(path,'utf8'));
  manifest.form_feedback_version=globalThis.DongDaFormFeedbackCore.version;
  await writeFile(path,JSON.stringify(manifest,null,2)+'\n');
}
