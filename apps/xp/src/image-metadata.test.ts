import assert from 'node:assert/strict';
import test from 'node:test';
import { imageDimensionsAreSafe, parseSafeImageMetadata } from './image-metadata.js';

test('le dimensoes de PNG sem decodificar conteudo arbitrario', () => {
  const buffer = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(320, 16);
  buffer.writeUInt32BE(240, 20);

  assert.deepEqual(parseSafeImageMetadata(buffer), { type: 'png', width: 320, height: 240 });
});

test('le dimensoes de JPEG percorrendo apenas segmentos limitados', () => {
  const buffer = Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x64, 0x00, 0xc8, 0x03, 0x00, 0x00, 0x00,
    0xff, 0xd9,
  ]);

  assert.deepEqual(parseSafeImageMetadata(buffer), { type: 'jpg', width: 200, height: 100 });
});

test('le dimensoes de WEBP VP8X', () => {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(22, 4);
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8X', 12, 'ascii');
  buffer.writeUInt32LE(10, 16);
  buffer.writeUIntLE(639, 24, 3);
  buffer.writeUIntLE(479, 27, 3);

  assert.deepEqual(parseSafeImageMetadata(buffer), { type: 'webp', width: 640, height: 480 });
});

test('rejeita formatos fora da lista mesmo quando possuem dimensoes internas', () => {
  const forbidden = [
    Buffer.from('69636e7300000010', 'hex'),
    Buffer.from('0000000c4a584c20', 'hex'),
    Buffer.from('000000186674797068656963', 'hex'),
  ];

  for (const buffer of forbidden) {
    assert.throws(() => parseSafeImageMetadata(buffer), /JPG, PNG ou WEBP/);
  }
});

test('rejeita JPEG truncado sem repetir leitura indefinidamente', () => {
  const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]);
  assert.throws(() => parseSafeImageMetadata(buffer), /JPG, PNG ou WEBP/);
});

test('limita dimensoes e total de pixels para evitar imagem de descompressao excessiva', () => {
  assert.equal(imageDimensionsAreSafe({ type: 'png', width: 800, height: 800 }), true);
  assert.equal(imageDimensionsAreSafe({ type: 'png', width: 79, height: 800 }), false);
  assert.equal(imageDimensionsAreSafe({ type: 'png', width: 8193, height: 100 }), false);
  assert.equal(imageDimensionsAreSafe({ type: 'png', width: 8000, height: 6000 }), false);
});
