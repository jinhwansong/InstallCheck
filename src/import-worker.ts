import { parseMesh } from './import3d.ts';

self.onmessage = async (event: MessageEvent<{buffer:ArrayBuffer;name:string}>) => {
  try {self.postMessage({positions:await parseMesh(event.data.buffer,event.data.name)});}
  catch(error) {self.postMessage({error:error instanceof Error?error.message:'3D 파일을 읽지 못했습니다.'});}
};
