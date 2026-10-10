import { Worker } from 'node:worker_threads';
import { UploadError } from './upload-scanner.mjs';

export function inspectUploadPdf(bytes) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pdf-upload-worker.mjs', import.meta.url), { workerData: bytes, env: {}, execArgv: [], stdout: true, stderr: true,
      resourceLimits: { maxOldGenerationSizeMb: 64, stackSizeMb: 4 } });
    worker.stdout.resume(); worker.stderr.resume();
    let settled = false;
    const finish = async error => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      try { await worker.terminate(); } catch { error = new UploadError(503, 'pdf_inspection_unavailable'); }
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(() => void finish(new UploadError(422, 'file_complexity_limit')), 2000);
    worker.once('error', () => void finish(new UploadError(422, 'file_content_not_allowed')));
    worker.once('exit', () => { if (!settled) void finish(new UploadError(503, 'pdf_inspection_unavailable')); });
    worker.once('message', result => void finish(result?.ok === true ? null : new UploadError(422, result?.code === 'file_complexity_limit' ? result.code : 'file_content_not_allowed')));
  });
}
