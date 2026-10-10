import { Search, RefreshCw, LogOut, ArrowLeft, ArrowRight, Save, Mail, Phone, Inbox, CircleAlert, Check, X, ChevronRight, LockKeyhole, Activity } from 'lucide';
import { readFile, writeFile } from 'node:fs/promises';

const icons = { Search, RefreshCw, LogOut, ArrowLeft, ArrowRight, Save, Mail, Phone, Inbox, CircleAlert, Check, X, ChevronRight, LockKeyhole, Activity };
await writeFile(new URL('../server/admin-ui/icons.json', import.meta.url), JSON.stringify(icons));
await writeFile(new URL('../server/admin-ui/ICON-LICENSE.txt', import.meta.url), 'Lucide 1.53.0 - https://lucide.dev/license\n\n' + await readFile(new URL('../node_modules/lucide/LICENSE', import.meta.url), 'utf8'));
process.stdout.write('Generated 15 local Lucide icons for the private sales workspace.\n');
