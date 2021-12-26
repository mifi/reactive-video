const { PassThrough } = require('stream');
const { once } = require('events');
const log = require('debug')('split-stream');

/*
TODO improve this code

Create npm module
https://github.com/sindresorhus/awesome-nodejs/blob/main/readme.md#streams
https://github.com/thejmazz/awesome-nodejs-streams

transform stream instead that spits out streams? (yo dawg, I heard you like streams)

similar:
https://github.com/mpotra/split-to-streams (doesn't seem to preserve delim)
https://github.com/watson/stream-chopper (size/time based)
https://github.com/maxogden/binary-split
https://github.com/131/stream-split
https://github.com/hgranlund/node-binary-split
https://github.com/mcollina/split2

https://github.com/enobufs/node-mjpeg-reader (file only)
https://github.com/mmaelzer/mjpeg-consumer
https://github.com/eugeneware/png-split-stream
https://github.com/kevinGodell/pipe2jpeg (seems a bit shady due to using internals `_readableState.pipesCount`)

Good tests:
https://github.com/watson/stream-chopper/blob/master/test.js
*/
function createSplitter({ readableStream, splitOnDelim, splitOnLength }) {
  if ((splitOnDelim == null || splitOnDelim.length === 0) && !splitOnLength) {
    throw new TypeError('Specify one of splitOnDelim or splitOnLength');
  }

  let readableEnded = false;

  readableStream.on('end', () => {
    log('readableStream end');
    readableEnded = true;
  });

  readableStream.on('close', () => {
    log('readableStream close');
    readableEnded = true;
  });

  let outStream;
  let error;
  let newStreamOnNextWrite = false;
  let awaitingNewStreams = [];
  const newStreams = [];

  function rejectAwaitingStreams() {
    if (awaitingNewStreams.length > 0) {
      awaitingNewStreams.forEach(({ reject }) => reject(error));
      awaitingNewStreams = [];
    }
  }

  function newStream() {
    log('newStream');
    if (outStream) outStream.end();
    outStream = new PassThrough();

    if (awaitingNewStreams.length > 0) {
      awaitingNewStreams.forEach(({ resolve }) => resolve(outStream));
      awaitingNewStreams = [];
      return;
    }
    newStreams.push(outStream);
  }

  async function awaitNextSplit() {
    log('awaitNextSplit');
    if (newStreams.length > 0) return newStreams.shift();

    if (error) throw error;

    return new Promise((resolve, reject) => {
      awaitingNewStreams.push({ resolve, reject });
    });
  }

  async function safeWrite(buf) {
    if (buf.length === 0) return;
    if (newStreamOnNextWrite || !outStream) {
      newStreamOnNextWrite = false;
      newStream();
    }
    log('safeWrite', buf);
    if (!outStream.write(buf)) await once(outStream, 'drain');
    log('safeWrite done');
  }

  // I'm not proud of this, but it works
  // https://www.youtube.com/watch?v=2Y1JX6jHoDU
  // TODO: Hitting an issue "Stream has ended" when running this in EC2 (but not on mac os and not with png/raw), not sure why but something is wrong here
  async function splitStreamOnDelim() {
    let workingBuf = Buffer.alloc(0);

    async function readMore() {
      log('readMore');
      if (readableEnded) {
        log('readableEnded');
        return false;
      }

      let val = readableStream.read();
      if (val != null) {
        log('read', val);
        workingBuf = Buffer.concat([workingBuf, val]);
        return true;
      }

      log('waiting for readableStream readable');
      await once(readableStream, 'readable');
      log('readableStream is now readable');

      val = readableStream.read();
      if (val != null) {
        log('read', val);
        workingBuf = Buffer.concat([workingBuf, val]);
      }

      log('read', !!val);
      return !!val;
    }

    readableStream.pause();

    let hasMoreData = true;

    while (workingBuf.length > 0 || hasMoreData) {
      const delimSearchOffset = 0;
      let delimIndex = -1;

      while (delimIndex < 0) {
        // delimSearchOffset = workingBuf.length;

        // eslint-disable-next-line no-await-in-loop
        hasMoreData = await readMore();

        delimIndex = workingBuf.indexOf(splitOnDelim, delimSearchOffset);

        if (delimIndex >= 0) break;

        if (!hasMoreData) {
          log({ hasMoreData });
          break;
        }

        // Optimization: flush data to output stream if delim not split across 2 chunks
        // Delim may be split across 2 (or more) chunks. If not, we can write out data now
        // console.log(splitOnDelim, workingBuf, splitOnDelim.includes(workingBuf[workingBuf.length - 1]))
        if (!splitOnDelim.includes(workingBuf[workingBuf.length - 1])) {
          // eslint-disable-next-line no-await-in-loop
          await safeWrite(workingBuf);
          workingBuf = Buffer.alloc(0);
        }
      }

      if (delimIndex >= 0) {
        log('delimIndex', delimIndex);
        const partBefore = workingBuf.slice(0, delimIndex);
        const partAfter = workingBuf.slice(delimIndex + splitOnDelim.length);

        // eslint-disable-next-line no-await-in-loop
        await safeWrite(partBefore);
        newStreamOnNextWrite = true;
        // eslint-disable-next-line no-await-in-loop
        await safeWrite(splitOnDelim);

        workingBuf = partAfter;
      } else {
        // eslint-disable-next-line no-await-in-loop
        await safeWrite(workingBuf);
        workingBuf = Buffer.alloc(0);
      }
    }
  }

  // ...nor this
  async function splitStreamOnLength() {
    let bytesReadSinceLastSplit = 0;

    // eslint-disable-next-line no-restricted-syntax
    for await (let chunk of readableStream) {
      while (chunk.length > 0) {
        const splitOnChunkByte = splitOnLength - bytesReadSinceLastSplit;

        // console.log(splitOnChunkByte, chunk.length);
        if (splitOnChunkByte >= 0 && splitOnChunkByte < chunk.length) {
          const partBefore = chunk.slice(0, splitOnChunkByte);
          const partAfter = chunk.slice(splitOnChunkByte);

          // eslint-disable-next-line no-await-in-loop
          await safeWrite(partBefore);
          newStreamOnNextWrite = true;
          // eslint-disable-next-line no-await-in-loop
          chunk = partAfter;
          bytesReadSinceLastSplit = 0;
        } else {
          // eslint-disable-next-line no-await-in-loop
          await safeWrite(chunk);
          bytesReadSinceLastSplit += chunk.length;
          chunk = Buffer.alloc(0);
        }
      }
    }
  }

  (async () => {
    try {
      if (splitOnLength != null) {
        await splitStreamOnLength();
      } else if (splitOnDelim != null) {
        await splitStreamOnDelim();
      }
      if (outStream) outStream.end();

      error = new Error('Stream has ended');
    } catch (err) {
      if (outStream) outStream.destroy(err);
      error = err;
    } finally {
      rejectAwaitingStreams();
    }
  })();

  return {
    awaitNextSplit,
  };
}

module.exports = createSplitter;
