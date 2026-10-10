import { parentPort, workerData } from 'node:worker_threads';
import { PDFDocument, PDFArray, PDFDict, PDFName, PDFRawStream, PDFRef } from 'pdf-lib';

try {
  const document = await PDFDocument.load(workerData, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false });
  if (document.isEncrypted || document.getPageCount() < 1 || document.getPageCount() > 100) throw new Error('file_content_not_allowed');
  const objects = document.context.enumerateIndirectObjects();
  if (objects.length > 5000) throw new Error('file_complexity_limit');
  const forbidden = new Set(['JS', 'JavaScript', 'AA', 'EmbeddedFiles', 'EmbeddedFile', 'EF', 'RichMedia', 'XFA']);
  const actions = new Set(['JavaScript', 'Launch', 'SubmitForm', 'ImportData', 'Rendition', 'GoToE']);
  const seen = new Set(); let nodes = 0;
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    if (++nodes > 20000 || depth > 50) throw new Error('file_complexity_limit');
    seen.add(value);
    if (value instanceof PDFRef) { visit(document.context.lookup(value), depth + 1); return; }
    if (value instanceof PDFRawStream) { visit(value.dict, depth + 1); return; }
    if (value instanceof PDFArray) { for (const child of value.asArray()) visit(child, depth + 1); return; }
    if (!(value instanceof PDFDict)) return;
    for (const [key, child] of value.entries()) {
      const name = key.decodeText();
      const resolved = child instanceof PDFRef ? document.context.lookup(child) : child;
      if (forbidden.has(name) || resolved instanceof PDFName && (forbidden.has(resolved.decodeText()) || name === 'S' && actions.has(resolved.decodeText()))) throw new Error('file_content_not_allowed');
      if (name === 'OpenAction' && !(resolved instanceof PDFArray)) throw new Error('file_content_not_allowed');
      visit(child, depth + 1);
    }
  };
  visit(document.catalog);
  for (const [, value] of objects) visit(value);
  parentPort.postMessage({ ok: true });
} catch (error) {
  parentPort.postMessage({ ok: false, code: error?.message === 'file_complexity_limit' ? 'file_complexity_limit' : 'file_content_not_allowed' });
} finally { parentPort.close(); }
