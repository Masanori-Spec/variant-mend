import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {analyze,applyReceipt,parse,LIMITS} from '../src/core.mjs';
const sample=await fs.readFile(new URL('../fixtures/product.usda',import.meta.url),'utf8');
const go=(s=sample,old='/Product/Old',name='Handle')=>analyze(s,old,name);
const blocked=async(s,code,old='/Product/Old',name='Handle')=>assert.rejects(go(s,old,name),e=>e.code===code);
test('minimal exact-span repair covers two selections and preserves inert bytes',async()=>{const r=await go();assert.equal(r.receipt.edits.length,5);assert.equal(r.coverage.length,2);assert.equal(r.affected.length,4);assert.equal(r.untouched[0].value,'/Product/OldSpare');assert.equal(r.inert.length,2);assert.match(r.output,/string note = "\/Product\/Old"/);assert.match(r.output,/# Keep this note: \/Product\/Old/);assert.match(r.output,/double weight = 99/);assert.match(r.output,/string finish = "A"/);assert.equal(await applyReceipt(sample,r.receipt),r.output);});
test('deterministic receipt and export',async()=>assert.deepEqual(await go(),await go()));
test('stale source receipt rejected',async()=>{const r=await go();await assert.rejects(applyReceipt(sample+'\n',r.receipt),e=>e.code==='STALE');});
test('already-applied receipt rejected',async()=>{const r=await go();await assert.rejects(applyReceipt(r.output,r.receipt),e=>e.code==='REPEATED');});
test('tampered receipt span rejected',async()=>{const r=await go();r.receipt.edits[1].after='/Product/Evil';await assert.rejects(applyReceipt(sample,r.receipt),e=>e.code==='RECEIPT');});
test('tampered receipt destination parent rejected',async()=>{const r=await go();r.receipt.newPath='/Other/Handle';await assert.rejects(applyReceipt(sample,r.receipt),e=>e.code==='RECEIPT');});
test('unknown receipt rejected',async()=>assert.rejects(applyReceipt(sample,{}),e=>e.code==='RECEIPT'));
for(const [title,transform,code] of [
 ['USDC',s=>'PXR-USDC'+s,'FORMAT'],['USDZ',s=>'PK'+s,'FORMAT'],['BOM',s=>'\ufeff'+s,'FORMAT'],['null byte',s=>s+'\0','ENCODING'],['unpaired surrogate',s=>s+'\uD800','ENCODING'],['relative path',s=>s.replace('</Product/Old>','<Old>'),'PATH'],['variant path',s=>s.replace('</Product/Old>','</Product{finish=A}/Old>'),'PATH'],['property target syntax',s=>s.replace('</Product/Old>','</Product/Old.weight.foo>'),'PATH'],['references',s=>s.replace('prepend variantSets','prepend references = @x.usda@\n prepend variantSets'),'UNSUPPORTED'],['payload',s=>s.replace('prepend variantSets','payload = @x.usda@\n prepend variantSets'),'UNSUPPORTED'],['sublayers',s=>s.replace('defaultPrim','subLayers'),'UNSUPPORTED'],['relocates',s=>s.replace('defaultPrim','relocates'),'UNSUPPORTED'],['inherits',s=>s.replace('defaultPrim','inherits'),'UNSUPPORTED'],['specializes',s=>s.replace('defaultPrim','specializes'),'UNSUPPORTED'],['instance',s=>s.replace('prepend variantSets','instanceable = true\n prepend variantSets'),'UNSUPPORTED'],['prototype',s=>s.replace('"Old"','"__Prototype_1"'),'NAME'],['asset expression',s=>s.replace('custom double weight = 2','asset texture = @${ASSET}@'),'SYNTAX'],['unknown path attribute',s=>s.replace('custom double weight = 2','path mystery = </Product/Old>'),'PROPERTY'],['timeSamples',s=>s.replace('weight = 2','weight.timeSamples = {0:2}'),'UNSUPPORTED'],['unknown metadata',s=>s.replace('defaultPrim','unrecognized'),'METADATA'],['nested variants',s=>s.replace('"A" {','"A" {\n variantSet "other" = {"x" {}}'),'NESTED_VARIANT'],['malformed brace',s=>s.slice(0,-2),'SYNTAX'],['unclosed path',s=>s.replace('</Product/Old>','</Product/Old'),'PATH'],['triple quote',s=>s.replace('"/Product/Old"','"""/Product/Old"""'),'STRING'],['unknown escaped text',s=>s.replace('"/Product/Old"','"\\a"'),'STRING'],['unsupported list operation',s=>s.replace('rel accessory','prepend rel accessory'),'PROPERTY'],['duplicate prim',s=>s.replace('def Scope "OldSpare"','def Scope "Old"'),'DUPLICATE'],['duplicate property',s=>s.replace('custom double weight = 2','custom double weight = 2\n custom double weight = 3'),'DUPLICATE'],['duplicate variant',s=>s.replace('"B" {','"A" {'),'DUPLICATE'],['unknown default variant',s=>s.replace('string finish = "A"','string finish = "X"'),'VARIANT'],['missing set metadata',s=>s.replace('prepend variantSets = "finish"',''),'VARIANT'],['missing default variant',s=>s.replace('variants = { string finish = "A" }',''),'VARIANT'],['dangling prim target',s=>s.replace('</Product/Old>','</Product/Missing>'),'UNRESOLVED'],['dangling attribute target',s=>s.replace('</Product/Old.weight>','</Product/Old.missing>'),'UNRESOLVED'],['connection to prim',s=>s.replace('</Product/Old.weight>','</Product/Old>'),'CONNECTION'],['nonfinite number',s=>s.replace('weight = 2','weight = 2e999'),'VALUE']]) test(`rejects ${title}`,()=>blocked(transform(sample),code));
test('rejects sibling collision',()=>blocked(sample,'COLLISION','/Product/Old','OldSpare'));
test('rejects collision in unselected variant',()=>blocked(sample.replace('"B" {','"B" {\n def Scope "Handle" {}'),'COLLISION'));
test('rejects same-name repeated request',()=>blocked(sample,'REPEATED','/Product/Old','Old'));
test('rejects root rename',()=>blocked(sample,'TARGET','/Product','Renamed'));
test('rejects missing target',()=>blocked(sample,'TARGET','/Product/Missing','Handle'));
test('rejects target inside a variant',()=>blocked(sample.replace('"B" {','"B" {\n def Scope "Extra" {}'),'TARGET','/Product/Extra','Handle'));
test('rejects variant-only duplicate target opinion',()=>blocked(sample.replace('"B" {','"B" {\n def Scope "Old" {}'),'TARGET'));
test('rejects reparenting destination',()=>blocked(sample,'NAME','/Product/Old','Other/Handle'));
test('rejects invalid target path',()=>blocked(sample,'TARGET','Product/Old'));
test('rejects property as target',()=>blocked(sample,'TARGET','/Product/Old.weight'));
test('rejects over-limit combinations',()=>{let s=sample.replace('prepend variantSets = "finish"','prepend variantSets = ["finish", "shape"]');s=s.replace('variants = { string finish = "A" }','variants = { string finish = "A"\n string shape = "v0" }');s=s.replace(' variantSet "finish"',' variantSet "shape" = {\n'+Array.from({length:16},(_,i)=>` "v${i}" {}\n`).join('')+' }\n variantSet "finish"');s=s.replace('"B" {','"C" {}\n "B" {');return blocked(s,'COVERAGE');});
test('accepts exact coverage cap',async()=>{let s=sample.replace('prepend variantSets = "finish"','prepend variantSets = ["finish", "shape"]');s=s.replace('variants = { string finish = "A" }','variants = { string finish = "A"\n string shape = "v0" }');s=s.replace(' variantSet "finish"',' variantSet "shape" = {\n'+Array.from({length:16},(_,i)=>` "v${i}" {}\n`).join('')+' }\n variantSet "finish"');assert.equal((await go(s)).coverage.length,LIMITS.combinations);});
test('CRLF preserved exactly outside replacements',async()=>{const r=await go(sample.replaceAll('\n','\r\n'));assert.equal((r.output.match(/\r\n/g)||[]).length,(sample.match(/\n/g)||[]).length);});
test('Unicode and escaped string remain unchanged',async()=>{const s=sample.replace('"/Product/Old"','"日本語 🧩 \\"/Product/Old\\""');assert.ok((await go(s)).output.includes('"日本語 🧩 \\"/Product/Old\\""'));});
test('supports no-variant file',async()=>{const s='#usda 1.0\ndef Xform "Root" {\n def Scope "Old" {}\n rel link = </Root/Old>\n}\n';const r=await go(s,'/Root/Old','New');assert.equal(r.coverage.length,1);assert.equal(r.affected.length,1);});
test('rejects missing property newline',()=>blocked(sample.replace('weight = 2\n','weight = 2 '),'SEPARATOR'));
test('rejects missing metadata newline',()=>blocked(sample.replace('variantSets = \"finish\"\n','variantSets = \"finish\" '),'SEPARATOR'));
test('rejects non-ASCII trivia',()=>blocked(sample.replace('def Xform','def\u00a0Xform'),'SYNTAX'));
test('rejects out-of-range int',()=>blocked(sample.replace('double weight = 2','int weight = 2147483648'),'VALUE'));
test('accepts lone CR newlines',async()=>assert.equal((await go(sample.replaceAll('\n','\r'))).coverage.length,2));
test('comments with unsupported words remain inert',async()=>assert.ok((await go(sample+'# references payload instanceable ${x}\n')).output.endsWith('# references payload instanceable ${x}\n')));
test('namespaced property paths repaired',async()=>{const r=await go(sample.replaceAll('weight','inputs:weight'));assert.ok(r.output.includes('</Product/Handle.inputs:weight>'));});
test('array scalar data left unchanged',async()=>{const s=sample.replace('custom double weight = 2','custom double weight = 2\n custom double[] nums = [1, 2, 3]');assert.ok((await go(s)).output.includes('nums = [1, 2, 3]'));});

test('rejects default/connection type conflict',()=>blocked(sample.replace('custom double signal.connect','custom float signal = 3\n   custom double signal.connect'),'PROPERTY'));
test('rejects default/connection array conflict',()=>blocked(sample.replace('custom double signal.connect','custom double[] signal = [3]\n   custom double signal.connect'),'PROPERTY'));
test('rejects uniform relationship',()=>blocked(sample.replace('rel accessory','uniform rel accessory'),'PROPERTY'));
test('rejects explicit varying qualifier',()=>blocked(sample.replace('custom double weight','varying double weight'),'PROPERTY'));
test('rejects malformed prim type',()=>blocked(sample.replace('def Xform','def Bad:Type'),'TYPE'));
test('rejects reserved prim type',()=>blocked(sample.replace('def Xform','def def'),'TYPE'));
test('rejects empty variantSets list',()=>blocked(sample.replace('prepend variantSets = "finish"','prepend variantSets = []'),'VARIANT'));
test('rejects float32 overflow',()=>blocked(sample.replace('custom double weight = 2','custom float weight = 1e39'),'VALUE'));
test('rejects attribute/relationship collision',()=>blocked(sample.replace('rel accessory =','double accessory = 2\n   rel accessory ='),'PROPERTY'));

test('rejects property kind conflict between base and variant',()=>blocked(sample.replace('variantSet \"finish\"', 'rel signal = </Product/Old>\n variantSet \"finish\"'),'PROPERTY'));
test('receipt names its coordinate system',async()=>assert.equal((await go()).receipt.coordinateSystem,'UTF-16 code units; half-open source spans'));

test('rejects leading numeric plus',()=>blocked(sample.replace('weight = 2','weight = +2'),'VALUE'));
test('rejects missing whitespace after def',()=>blocked(sample.replace('def Xform "Product"','def"Product"'),'SEPARATOR'));
test('rejects missing whitespace before typed prim name',()=>blocked(sample.replace('def Xform "Product"','def Xform"Product"'),'SEPARATOR'));
test('rejects missing whitespace after variantSet',()=>blocked(sample.replace('variantSet "finish"','variantSet"finish"'),'SEPARATOR'));
test('rejects unbounded destination names',()=>blocked(sample,'NAME','/Product/Old','X'.repeat(65)));
test('rejects output that cannot be imported under its size cap',()=>{const extra=''.padEnd(1048500-sample.length,' ');return blocked(sample+extra,'SIZE','/Product/Old','H'.repeat(64));});
test('rejects oversized receipt instead of exporting nonreplayable evidence',()=>{const chain=Array.from({length:18},(_,i)=>`def Scope "${'N'.repeat(56)+i}" {\n`).join('');const close='}\n'.repeat(18);let s='#usda 1.0\ndef Xform "Root" {\n def Scope "Old" {}\n'+chain+' variantSet "v" = { "A" {\n'+Array.from({length:1700},(_,i)=>` rel p${i} = </Root/Old>\n`).join('')+'} }\n'+close+'}\n';/* Metadata is required; attach it to deepest prim. */s=s.replace(`def Scope "${'N'.repeat(56)}17" {`, `def Scope "${'N'.repeat(56)}17" (\n prepend variantSets = "v"\n variants = { string v = "A" }\n) {`);return blocked(s,'SIZE','/Root/Old','New');});

test('rejects declaration newline between def and name',()=>blocked(sample.replace('def Xform "Product"','def Xform\n"Product"'),'SEPARATOR'));
test('rejects missing whitespace after array type',()=>blocked(sample.replace('custom double weight = 2','custom double[]nums = [2]\n custom double weight = 2'),'SEPARATOR'));
test('rejects multiline array type brackets',()=>blocked(sample.replace('custom double weight = 2','custom double[\n] nums = [2]\n custom double weight = 2'),'SEPARATOR'));

test('rejects multiline metadata assignment',()=>blocked(sample.replace('defaultPrim =','defaultPrim\n='),'SEPARATOR'));
test('rejects multiline typed variant selection',()=>blocked(sample.replace('string finish =','string\nfinish ='),'SEPARATOR'));
test('rejects multiline variantSet header',()=>blocked(sample.replace('variantSet "finish" =','variantSet "finish"\n='),'SEPARATOR'));

test('rejects reserved None prim type',()=>blocked(sample.replace('def Xform','def None'),'TYPE'));
