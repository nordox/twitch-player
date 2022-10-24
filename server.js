
const axios = require('axios');
const fs = require('fs');
const static = require('node-static');
const file = new static.Server(`${__dirname}/m3u8`);

// fs.readdirSync(`${__dirname}/m3u8`).map(filename => {
//     console.log("file:", filename);
// });

require('http').createServer(function (request, response) {
    request.addListener('end', async function () {
        const url = request.url.split('?')[1].split('=')[1];
        const res = await axios.get(url);
        const segments = res.data.match(/#EXT-X-PROGRAM-DATE-TIME/g || []);
        const offset = segments.length > 10 ? 3 : 2;
        const lines = res.data.split("\n");

        lines.splice(10, (segments.length - offset) * 3);

        response.setHeader('Cache-Control', 'no-cache');
        response.setHeader('Pragma', 'no-cache');

        fs.writeFile(`${__dirname}/m3u8/test.m3u8`, lines.join("\n"), () => {
            file.serve(request, response);
        });
    }).resume();
}).listen(8001)