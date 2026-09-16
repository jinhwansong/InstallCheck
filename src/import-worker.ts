import { parseMesh, parseMeshObjects } from './import3d.ts';
import { parseDxf } from './dxf.ts';

self.onmessage = async (event: MessageEvent<{buffer:ArrayBuffer;name:string;objects?:boolean}>) => {
  try {
    const {buffer,name,objects}=event.data;
    if(objects&&name.toLowerCase().endsWith('.dxf'))self.postMessage(parseDxf(new TextDecoder('utf-8',{fatal:true}).decode(buffer)));
    else if(objects)self.postMessage({objects:await parseMeshObjects(buffer,name),warnings:[]});
    else self.postMessage({positions:await parseMesh(buffer,name)});
  }
  catch(error) {self.postMessage({error:error instanceof Error?error.message:'3D 파일을 읽지 못했습니다.'});}
};
