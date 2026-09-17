import { createServer } from 'node:http';
import handler from '../lib/feed.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port<0 || port>65535) throw new Error('PORT must be an integer from 0 to 65535');
const server=createServer((req,res)=> {
  if(new URL(req.url,'http://localhost').pathname==='/api/feed') {
    handler(req,res).catch(()=>{ res.statusCode=500; res.end('{"error":{"code":"INTERNAL_ERROR"}}'); });
  } else { res.writeHead(404,{'Content-Type':'application/json'}); res.end('{"error":{"code":"NOT_FOUND"}}'); }
});
server.listen(port,'127.0.0.1',()=>console.log(`GYEOL mock server http://127.0.0.1:${server.address().port}`));
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>process.exit(0)));
