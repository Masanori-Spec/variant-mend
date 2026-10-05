import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
const required=['tests/core.test.mjs','tests/cli.test.mjs','tests/runner.test.mjs'];
const missing=required.filter(name=>{try{const s=fs.statSync(path.join(root,name));return !s.isFile()||s.size===0;}catch{return true;}});
if(missing.length){console.error('Required test files are missing, empty, or not regular files: '+missing.join(', '));process.exit(1);}
const result=spawnSync(process.execPath,['--test',...required],{cwd:root,stdio:'inherit'});
if(result.error){console.error(result.error.message);process.exit(1);}
process.exit(result.status??1);
