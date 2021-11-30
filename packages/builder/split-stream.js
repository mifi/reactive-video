const { PassThrough } = require('stream');
const { once } = require('events');

function createSplitter({ readableStream, splitOnDelim, splitOnLength }) {
  if ((splitOnDelim == null || splitOnDelim.length === 0) && !splitOnLength) {
    throw new TypeError('Specify one of splitOnDelim or splitOnLength');
  }

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
    // console.log('newStream');
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
    // console.log('awaitNextSplit');
    if (newStreams.length > 0) return newStreams.shift();

    if (error) throw error;

    if (readableStream.readableEnded) throw new Error('Stream has ended');

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
    // console.log('safeWrite', buf);
    if (!outStream.write(buf)) await once(outStream, 'drain');
    // console.log('safeWrite done');
  }

  // I'm not proud of this, but it works
  // https://www.youtube.com/watch?v=2Y1JX6jHoDU
  async function splitStreamOnDelim() {
    let workingBuf = Buffer.alloc(0);

    async function readMore() {
      if (readableStream.readableEnded) return false;

      let val = readableStream.read();
      if (val != null) {
        workingBuf = Buffer.concat([workingBuf, val]);
        return true;
      }
      await once(readableStream, 'readable');
      val = readableStream.read();
      if (val != null) {
        workingBuf = Buffer.concat([workingBuf, val]);
      }
      return !!val;
    }

    readableStream.pause();

    let hasMoreData = true;

    while (workingBuf.length > 0 || hasMoreData) {
      // eslint-disable-next-line no-await-in-loop
      hasMoreData = await readMore();

      let delimSearchOffset = 0;
      let delimIndex = -1;

      // todo improve this mess
      while (delimIndex < 0 && delimSearchOffset < workingBuf.length) {
        delimIndex = workingBuf.indexOf(splitOnDelim[0], delimSearchOffset);
        // console.log({ delimIndex, delimSearchOffset });
        if (delimIndex < 0) {
          delimSearchOffset += 1; // search again for more later in the stream!
        } else {
          // look for rest of the delim
          for (let i = 1; i < splitOnDelim.length; i += 1) {
            const offsetIndex = delimIndex + i;
            // delim may be divided between chunks?
            while (workingBuf[offsetIndex] == null) {
              // console.log('Reading more data - Delim may be split across 2 chunks');
              // eslint-disable-next-line no-await-in-loop
              hasMoreData = await readMore();
              if (!hasMoreData) {
                delimIndex = offsetIndex; // emulate end of file as a last delim to flush data
                break;
              }
            }

            if (workingBuf[offsetIndex] !== splitOnDelim[i]) {
              // console.log('nonmatch');
              delimSearchOffset = offsetIndex; // search again for more later in the stream
              delimIndex = -1;
              break;
            }
          }

          if (delimIndex >= 0) break; // if inner for loop finished, we have complete delim
        }
      }

      delimSearchOffset = 0;

      if (delimIndex >= 0) {
        // console.log('split', delimIndex);
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
