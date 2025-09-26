// signaling-server.js
// Minimal WebSocket-based signaling server
// Usage: node signaling-server.js
// Requires: npm install ws
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3000 }, ()=>console.log('Signaling server running on ws://0.0.0.0:3000'));
const rooms = {}; // roomId -> array of ws

function send(ws, data){ try{ ws.send(JSON.stringify(data)); }catch(e){ console.warn('send fail', e); } }

wss.on('connection', (ws) => {
  ws._room = null;
  ws.on('message', (msg) => {
    let data;
    try{ data = JSON.parse(msg); } catch(e){ return; }
    const cmd = data.cmd;
    if(cmd === 'create_room'){
      // make a short random id
      const id = Math.random().toString(36).substring(2,8).toUpperCase();
      rooms[id] = rooms[id] || [];
      rooms[id].push(ws);
      ws._room = id;
      send(ws, { cmd:'created', room:id });
      console.log('Room created', id);
    } else if(cmd === 'join_room'){
      const room = data.room;
      if(!room || !rooms[room]){
        send(ws, { cmd:'error', msg:'room-not-found' });
        return;
      }
      if(rooms[room].length >= 2){
        send(ws, { cmd:'error', msg:'room-full' }); return;
      }
      rooms[room].push(ws); ws._room = room;
      send(ws, { cmd:'joined', room });
      // notify host
      rooms[room].forEach(client=>{
        if(client !== ws) send(client, { cmd:'joined', room });
      });
      // once both are present, send ready to both
      if(rooms[room].length === 2){
        rooms[room].forEach(client => send(client, { cmd:'ready', room }));
        console.log('Room ready', room);
      }
    } else if(cmd === 'offer' || cmd === 'answer' || cmd === 'ice' || cmd === 'relay'){
      const room = data.room || ws._room;
      if(!room || !rooms[room]) return;
      // forward to other client(s)
      rooms[room].forEach(client => {
        if(client !== ws) send(client, data);
      });
    } else if(cmd === 'leave'){
      const room = data.room || ws._room;
      if(room && rooms[room]){
        rooms[room] = rooms[room].filter(c => c !== ws);
        rooms[room].forEach(client => send(client, { cmd:'peer-left', room }));
        if(rooms[room].length === 0) delete rooms[room];
      }
      ws._room = null;
    }
  });

  ws.on('close', ()=>{
    const room = ws._room;
    if(room && rooms[room]){
      rooms[room] = rooms[room].filter(c=>c!==ws);
      rooms[room].forEach(client => send(client, { cmd:'peer-left', room }));
      if(rooms[room].length === 0) delete rooms[room];
    }
  });
});
