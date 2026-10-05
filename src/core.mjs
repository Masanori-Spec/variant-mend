/* Original implementation. Deliberately a bounded USDA profile, not a USD parser. */
export const LIMITS = Object.freeze({bytes:1048576,receiptBytes:2097152,nameLength:64,tokens:60000,prims:2048,depth:24,sets:8,branches:16,combinations:32});
const ID=/^[A-Za-z_][A-Za-z0-9_]*$/;
const PROP=/^[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*)*$/;
const ABS=/^\/(?:[A-Za-z_][A-Za-z0-9_]*\/)*[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*)*)?$/;
const forbidden=new Set(['references','payload','payloads','subLayers','relocates','inherits','specializes','instanceable','instance','prototype','timeSamples','clips','variantSelections','expressionVariables']);
export class ScopeError extends Error { constructor(code,message,offset=null){super(message);this.name='ScopeError';this.code=code;this.offset=offset;} }
const fail=(code,msg,t)=>{throw new ScopeError(code,msg,t?.start??null)};
export async function sha256(text){const bytes=new TextEncoder().encode(text);return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function tokenize(source){
 if(typeof source!=='string'||!/^#usda 1\.0(?:\r\n|\r|\n|$)/.test(source))fail('FORMAT','Only UTF-8 text beginning with #usda 1.0 is supported');
 if(new TextEncoder().encode(source).length>LIMITS.bytes)fail('SIZE','Input exceeds 1 MiB');
 if(source.includes('\u0000')||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(source))fail('ENCODING','Invalid text encoding');
 const tokens=[],comments=[];let i=0;
 const push=(kind,start,end,value)=>{tokens.push({kind,start,end,value});if(tokens.length>LIMITS.tokens)fail('TOKENS','Too many tokens');};
 while(i<source.length){let c=source[i],start=i;
  if(/[ \t\r\n]/.test(c)){i++;continue;}
  if(c==='#'){while(i<source.length&&!/[\r\n]/.test(source[i]))i++;comments.push({start,end:i,value:source.slice(start,i)});continue;}
  if(c==='"'){if(source.slice(i,i+3)==='"""')fail('STRING','Triple-quoted strings are outside this profile',{start});i++;let val='';while(i<source.length&&source[i]!=='"'){if(/[\r\n]/.test(source[i]))fail('STRING','Multiline strings are outside this profile',{start});if(source[i]==='\\'){i++;const e=source[i++];const m={'n':'\n','r':'\r','t':'\t','"':'"','\\':'\\'};if(!(e in m))fail('STRING','Unsupported string escape',{start});val+=m[e];}else val+=source[i++];}if(source[i]!=='"')fail('STRING','Unclosed string',{start});i++;push('string',start,i,val);continue;}
  if(c==='<'){i++;while(i<source.length&&source[i]!=='>')i++;if(source[i]!=='>')fail('PATH','Unclosed path',{start});i++;const val=source.slice(start+1,i-1);if(!ABS.test(val)||val.includes('__Prototype_'))fail('PATH','Only ordinary absolute prim/property paths are supported',{start});push('path',start,i,val);continue;}
   const num=source.slice(i).match(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);if(num){i+=num[0].length;push('number',start,i,num[0]);continue;}
  if('{}()[]=,.'.includes(c)){push(c,i,++i,c);continue;}
  const ident=source.slice(i).match(/^[A-Za-z_][A-Za-z0-9_:]*/);if(ident){i+=ident[0].length;if(forbidden.has(ident[0])||ident[0].startsWith('__Prototype_'))fail('UNSUPPORTED',`Unsupported construct: ${ident[0]}`,{start});push('id',start,i,ident[0]);continue;}
  fail('SYNTAX',`Unsupported syntax: ${c}`,{start});
 }
 tokens.push({kind:'eof',value:'',start:i,end:i});return {tokens,comments};
}
export function parse(source){
 const {tokens,comments}=tokenize(source);let pos=0,depth=0;
 const propertyIndex=new Map();
 const model={prims:[],properties:[],paths:[],sets:[],comments,strings:[],defaultPrim:null};
 const peek=()=>tokens[pos], take=()=>tokens[pos++], is=v=>peek().value===v;
 const expect=(kind,value)=>{const t=take();if(t.kind!==kind||(value!==undefined&&t.value!==value))fail('SYNTAX',`Expected ${value??kind}; found ${t.value||'end of file'}`,t);return t;};
 const str=()=>{const t=expect('string');if(source.slice(t.start+1,t.end-1)!==t.value)fail('NAME','Names must not use escapes',t);return t;};
 const wordGap=()=>{if(pos>0&&!/^[ \t]+$/.test(source.slice(tokens[pos-1].end,peek().start)))fail('SEPARATOR','Horizontal whitespace is required between declaration words',peek());};
 const inlineGap=()=>{if(pos>0&&!/^[ \t]*$/.test(source.slice(tokens[pos-1].end,peek().start)))fail('SEPARATOR','This declaration header must stay on one line',peek());};
 const joined=()=>{if(pos>0&&tokens[pos-1].end!==peek().start)fail('SEPARATOR','Property field suffix must be contiguous',peek());};
 const separator=()=>{if(!/[\r\n]/.test(source.slice(tokens[pos-1].end,peek().start)))fail('SEPARATOR','A newline is required between statements',peek());};
 const name=()=>{const t=str();if(!ID.test(t.value)||t.value.length>LIMITS.nameLength||t.value.startsWith('__Prototype_'))fail('NAME','Only ordinary identifier names are supported',t);return t;};
 function metadata(owner){expect('(');const seen=new Set();let declared=[],defaults=Object.create(null);while(peek().kind!==')'){
  if(peek().kind==='eof')fail('SYNTAX','Unclosed metadata',peek());let key=expect('id');let prepend=false;if(key.value==='prepend'){prepend=true;wordGap();key=expect('id');}if(seen.has(key.value))fail('DUPLICATE','Duplicate metadata',key);seen.add(key.value);inlineGap();expect('=');inlineGap();
  if(!owner&&key.value==='defaultPrim'&&!prepend){const t=name();model.defaultPrim=t.value;}
  else if(owner&&key.value==='variantSets'){
   if(peek().kind==='['){take();while(peek().kind!==']'){declared.push(name().value);if(peek().kind!==']')expect(',');}take();}else declared.push(name().value);
   if(!declared.length)fail('VARIANT','Empty variantSets is outside this profile',key);
  }else if(owner&&key.value==='variants'&&!prepend){expect('{');while(peek().kind!=='}'){expect('id','string');wordGap();const n=expect('id');if(!ID.test(n.value)||n.value in defaults)fail('VARIANT','Invalid or duplicate variant selection',n);inlineGap();expect('=');inlineGap();defaults[n.value]=name().value;if(peek().kind!=='}')separator();}take();}
  else fail('METADATA',`Unsupported metadata: ${key.value}`,key);
  if(peek().kind!==')')separator();
 }
 expect(')');if(owner){owner.declared=declared;owner.defaults=defaults;}
 }
 function value(type){const t=take();if(type==='string'||type==='token'){if(t.kind!=='string')fail('VALUE','Expected string value',t);model.strings.push(t);}else if(type==='bool'){if(t.kind!=='id'||!['true','false'].includes(t.value))fail('VALUE','Expected boolean',t);}else{if(t.kind!=='number'||t.value.startsWith('+')||!Number.isFinite(Number(t.value))||(type==='float'&&!Number.isFinite(Math.fround(Number(t.value))))||(type==='int'&&(!/^[+-]?\d+$/.test(t.value)||Number(t.value)<-2147483648||Number(t.value)>2147483647)))fail('VALUE',`Expected finite ${type}`,t);}}
 function property(owner,context){let custom=false,variability=null;let t=expect('id');if(t.value==='custom'){custom=true;wordGap();t=expect('id');}if(t.value==='uniform'){variability=t.value;wordGap();t=expect('id');}else if(t.value==='varying')fail('PROPERTY','Explicit varying is outside this profile',t);
  const type=t.value;if(type==='rel'&&variability)fail('PROPERTY','Relationships do not support an explicit variability qualifier',t);if(!['rel','double','float','int','bool','string','token'].includes(type))fail('PROPERTY',`Unsupported property type: ${type}`,t);
  let array=false;if(peek().kind==='['){inlineGap();take();inlineGap();expect(']');array=true;if(type==='rel')fail('PROPERTY','Relationship array type is unsupported',t);}
  wordGap();const n=expect('id');if(!PROP.test(n.value))fail('NAME','Invalid property name',n);let connection=false;
  if(peek().kind==='.'){joined();take();joined();expect('id','connect');connection=true;if(type==='rel')fail('PROPERTY','A relationship cannot have .connect',n);}
  const kind=type==='rel'?'relationship':connection?'connection':'attribute';const p={owner:owner.path,name:n.value,path:owner.path+'.'+n.value,type,array,kind,custom,variability,context:{...context},targets:[]};
  const peers=propertyIndex.get(p.path)??[];
  if(peers.some(x=>x.kind===p.kind&&JSON.stringify(x.context)===JSON.stringify(p.context)))fail('DUPLICATE','Duplicate property opinion in one branch',n);
  if(peers.some(x=>(x.kind==='relationship')!==(p.kind==='relationship')||x.type!==p.type||x.array!==p.array||x.variability!==p.variability))fail('PROPERTY','Property type, array shape and variability must stay consistent across opinions',n);
  model.properties.push(p);peers.push(p);propertyIndex.set(p.path,peers);inlineGap();expect('=');inlineGap();
  if(kind!=='attribute'){
   const add=()=>{const v=expect('path');const row={...v,owner:p.path,kind,context:{...context}};p.targets.push(row);model.paths.push(row);};
   if(peek().kind==='['){take();while(peek().kind!==']'){add();if(peek().kind!==']')expect(',');}take();}else add();
   if(kind==='connection'&&p.targets.some(x=>!x.value.includes('.')))fail('CONNECTION','Connections must target properties',n);
  }else if(array){expect('[');while(peek().kind!==']'){value(type);if(peek().kind!==']')expect(',');}take();}else value(type);
  separator();
 }
 function variant(owner,context){if(Object.keys(context).length)fail('NESTED_VARIANT','Nested variants are unsupported',peek());expect('id','variantSet');wordGap();const n=name();const key=owner.path+':'+n.value;if(model.sets.some(x=>x.key===key))fail('DUPLICATE','Duplicate variant set',n);
  const set={key,owner:owner.path,name:n.value,branches:[]};model.sets.push(set);if(model.sets.length>LIMITS.sets)fail('COVERAGE','At most 8 variant sets are supported',n);inlineGap();expect('=');expect('{');while(peek().kind!=='}'){const b=name();if(set.branches.includes(b.value))fail('DUPLICATE','Duplicate variant name',b);set.branches.push(b.value);if(set.branches.length>LIMITS.branches)fail('COVERAGE','At most 16 branches per set are supported',b);expect('{');body(owner,{[key]:b.value});expect('}');}expect('}');if(!set.branches.length)fail('VARIANT','Empty variant set',n);separator();
 }
 function prim(parent,context){if(++depth>LIMITS.depth)fail('DEPTH','Nesting is too deep',peek());expect('id','def');wordGap();let type=null;if(peek().kind==='id'){const tt=take();type=tt.value;if(type==='None'||!/^[A-Z][A-Za-z0-9_]*$/.test(type))fail('TYPE','Prim types must be ordinary identifiers beginning with an uppercase letter',tt);}wordGap();const n=name();const path=(parent?.path??'')+'/'+n.value;if(model.prims.some(x=>x.path===path&&JSON.stringify(x.context)===JSON.stringify(context)))fail('DUPLICATE','Duplicate prim declaration',n);
  const p={path,name:n.value,type,token:n,context:{...context},declared:[],defaults:{}};model.prims.push(p);if(model.prims.length>LIMITS.prims)fail('SIZE','Too many prims',n);if(peek().kind==='(')metadata(p);expect('{');body(p,context);expect('}');depth--;if(peek().kind!=='eof')separator();
 }
 function body(owner,context){while(peek().kind!=='}'){if(peek().kind==='eof')fail('SYNTAX','Unclosed prim or variant',peek());if(is('def'))prim(owner,context);else if(is('variantSet'))variant(owner,context);else property(owner,context);}}
 if(peek().kind==='(')metadata(null);while(peek().kind!=='eof')prim(null,{});
 if(!model.prims.length)fail('EMPTY','No prim declarations');
 for(const p of model.prims){const sets=model.sets.filter(s=>s.owner===p.path);if(p.declared.length!==new Set(p.declared).size)fail('VARIANT','Duplicate declared variant set',p.token);if(sets.some(s=>!p.declared.includes(s.name))||p.declared.some(n=>!sets.some(s=>s.name===n)))fail('VARIANT','Variant set metadata and definitions must match',p.token);for(const [n,b] of Object.entries(p.defaults)){if(!sets.some(s=>s.name===n&&s.branches.includes(b)))fail('VARIANT','Unknown default variant selection',p.token);}for(const s of sets)if(!(s.name in p.defaults))fail('VARIANT','Each variant set needs a default selection',p.token);}
 if(model.defaultPrim&&!model.prims.some(p=>p.path==='/'+model.defaultPrim&&!Object.keys(p.context).length))fail('DEFAULT','defaultPrim must name a base root prim');
 let combinations=[{}];for(const s of model.sets){combinations=combinations.flatMap(c=>s.branches.map(b=>({...c,[s.key]:b})));if(combinations.length>LIMITS.combinations)fail('COVERAGE','Variant coverage exceeds 32 combinations');}model.combinations=combinations;
 return model;
}
const active=(context,selection)=>Object.entries(context).every(([k,v])=>selection[k]===v);
const matches=(path,old)=>path===old||path.startsWith(old+'/')||path.startsWith(old+'.');
export async function analyze(source,oldPath,newName){
 const model=parse(source);if(!ABS.test(oldPath)||oldPath.includes('.')||oldPath.split('/').length<3)fail('TARGET','Select a non-root absolute prim path');if(!ID.test(newName)||newName.length>LIMITS.nameLength||newName.startsWith('__Prototype_'))fail('NAME','New name must be an ordinary identifier');
 const target=model.prims.filter(p=>p.path===oldPath);if(target.length!==1||Object.keys(target[0].context).length)fail('TARGET','Target must have exactly one declaration outside variants');
 const newPath=oldPath.slice(0,oldPath.lastIndexOf('/')+1)+newName;if(newPath===oldPath)fail('REPEATED','Old and new name are the same');
 if(model.prims.some(p=>p.path===newPath))fail('COLLISION','A base or variant prim already uses the destination path');
 const edits=[{start:target[0].token.start+1,end:target[0].token.end-1,before:target[0].name,after:newName,kind:'declaration',context:{}}];
 const affected=[],untouched=[];for(const p of model.paths){if(matches(p.value,oldPath)){const next=newPath+p.value.slice(oldPath.length);edits.push({start:p.start+1,end:p.end-1,before:p.value,after:next,kind:p.kind,context:p.context});affected.push({...p,next});}else untouched.push(p);}
 edits.sort((a,b)=>a.start-b.start);const expectedOutputBytes=new TextEncoder().encode(source).length+edits.reduce((n,e)=>n+e.after.length-e.before.length,0);if(expectedOutputBytes>LIMITS.bytes)fail('SIZE','Repaired output would exceed the 1 MiB import limit');const chunks=[];let cursor=0;for(const e of edits){chunks.push(source.slice(cursor,e.start),e.after);cursor=e.end;}chunks.push(source.slice(cursor));const output=chunks.join('');
 const coverage=model.combinations.map(selection=>{const prims=new Set(model.prims.filter(p=>active(p.context,selection)).map(p=>p.path));const properties=new Set(model.properties.filter(p=>p.kind==='attribute'&&active(p.context,selection)).map(p=>p.path));const paths=model.paths.filter(p=>active(p.context,selection));const missing=paths.filter(p=>p.value.includes('.')?!properties.has(p.value):!prims.has(p.value));return {selection,pathCount:paths.length,affectedCount:paths.filter(p=>matches(p.value,oldPath)).length,missing:missing.map(p=>p.value)};});
 if(coverage.some(c=>c.missing.length))fail('UNRESOLVED','A target is not declared in at least one supported variant selection');
 const inputHash=await sha256(source), outputHash=await sha256(output);
 const receipt={schema:'variant-mend/1',coordinateSystem:'UTF-16 code units; half-open source spans',sourceHash:inputHash,outputHash,oldPath,newPath,edits,coverage,limits:LIMITS,validation:'Bounded structural coverage; native SDK verification is separate'};
 if(new TextEncoder().encode(JSON.stringify(receipt,null,2)+'\n').length>LIMITS.receiptBytes)fail('SIZE','Receipt would exceed the 2 MiB import limit');
 return {source,output,receipt,model,affected,untouched,inert:[...model.strings,...model.comments].filter(x=>x.value.includes(oldPath)),coverage};
}
export async function applyReceipt(source,receipt){
 if(!receipt||receipt.schema!=='variant-mend/1')fail('RECEIPT','Unknown receipt schema');const hash=await sha256(source);if(hash===receipt.outputHash)fail('REPEATED','This receipt is already applied');if(hash!==receipt.sourceHash)fail('STALE','Source hash differs from the reviewed input');
 const name=receipt.newPath?.slice(receipt.newPath.lastIndexOf('/')+1);const expected=await analyze(source,receipt.oldPath,name);if(JSON.stringify(receipt)!==JSON.stringify(expected.receipt))fail('RECEIPT','Receipt does not match the deterministic analysis');return expected.output;
}
