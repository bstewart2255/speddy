const { TestEnvironment: JSDOMEnvironment } = require('jest-environment-jsdom');

// jsdom does not provide the WHATWG fetch/stream primitives that Next.js server
// modules (e.g. `next/server`) reference at import time. When a component test
// transitively imports one of those modules, jsdom throws "Request is not
// defined" while evaluating it. Copy the real implementations from the Node
// runtime onto the jsdom global so those modules can load. This needs no extra
// dependency — Node 18+ ships these globals.
const WEB_GLOBALS = [
  'Request',
  'Response',
  'Headers',
  'fetch',
  'FormData',
  'Blob',
  'File',
  'ReadableStream',
  'WritableStream',
  'TransformStream',
  'structuredClone',
  'TextEncoder',
  'TextDecoder',
];

module.exports = class CustomJsdomEnvironment extends JSDOMEnvironment {
  constructor(config, context) {
    super(config, context);
    for (const name of WEB_GLOBALS) {
      if (this.global[name] === undefined && globalThis[name] !== undefined) {
        this.global[name] = globalThis[name];
      }
    }
  }
};
