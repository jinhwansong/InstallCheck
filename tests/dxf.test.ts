import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDxf } from '../src/dxf.ts';
const dxf=(entities:string,blocks='')=>`0\nSECTION\n2\nBLOCKS\n${blocks}0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`;
test('DXF block placement, base point, scale, rotation and layers are retained',()=>{
 const block='0\nBLOCK\n2\nMACHINE\n10\n10\n20\n20\n0\nLINE\n10\n10\n20\n20\n11\n110\n21\n70\n0\nENDBLK\n';
 const result=parseDxf(dxf('0\nINSERT\n2\nMACHINE\n8\nEquipment\n10\n1000\n20\n2000\n41\n2\n42\n2\n50\n90\n',block));
 assert.equal(result.candidates[0].layer,'Equipment');
 assert.deepEqual(result.candidates[0].min,[900,0,2000]);assert.deepEqual(result.candidates[0].max,[1000,0,2200]);
});
test('unsupported curves are disclosed; malformed and recursive files fail',()=>{
 const result=parseDxf(dxf('0\nCIRCLE\n8\nCOLUMN\n10\n400\n20\n600\n40\n200\n0\nARC\n'));
 assert.equal(result.candidates.length,1);assert.deepEqual(result.candidates[0].min,[200,0,400]);assert.match(result.warnings[0],/ARC/);
 assert.throws(()=>parseDxf('binary\0'));
 assert.throws(()=>parseDxf(dxf('0\nINSERT\n2\nLOOP\n','0\nBLOCK\n2\nLOOP\n0\nINSERT\n2\nLOOP\n0\nENDBLK\n')),/순환/);
});

test('blocks with unsupported geometry are excluded as a whole instead of shrinking their bounds',()=>{
 const block='0\nBLOCK\n2\nPARTIAL\n0\nLINE\n10\n0\n20\n0\n11\n100\n21\n100\n0\nARC\n0\nENDBLK\n';
 const result=parseDxf(dxf('0\nINSERT\n2\nPARTIAL\n',block));
 assert.equal(result.candidates.length,0);assert.ok(result.warnings.some(w=>w.includes('블록 전체')));
});
