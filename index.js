#!/usr/bin/env node
/*
 * index.js
 * Copyright (C) 2016 dhilipsiva <dhilipsiva@gmail.com>
 *
 * Distributed under terms of the MIT license.
 */

var WebSocketServer = require('ws').Server
  , http = require('http')
  , net = require('net')
  , request = require('request')
  , VNC_SECRET = process.env.VNC_SECRET || "bqB95W.1)A58|f-|3h_vJkK8L"
  , PORT = process.env.PORT || 8008
  , server = http.createServer()
  , wss = new WebSocketServer({
    server: server
  });

console.log("Started MiniVNC");
console.log("VNC_SECRET: " + VNC_SECRET);
console.log("PORT: " + PORT);

var messageHandler = function (ws, data, stream, touchStream, streamsCreatedCallback) {
  var jsonData = JSON.parse(data);
  if (jsonData.type === "subscribe") {
    url = 'http://localhost:8888/api/miniports?token=' + jsonData.token + '&secret=' + VNC_SECRET
    request(url, function(error, response, body){
      if (!error && response.statusCode === 200) {
        const miniports = JSON.parse(body)
        stream = net.connect({
          port: miniports.minicap
        });
        touchStream = net.connect({
          port: miniports.minitouch
        });

        stream.on('error', function() {
          console.error('CAP: Be sure to run `adb forward`')
        })
        touchStream.on('error', function() {
          console.error('TOUCH: Be sure to run `adb forward`')
        })
        streamsCreatedCallback(stream, touchStream);
        var readBannerBytes = 0;
        var bannerLength = 2;
        var readFrameBytes = 0;
        var frameBodyLength = 0;
        var frameBody = new Buffer(0);
        var banner = {
          version: 0,
          length: 0,
          pid: 0,
          realWidth: 0,
          realHeight: 0,
          virtualWidth: 0,
          virtualHeight: 0,
          orientation: 0,
          quirks: 0
        };

        function tryRead() {
          for (var chunk; (chunk = stream.read());) {
            // console.info('chunk(length=%d)', chunk.length);
            for (var cursor = 0, len = chunk.length; cursor < len;) {
              if (readBannerBytes < bannerLength) {
                switch (readBannerBytes) {
                  case 0:
                    // version
                    banner.version = chunk[cursor];
                    break
                  case 1:
                    // length
                    banner.length = bannerLength = chunk[cursor];
                    break
                  case 2:
                  case 3:
                  case 4:
                  case 5:
                    // pid
                    banner.pid +=
                      (chunk[cursor] << ((readBannerBytes - 2) * 8)) >>> 0;
                    break
                  case 6:
                  case 7:
                  case 8:
                  case 9:
                    // real width
                    banner.realWidth +=
                      (chunk[cursor] << ((readBannerBytes - 6) * 8)) >>> 0;
                    break
                  case 10:
                  case 11:
                  case 12:
                  case 13:
                    // real height
                    banner.realHeight +=
                      (chunk[cursor] << ((readBannerBytes - 10) * 8)) >>> 0;
                    break
                  case 14:
                  case 15:
                  case 16:
                  case 17:
                    // virtual width
                    banner.virtualWidth +=
                      (chunk[cursor] << ((readBannerBytes - 14) * 8)) >>> 0;
                    break
                  case 18:
                  case 19:
                  case 20:
                  case 21:
                    // virtual height
                    banner.virtualHeight +=
                      (chunk[cursor] << ((readBannerBytes - 18) * 8)) >>> 0;
                    break
                  case 22:
                    // orientation
                    banner.orientation += chunk[cursor] * 90;
                    break
                  case 23:
                    // quirks
                    banner.quirks = chunk[cursor];
                    break
                }

                cursor += 1;
                readBannerBytes += 1;

                if (readBannerBytes === bannerLength) {
                  // console.log('banner', banner);
                }
              } else if (readFrameBytes < 4) {
                frameBodyLength += (chunk[cursor] << (readFrameBytes * 8)) >>> 0;
                cursor += 1;
                readFrameBytes += 1;
                // console.info('headerbyte%d(val=%d)', readFrameBytes, frameBodyLength);
              } else {
                if (len - cursor >= frameBodyLength) {
                  // console.info('bodyfin(len=%d,cursor=%d)', frameBodyLength, cursor);

                  frameBody = Buffer.concat([
                    frameBody, chunk.slice(cursor, cursor + frameBodyLength)
                  ])

                  // Sanity check for JPG header, only here for debugging purposes.
                  if (frameBody[0] !== 0xFF || frameBody[1] !== 0xD8) {
                    console.error(
                      'Frame body does not start with JPG header', frameBody);
                  }
                  try {
                    ws.send(frameBody, {
                      binary: true
                    });

                  } catch (e) {
                    console.error("Error Sending Stuff" + e);
                  }

                  cursor += frameBodyLength;
                  frameBodyLength = readFrameBytes = 0;
                  frameBody = new Buffer(0);
                } else {
                  // console.info('body(len=%d)', len - cursor);

                  frameBody = Buffer.concat([
                    frameBody, chunk.slice(cursor, len)
                  ]);

                  frameBodyLength -= len - cursor;
                  readFrameBytes += len - cursor;
                  cursor = len;
                }
              }
            }
          }
        }
        stream.on('readable', tryRead);
        ws.on('close', function() {
          console.info('Lost a client');
          if (stream) {
            stream.end();
          }
          if (touchStream) {
            touchStream.end();
          }
        })
      } else {
        console.log("Got an error: ", error);
        ws.close();
      }
    })
  }
  else if (jsonData.type === 'pointer'){
    if (touchStream) {
      touchStream.write(jsonData.data);
    }
    else{
      console.log("touchStream is not defined!");
    }
  }
}

var webSocketHandler = function(ws) {
  console.info('Got a client');
  var stream, touchStream;
  ws.on('message', function(data) {
    messageHandler(ws, data, stream, touchStream, function (newStream, newTouchStream) {
      stream = newStream;
      touchStream = newTouchStream;
    });
  });
}

wss.on('connection', webSocketHandler);
server.listen(PORT);
console.info('Listening on port %d', PORT);
