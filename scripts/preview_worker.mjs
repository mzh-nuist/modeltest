// Local SQLite preview for the same Worker. Never seeds production traffic.
import http from 'node:http';
import fs from 'node:fs';
import {sqliteD1} from './d1_sqlite.mjs';
import worker from '../dist/server/index.js';
fs.mkdirSync('results/analytics-preview',{recursive:true});
const adapter=sqliteD1('results/analytics-preview/traffic.sqlite');
http.createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const url='http://127.0.0.1:8766'+req.url;const response=await worker.fetch(new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})}),{DB:adapter,LOCAL_PREVIEW:true});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('Preview failed');}}).listen(8766,'127.0.0.1',()=>process.stdout.write('Local Worker preview: http://127.0.0.1:8766 (local data only)\n'));
