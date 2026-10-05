import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {analyze,LIMITS,ScopeError} from '../src/core.mjs';
const [file,oldPath='/Product/Old',newName='Handle',out='artifacts/repaired.usda',receipt='artifacts/rename-receipt.json']=process.argv.slice(2);
try {
 if(!file||path.extname(file).toLowerCase()!=='.usda')throw new ScopeError('FORMAT','Input must be one .usda file');
 if(new Set([file,out,receipt].map(x=>path.resolve(x))).size!==3)throw new ScopeError('DESTINATION','Input, output and receipt must be separate files');
 const identities=[];for(const [index,destination] of [file,out,receipt].entries()){try{const info=await fs.stat(destination);if(!info.isFile())throw new ScopeError(index===0?'FORMAT':'DESTINATION','All paths must resolve to regular files');if(index===0&&info.size>LIMITS.bytes)throw new ScopeError('SIZE','Input exceeds 1 MiB');const identity=`${info.dev}:${info.ino}`;if(identities.includes(identity))throw new ScopeError('DESTINATION','Input, output and receipt must not be aliases of one file');identities.push(identity);}catch(e){if(e.code!=='ENOENT')throw e;}}
 const bytes=await fs.readFile(file);if(bytes.length>LIMITS.bytes)throw new ScopeError('SIZE','Input exceeds 1 MiB');
 let source;try{source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw new ScopeError('ENCODING','Input is not valid UTF-8');}
 const result=await analyze(source,oldPath,newName);
 await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(path.dirname(receipt),{recursive:true});
 const atomicWrite=async(destination,text)=>{const temp=path.join(path.dirname(destination),'.variant-mend-'+randomUUID()+'.tmp');try{await fs.writeFile(temp,text,{flag:'wx'});await fs.rename(temp,destination);}finally{await fs.rm(temp,{force:true});}};
 await atomicWrite(out,result.output);await atomicWrite(receipt,JSON.stringify(result.receipt,null,2)+'\n');
 console.log(JSON.stringify({output:out,receipt,edits:result.receipt.edits.length,combinations:result.coverage.length}));
}catch(e){console.error(JSON.stringify({code:e.code??'ERROR',message:e.message}));process.exitCode=1;}
