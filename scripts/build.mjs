import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const style=await fs.readFile('src/style.css','utf8');
const core=(await fs.readFile('src/core.mjs','utf8')).replace(/^export /gm,'');
const sample=(await fs.readFile('src/sample.mjs','utf8')).replace(/^export /gm,'');
const app=(await fs.readFile('src/app.mjs','utf8')).replace(/^import .*;\n/gm,'');
const inline=`\n${core}\n${sample}\n${app}\n`.replace(/<\/script/gi,match=>'<\\/'+match.slice(2));
// Check the exact module that the HTML parser will expose, before writing an artifact.
const syntax=spawnSync(process.execPath,['--check','--input-type=module'],{input:inline,encoding:'utf8'});
if(syntax.error||syntax.status!==0)throw Error('Standalone module syntax check failed: '+(syntax.error?.message??syntax.stderr));
let html=await fs.readFile('index.html','utf8');
const stylePlaceholder='<link rel="stylesheet" href="src/style.css">';
const scriptPlaceholder='<script type="module" src="src/app.mjs"></script>';
for(const marker of [stylePlaceholder,scriptPlaceholder])if(html.split(marker).length!==2)throw Error('Expected exactly one standalone build placeholder: '+marker);
// Functions preserve literal dollar sequences such as $$ and $& in JavaScript/CSS.
html=html.replace(stylePlaceholder,()=>`<style>${style}</style>`).replace(scriptPlaceholder,()=>`<script type="module">${inline}</script>`);
await fs.mkdir('dist',{recursive:true});
await fs.writeFile('dist/variant-mend.html',html);
console.log('Built and syntax-checked self-contained dist/variant-mend.html');
