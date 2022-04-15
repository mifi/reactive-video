const { Readable } = require('stream');

const createSplitter = require('./split-stream');

const jpegSoi = Buffer.from([0xff, 0xd8]);

async function readableToBuffer(readable) {
  let result = Buffer.alloc(0);
  // eslint-disable-next-line no-restricted-syntax
  for await (const chunk of readable) {
    result = Buffer.concat([result, chunk]);
  }
  return result;
}

describe('splits properly on delim', () => {
  const cases = [
    ['2 byte delim', jpegSoi],
    ['1 byte delim', Buffer.from([0x00])],
  ];

  test.each(cases)('data has no delim, %p', async (name, soi) => {
    const readableStream = Readable.from(function* gen() {
      yield Buffer.from([0x01, 0x01]);
    }());

    const { awaitNextSplit } = createSplitter({ readableStream, splitOnDelim: soi });
    const subStream = await awaitNextSplit();
    expect(await readableToBuffer(subStream)).toEqual(Buffer.from([0x01, 0x01]));

    await expect(awaitNextSplit()).rejects.toThrow('Stream has ended');
  });

  test.each(cases)('data only has 1 delim, %p', async (name, soi) => {
    const readableStream = Readable.from(function* gen() {
      yield soi;
      yield Buffer.from([0xff, 0xff]);
    }());

    const { awaitNextSplit } = createSplitter({ readableStream, splitOnDelim: soi });
    const subStream = await awaitNextSplit();
    expect(await readableToBuffer(subStream)).toEqual(Buffer.concat([soi, Buffer.from([0xff, 0xff])]));

    await expect(awaitNextSplit()).rejects.toThrow('Stream has ended');
  });

  test.each(cases)('data has longer chunk with multiple delims, %p', async (name, soi) => {
    const readableStream = Readable.from(function* gen() {
      yield Buffer.concat([soi, Buffer.from([0xff, 0xff]), soi, soi, Buffer.from([0xd8])]);
      yield soi;
      yield Buffer.concat([Buffer.from([0xff, 0xff])]);
    }());

    const { awaitNextSplit } = createSplitter({
      readableStream,
      splitOnDelim: soi,
    });

    let subStream = await awaitNextSplit();
    expect(await readableToBuffer(subStream)).toEqual(Buffer.concat([soi, Buffer.from([0xff, 0xff])]));
    subStream = await awaitNextSplit();
    expect(await readableToBuffer(subStream)).toEqual(soi);
    subStream = await awaitNextSplit();
    expect(await readableToBuffer(subStream)).toEqual(Buffer.concat([soi, Buffer.from([0xd8])]));
    subStream = await awaitNextSplit();
    expect(await readableToBuffer(subStream)).toEqual(Buffer.concat([soi, Buffer.from([0xff, 0xff])]));

    await expect(awaitNextSplit()).rejects.toThrow('Stream has ended');
  });

  test.each(cases)('data has one byte only, %p', async (name, soi) => {
    const readableStream = Readable.from(function* gen() {
      yield Buffer.from([soi[0]]);
    }());

    const { awaitNextSplit } = createSplitter({ readableStream, splitOnDelim: soi });
    const subStream = await awaitNextSplit();
    expect(await readableToBuffer(subStream)).toEqual(Buffer.from([soi[0]]));

    await expect(awaitNextSplit()).rejects.toThrow('Stream has ended');
  });

  test.each(cases)('data is delim only, %p', async (name, soi) => {
    const readableStream = Readable.from(function* gen() {
      yield soi;
    }());

    const { awaitNextSplit } = createSplitter({ readableStream, splitOnDelim: soi });
    const subStream = await awaitNextSplit();
    expect(await readableToBuffer(subStream)).toEqual(soi);

    await expect(awaitNextSplit()).rejects.toThrow('Stream has ended');
  });

  test.each(cases)('data has delim at end, %p', async (name, soi) => {
    const readableStream = Readable.from(function* gen() {
      yield Buffer.from([0xff, 0xff]);
      yield soi;
    }());

    const { awaitNextSplit } = createSplitter({ readableStream, splitOnDelim: soi });
    let subStream = await awaitNextSplit();
    expect(await readableToBuffer(subStream)).toEqual(Buffer.from([0xff, 0xff]));
    subStream = await awaitNextSplit();
    expect(await readableToBuffer(subStream)).toEqual(soi);

    await expect(awaitNextSplit()).rejects.toThrow('Stream has ended');
  });

  test.each(cases)('no data, %p', async (name, soi) => {
    const readableStream = Readable.from([]);

    const { awaitNextSplit } = createSplitter({ readableStream, splitOnDelim: soi });
    await expect(awaitNextSplit()).rejects.toThrow('Stream has ended');
    await expect(awaitNextSplit()).rejects.toThrow('Stream has ended');
  });
});

test('splits on delim in the middle between two chunks', async () => {
  const readableStream = Readable.from(function* gen() {
    yield Buffer.from([jpegSoi[0]]);
    yield Buffer.from([jpegSoi[1]]);
  }());

  const { awaitNextSplit } = createSplitter({ readableStream, splitOnDelim: jpegSoi });
  const subStream = await awaitNextSplit();
  expect(await readableToBuffer(subStream)).toEqual(jpegSoi);

  await expect(awaitNextSplit()).rejects.toThrow('Stream has ended');
});

test('splits on delim when only part of delim at end of chunk', async () => {
  const readableStream = Readable.from(function* gen() {
    yield Buffer.from([jpegSoi[0]]);
  }());

  const { awaitNextSplit } = createSplitter({ readableStream, splitOnDelim: jpegSoi });
  const subStream = await awaitNextSplit();
  expect(await readableToBuffer(subStream)).toEqual(Buffer.from([jpegSoi[0]]));

  await expect(awaitNextSplit()).rejects.toThrow('Stream has ended');
});

describe('split on lengths', () => {
  const cases = [
    [1],
    [2],
    [3],
  ];
  test.each(cases)('no data, length %p', async (length) => {
    const readableStream = Readable.from([]);

    const { awaitNextSplit } = createSplitter({ readableStream, splitOnLength: length });
    await expect(awaitNextSplit()).rejects.toThrow('Stream has ended');
    await expect(awaitNextSplit()).rejects.toThrow('Stream has ended');
  });

  test.each(cases)('1 byte, length %p', async (length) => {
    const readableStream = Readable.from(Buffer.from([0x01]));

    const { awaitNextSplit } = createSplitter({ readableStream, splitOnLength: length });
    const subStream = await awaitNextSplit();
    expect(await readableToBuffer(subStream)).toEqual(Buffer.from([0x01]));

    await expect(awaitNextSplit()).rejects.toThrow('Stream has ended');
  });

  test.each(cases)('2 bytes, length %p', async (length) => {
    const readableStream = Readable.from(Buffer.from([0x01, 0x02]));

    const { awaitNextSplit } = createSplitter({ readableStream, splitOnLength: length });
    let subStream = await awaitNextSplit();

    if (length === 1) {
      expect(await readableToBuffer(subStream)).toEqual(Buffer.from([0x01]));
      subStream = await awaitNextSplit();
      expect(await readableToBuffer(subStream)).toEqual(Buffer.from([0x02]));
    } else {
      expect(await readableToBuffer(subStream)).toEqual(Buffer.from([0x01, 0x02]));
    }

    await expect(awaitNextSplit()).rejects.toThrow('Stream has ended');
  });

  test.each(cases)('3 bytes, separate chunks, length %p', async (length) => {
    const readableStream = Readable.from(function* gen() {
      yield Buffer.from([0x01, 0x02]);
      yield Buffer.from([0x03]);
    }());

    const { awaitNextSplit } = createSplitter({ readableStream, splitOnLength: length });
    let subStream = await awaitNextSplit();

    if (length === 1) {
      expect(await readableToBuffer(subStream)).toEqual(Buffer.from([0x01]));
      subStream = await awaitNextSplit();
      expect(await readableToBuffer(subStream)).toEqual(Buffer.from([0x02]));
      subStream = await awaitNextSplit();
      expect(await readableToBuffer(subStream)).toEqual(Buffer.from([0x03]));
    } else if (length === 2) {
      expect(await readableToBuffer(subStream)).toEqual(Buffer.from([0x01, 0x02]));
      subStream = await awaitNextSplit();
      expect(await readableToBuffer(subStream)).toEqual(Buffer.from([0x03]));
    } else {
      expect(await readableToBuffer(subStream)).toEqual(Buffer.from([0x01, 0x02, 0x03]));
    }

    await expect(awaitNextSplit()).rejects.toThrow('Stream has ended');
  });
});

test('split on length 2 (5 bytes)', async () => {
  const readableStream = Readable.from(Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]));

  const { awaitNextSplit } = createSplitter({ readableStream, splitOnLength: 2 });
  let subStream = await awaitNextSplit();

  expect(await readableToBuffer(subStream)).toEqual(Buffer.from([0x01, 0x02]));
  subStream = await awaitNextSplit();
  expect(await readableToBuffer(subStream)).toEqual(Buffer.from([0x03, 0x04]));
  subStream = await awaitNextSplit();
  expect(await readableToBuffer(subStream)).toEqual(Buffer.from([0x05]));

  await expect(awaitNextSplit()).rejects.toThrow('Stream has ended');
});

test('split on length 2 (4 bytes)', async () => {
  const readableStream = Readable.from(Buffer.from([0x01, 0x02, 0x03, 0x04]));

  const { awaitNextSplit } = createSplitter({ readableStream, splitOnLength: 2 });
  let subStream = await awaitNextSplit();

  expect(await readableToBuffer(subStream)).toEqual(Buffer.from([0x01, 0x02]));
  subStream = await awaitNextSplit();
  expect(await readableToBuffer(subStream)).toEqual(Buffer.from([0x03, 0x04]));

  await expect(awaitNextSplit()).rejects.toThrow('Stream has ended');
});
