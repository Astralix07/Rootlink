const http = require('http');
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('hello from local server!');
}).listen(4444, () => console.log('Test server running on http://localhost:4444'));
