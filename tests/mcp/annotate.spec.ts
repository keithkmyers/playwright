/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { test, expect } from './fixtures';

test.use({ mcpCaps: ['annotation'] });

test('browser_annotate highlight by ref (box)', async ({ client, server }) => {
  server.setContent('/', `
    <title>Test</title>
    <button style="margin:50px;padding:10px;">Click me</button>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'highlight',
      ref: 'e2',
      element: 'Click me button',
      style: 'box',
      color: 'red',
      id: 'test-highlight',
    },
  });

  expect(result).toHaveResponse({
    result: expect.stringContaining('[id=test-highlight]'),
  });

  // Verify the annotation container exists in the DOM
  const hasContainer = await client.callTool({
    name: 'browser_evaluate',
    arguments: {
      function: '() => { const h = document.getElementById("__pw_mcp_annotations"); return !!(h && h.shadowRoot); }',
    },
  });
  expect(hasContainer).toHaveResponse({
    result: expect.stringContaining('true'),
  });
});

test('browser_annotate highlight by rect', async ({ client, server }) => {
  server.setContent('/', `
    <title>Test</title>
    <div>Content</div>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'highlight',
      rect: { x: 10, y: 10, w: 200, h: 100 },
      style: 'shade',
      color: 'rgba(0, 0, 255, 0.3)',
      id: 'rect-highlight',
    },
  });

  expect(result).toHaveResponse({
    result: expect.stringContaining('region (10,10,200,100)'),
  });
});

test('browser_annotate highlight circle style', async ({ client, server }) => {
  server.setContent('/', `
    <title>Test</title>
    <button style="margin:50px;padding:10px;">Target</button>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'highlight',
      ref: 'e2',
      style: 'circle',
      id: 'circle-test',
    },
  });

  expect(result).toHaveResponse({
    result: expect.stringContaining('circle'),
  });
});

test('browser_annotate highlight with label', async ({ client, server }) => {
  server.setContent('/', `
    <title>Test</title>
    <button style="margin:50px;padding:10px;">Target</button>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'highlight',
      ref: 'e2',
      label: 'Important button',
      id: 'labeled',
    },
  });

  expect(result).toHaveResponse({
    result: expect.stringContaining('[id=labeled]'),
  });

  // Verify label exists
  const hasLabel = await client.callTool({
    name: 'browser_evaluate',
    arguments: {
      function: '() => document.getElementById("__pw_mcp_annotations").shadowRoot.querySelector("[data-annotation-id=\\"labeled\\"] img")?.dataset.label',
    },
  });
  expect(hasLabel).toHaveResponse({
    result: expect.stringContaining('Important button'),
  });
});

test('browser_annotate highlight requires ref or rect', async ({ client, server }) => {
  server.setContent('/', `<title>Test</title>`, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'highlight',
      style: 'box',
    },
  });

  expect(result).toHaveResponse({
    error: expect.stringContaining('requires either "ref" or "rect"'),
  });
});

test('browser_annotate arrow between two refs', async ({ client, server }) => {
  server.setContent('/', `
    <title>Test</title>
    <div style="display:flex;gap:200px;margin:50px;">
      <button>Start</button>
      <button>End</button>
    </div>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'arrow',
      startRef: 'e3',
      startElement: 'Start button',
      endRef: 'e4',
      endElement: 'End button',
      color: 'blue',
      id: 'test-arrow',
    },
  });

  expect(result).toHaveResponse({
    result: expect.stringContaining('Drew arrow'),
  });

  // Verify SVG arrow exists
  const hasArrow = await client.callTool({
    name: 'browser_evaluate',
    arguments: {
      function: '() => !!document.getElementById("__pw_mcp_annotations").shadowRoot.querySelector("[data-annotation-id=\\"test-arrow\\"] line")',
    },
  });
  expect(hasArrow).toHaveResponse({
    result: expect.stringContaining('true'),
  });
});

test('browser_annotate arrow between points', async ({ client, server }) => {
  server.setContent('/', `<title>Test</title>`, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'arrow',
      startPoint: { x: 10, y: 10 },
      endPoint: { x: 200, y: 200 },
      id: 'point-arrow',
    },
  });

  expect(result).toHaveResponse({
    result: expect.stringContaining('Drew arrow from (10,10) to (200,200)'),
  });
});

test('browser_annotate arrow requires start and end', async ({ client, server }) => {
  server.setContent('/', `<title>Test</title>`, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'arrow',
      startPoint: { x: 10, y: 10 },
    },
  });

  expect(result).toHaveResponse({
    error: expect.stringContaining('requires start'),
  });
});

test('browser_annotate blur by ref', async ({ client, server }) => {
  server.setContent('/', `
    <title>Test</title>
    <p style="margin:50px;">Sensitive data: 123-45-6789</p>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'blur',
      ref: 'e2',
      intensity: 10,
      id: 'blur-pii',
    },
  });

  expect(result).toHaveResponse({
    result: expect.stringContaining('Blurred'),
  });

  // Verify blur element exists with backdrop-filter
  const hasBlur = await client.callTool({
    name: 'browser_evaluate',
    arguments: {
      function: '() => { const el = document.getElementById("__pw_mcp_annotations").shadowRoot.querySelector("[data-annotation-id=\\"blur-pii\\"]"); return el ? el.style.backdropFilter : null; }',
    },
  });
  expect(hasBlur).toHaveResponse({
    result: expect.stringContaining('blur(10px)'),
  });
});

test('browser_annotate blur by rect', async ({ client, server }) => {
  server.setContent('/', `<title>Test</title><div>Content</div>`, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const result = await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'blur',
      rect: { x: 0, y: 0, w: 300, h: 50 },
      id: 'blur-rect',
    },
  });

  expect(result).toHaveResponse({
    result: expect.stringContaining('region (0,0,300,50)'),
  });
});

test('browser_annotate clear by id', async ({ client, server }) => {
  server.setContent('/', `
    <title>Test</title>
    <button style="margin:50px;">Target</button>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  // Add two annotations
  await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'highlight',
      ref: 'e2',
      id: 'keep-me',
    },
  });

  await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'highlight',
      rect: { x: 0, y: 0, w: 50, h: 50 },
      id: 'remove-me',
    },
  });

  // Clear only one
  const result = await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'clear',
      id: 'remove-me',
    },
  });

  expect(result).toHaveResponse({
    result: expect.stringContaining('Cleared annotation "remove-me"'),
  });

  // Verify the other is still there
  const remaining = await client.callTool({
    name: 'browser_evaluate',
    arguments: {
      function: '() => document.getElementById("__pw_mcp_annotations").shadowRoot.querySelectorAll("[data-annotation-id=\\"keep-me\\"]").length',
    },
  });
  expect(remaining).toHaveResponse({
    result: expect.stringContaining('1'),
  });
});

test('browser_annotate clear all', async ({ client, server }) => {
  server.setContent('/', `
    <title>Test</title>
    <button style="margin:50px;">Target</button>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  // Add multiple annotations
  await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'highlight',
      ref: 'e2',
      id: 'h1',
    },
  });

  await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'highlight',
      rect: { x: 0, y: 0, w: 50, h: 50 },
      id: 'h2',
    },
  });

  // Clear all
  const result = await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'clear',
    },
  });

  expect(result).toHaveResponse({
    result: expect.stringContaining('Cleared all annotations (2'),
  });

  // Verify container is gone
  const noContainer = await client.callTool({
    name: 'browser_evaluate',
    arguments: {
      function: '() => document.getElementById("__pw_mcp_annotations") === null',
    },
  });
  expect(noContainer).toHaveResponse({
    result: expect.stringContaining('true'),
  });
});

test('browser_annotate does not pollute accessibility snapshot', async ({ client, server }) => {
  server.setContent('/', `
    <title>Test</title>
    <button>Real button</button>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  // Add annotation
  await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'highlight',
      ref: 'e2',
      label: 'Should not appear in snapshot',
      id: 'invisible',
    },
  });

  // Take snapshot — annotation container should not appear
  const snapshot = await client.callTool({
    name: 'browser_snapshot',
    arguments: {},
  });

  expect(snapshot).toHaveResponse({
    snapshot: expect.not.stringContaining('__pw_mcp_annotations'),
  });

  expect(snapshot).toHaveResponse({
    snapshot: expect.not.stringContaining('Should not appear in snapshot'),
  });

  expect(snapshot).toHaveResponse({
    snapshot: expect.stringContaining('Real button'),
  });
});

test('browser_annotate multiple annotations coexist', async ({ client, server }) => {
  server.setContent('/', `
    <title>Test</title>
    <div style="margin:50px;">
      <button>First</button>
      <button>Second</button>
    </div>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'highlight',
      ref: 'e3',
      style: 'box',
      id: 'ann-1',
    },
  });

  await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'highlight',
      ref: 'e4',
      style: 'circle',
      id: 'ann-2',
    },
  });

  await client.callTool({
    name: 'browser_annotate',
    arguments: {
      action: 'blur',
      rect: { x: 0, y: 0, w: 100, h: 30 },
      id: 'ann-3',
    },
  });

  // Verify all three exist
  const count = await client.callTool({
    name: 'browser_evaluate',
    arguments: {
      function: '() => document.getElementById("__pw_mcp_annotations").shadowRoot.getElementById("__pw_mcp_annotations_root").children.length',
    },
  });
  expect(count).toHaveResponse({
    result: expect.stringContaining('3'),
  });
});

test('browser_annotate not available without annotation capability', async ({ startClient, server }) => {
  // Start client WITHOUT annotation capability — omit the --caps=annotation arg injected by test.use
  const { client } = await startClient({
    omitArgs: ['--caps=annotation'],
  });

  server.setContent('/', `<title>Test</title>`, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  // Tool should not be listed
  const tools = await client.listTools();
  const annotateTools = tools.tools.filter(t => t.name === 'browser_annotate');
  expect(annotateTools).toHaveLength(0);
});
