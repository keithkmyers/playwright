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

import { z } from 'playwright-core/lib/mcpBundle';
import { defineTabTool } from './tool';

const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

const annotateSchema = z.object({
  action: z.enum(['highlight', 'arrow', 'blur', 'clear']).describe('Type of annotation to perform'),

  // Target — element ref or freeform rect (highlight, blur)
  ref: z.string().optional().describe('Element ref from page snapshot'),
  element: z.string().optional().describe('Human-readable element description used to obtain permission to interact with the element'),
  rect: rectSchema.optional().describe('Freeform pixel coordinates { x, y, w, h }'),

  // Arrow endpoints
  startRef: z.string().optional().describe('Arrow start element ref from page snapshot'),
  startElement: z.string().optional().describe('Human-readable start element description'),
  startPoint: pointSchema.optional().describe('Arrow start point { x, y }'),
  endRef: z.string().optional().describe('Arrow end element ref from page snapshot'),
  endElement: z.string().optional().describe('Human-readable end element description'),
  endPoint: pointSchema.optional().describe('Arrow end point { x, y }'),

  // Styling
  style: z.enum(['box', 'circle', 'shade']).optional().describe('Highlight shape (default: box)'),
  color: z.string().optional().describe('CSS color for the annotation (default: rgba(255, 0, 0, 0.4))'),
  label: z.string().optional().describe('Text label displayed near the annotation'),

  // Blur
  intensity: z.number().optional().describe('Blur radius in pixels (default: 8)'),

  // Identity
  id: z.string().optional().describe('Annotation ID for selective removal via the clear action'),
});

/**
 * JavaScript to inject the annotation container into the page.
 * Uses a closed Shadow DOM to fully isolate annotations from:
 * - The accessibility tree (won't appear in browser_snapshot)
 * - Page styles and scripts
 * The host element is fixed-position, fullscreen, pointer-events-none,
 * and at maximum z-index so annotations render in screenshots
 * without interfering with page interactions.
 */
function ensureContainerScript(): string {
  return `
    (() => {
      if (document.getElementById('__pw_mcp_annotations')) return;
      const host = document.createElement('div');
      host.id = '__pw_mcp_annotations';
      host.setAttribute('aria-hidden', 'true');
      host.setAttribute('role', 'presentation');
      host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
      const shadow = host.attachShadow({ mode: 'open' });
      const root = document.createElement('div');
      root.id = '__pw_mcp_annotations_root';
      root.style.cssText = 'position:fixed;inset:0;';
      shadow.appendChild(root);
      document.body.appendChild(host);
    })();
  `;
}

function highlightScript(rect: { x: number; y: number; w: number; h: number }, options: {
  style: string;
  color: string;
  label?: string;
  id: string;
}): string {
  const { style, color, label, id } = options;
  return `
    (() => {
      ${ensureContainerScript()}
      const container = document.getElementById('__pw_mcp_annotations').shadowRoot.getElementById('__pw_mcp_annotations_root');
      const el = document.createElement('div');
      el.dataset.annotationId = ${JSON.stringify(id)};
      el.dataset.annotationType = 'highlight';

      const r = ${JSON.stringify(rect)};
      el.style.cssText = 'position:fixed;box-sizing:border-box;'
        + 'left:' + r.x + 'px;top:' + r.y + 'px;'
        + 'width:' + r.w + 'px;height:' + r.h + 'px;';

      ${style === 'box' ? `
        el.style.border = '3px solid ' + ${JSON.stringify(color)};
      ` : style === 'circle' ? `
        el.style.border = '3px solid ' + ${JSON.stringify(color)};
        el.style.borderRadius = '50%';
      ` : /* shade */ `
        el.style.backgroundColor = ${JSON.stringify(color)};
      `}

      ${label ? `
        const lbl = document.createElement('img');
        lbl.alt = '';
        lbl.setAttribute('role', 'presentation');
        const svgLabel = '<svg xmlns="http://www.w3.org/2000/svg"><text x="4" y="14" fill="white" font-size="12" font-family="sans-serif">' + ${JSON.stringify(label)}.replace(/[<>&"']/g, c => '&#' + c.charCodeAt(0) + ';') + '</text></svg>';
        const measure = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        measure.style.cssText = 'position:absolute;visibility:hidden;';
        document.body.appendChild(measure);
        const measureText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        measureText.setAttribute('font-size', '12');
        measureText.setAttribute('font-family', 'sans-serif');
        measureText.textContent = ${JSON.stringify(label)};
        measure.appendChild(measureText);
        const tw = measureText.getBBox().width;
        document.body.removeChild(measure);
        const svgW = Math.ceil(tw + 8);
        const svgFull = '<svg xmlns="http://www.w3.org/2000/svg" width="' + svgW + '" height="20">'
          + '<rect width="' + svgW + '" height="20" rx="3" fill="rgba(0,0,0,0.7)"/>'
          + '<text x="4" y="14" fill="white" font-size="12" font-family="sans-serif">'
          + ${JSON.stringify(label)}.replace(/[<>&"']/g, c => '&#' + c.charCodeAt(0) + ';')
          + '</text></svg>';
        lbl.src = 'data:image/svg+xml,' + encodeURIComponent(svgFull);
        lbl.dataset.label = ${JSON.stringify(label)};
        lbl.style.cssText = 'position:absolute;top:-22px;left:0;height:20px;';
        el.appendChild(lbl);
      ` : ''}

      container.appendChild(el);
    })();
  `;
}

function arrowScript(start: { x: number; y: number }, end: { x: number; y: number }, options: {
  color: string;
  label?: string;
  id: string;
}): string {
  const { color, label, id } = options;
  return `
    (() => {
      ${ensureContainerScript()}
      const container = document.getElementById('__pw_mcp_annotations').shadowRoot.getElementById('__pw_mcp_annotations_root');
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.dataset.annotationId = ${JSON.stringify(id)};
      svg.dataset.annotationType = 'arrow';
      svg.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;overflow:visible;';
      svg.setAttribute('xmlns', ns);

      // Arrowhead marker
      const defs = document.createElementNS(ns, 'defs');
      const marker = document.createElementNS(ns, 'marker');
      const markerId = 'pw-arrow-' + ${JSON.stringify(id)};
      marker.setAttribute('id', markerId);
      marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '10');
      marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '8');
      marker.setAttribute('markerHeight', '8');
      marker.setAttribute('orient', 'auto-start-reverse');
      const polygon = document.createElementNS(ns, 'polygon');
      polygon.setAttribute('points', '0 0, 10 5, 0 10');
      polygon.setAttribute('fill', ${JSON.stringify(color)});
      marker.appendChild(polygon);
      defs.appendChild(marker);
      svg.appendChild(defs);

      // Line
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', String(${JSON.stringify(start)}.x));
      line.setAttribute('y1', String(${JSON.stringify(start)}.y));
      line.setAttribute('x2', String(${JSON.stringify(end)}.x));
      line.setAttribute('y2', String(${JSON.stringify(end)}.y));
      line.setAttribute('stroke', ${JSON.stringify(color)});
      line.setAttribute('stroke-width', '2');
      line.setAttribute('marker-end', 'url(#' + markerId + ')');
      svg.appendChild(line);

      ${label ? `
        const midX = (${start.x} + ${end.x}) / 2;
        const midY = (${start.y} + ${end.y}) / 2;
        const text = document.createElementNS(ns, 'text');
        text.setAttribute('x', String(midX));
        text.setAttribute('y', String(midY - 8));
        text.setAttribute('fill', 'white');
        text.setAttribute('font-size', '12');
        text.setAttribute('font-family', 'sans-serif');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('aria-hidden', 'true');

        const bg = document.createElementNS(ns, 'rect');
        svg.appendChild(text);
        text.textContent = ${JSON.stringify(label)};
        const bbox = text.getBBox();
        bg.setAttribute('x', String(bbox.x - 4));
        bg.setAttribute('y', String(bbox.y - 2));
        bg.setAttribute('width', String(bbox.width + 8));
        bg.setAttribute('height', String(bbox.height + 4));
        bg.setAttribute('fill', 'rgba(0,0,0,0.7)');
        bg.setAttribute('rx', '3');
        svg.insertBefore(bg, text);
      ` : ''}

      container.appendChild(svg);
    })();
  `;
}

function blurScript(rect: { x: number; y: number; w: number; h: number }, options: {
  intensity: number;
  id: string;
}): string {
  const { intensity, id } = options;
  return `
    (() => {
      ${ensureContainerScript()}
      const container = document.getElementById('__pw_mcp_annotations').shadowRoot.getElementById('__pw_mcp_annotations_root');
      const el = document.createElement('div');
      el.dataset.annotationId = ${JSON.stringify(id)};
      el.dataset.annotationType = 'blur';

      const r = ${JSON.stringify(rect)};
      el.style.cssText = 'position:fixed;box-sizing:border-box;'
        + 'left:' + r.x + 'px;top:' + r.y + 'px;'
        + 'width:' + r.w + 'px;height:' + r.h + 'px;'
        + 'backdrop-filter:blur(' + ${intensity} + 'px);'
        + '-webkit-backdrop-filter:blur(' + ${intensity} + 'px);'
        + 'background:rgba(255,255,255,0.05);';

      container.appendChild(el);
    })();
  `;
}

function clearScript(id?: string): string {
  if (id) {
    return `
      (() => {
        const host = document.getElementById('__pw_mcp_annotations');
        if (!host || !host.shadowRoot) return 0;
        const root = host.shadowRoot.getElementById('__pw_mcp_annotations_root');
        if (!root) return 0;
        const els = root.querySelectorAll('[data-annotation-id="${id}"]');
        const count = els.length;
        els.forEach(el => el.remove());
        if (!root.children.length) host.remove();
        return count;
      })();
    `;
  }
  return `
    (() => {
      const host = document.getElementById('__pw_mcp_annotations');
      if (!host || !host.shadowRoot) return 0;
      const root = host.shadowRoot.getElementById('__pw_mcp_annotations_root');
      const count = root ? root.children.length : 0;
      host.remove();
      return count;
    })();
  `;
}

let annotationCounter = 0;

function nextId(userProvidedId?: string): string {
  return userProvidedId || `annotation-${++annotationCounter}`;
}

const annotate = defineTabTool({
  capability: 'annotation',

  schema: {
    name: 'browser_annotate',
    title: 'Annotate',
    description: 'Add visual annotations to the page: highlights (box, circle, shade), arrows between elements or points, blur overlays to obscure content, or clear existing annotations.',
    inputSchema: annotateSchema,
    type: 'action',
  },

  handle: async (tab, params, response) => {
    switch (params.action) {
      case 'highlight': {
        if (!params.ref && !params.rect)
          throw new Error('Highlight requires either "ref" or "rect" parameter.');

        const id = nextId(params.id);
        const color = params.color || 'rgba(255, 0, 0, 0.4)';
        const style = params.style || 'box';

        let rect: { x: number; y: number; w: number; h: number };
        if (params.ref) {
          const { locator } = await tab.refLocator({ ref: params.ref, element: params.element });
          const box = await locator.boundingBox();
          if (!box)
            throw new Error(`Element with ref "${params.ref}" is not visible on the page.`);
          rect = { x: box.x, y: box.y, w: box.width, h: box.height };
        } else {
          rect = params.rect!;
        }

        await tab.page.evaluate(highlightScript(rect, { style, color, label: params.label, id }));
        response.addTextResult(`Highlighted ${params.ref ? `element "${params.element || params.ref}"` : `region (${rect.x},${rect.y},${rect.w},${rect.h})`} with ${style} style [id=${id}]`);
        break;
      }

      case 'arrow': {
        const hasStart = params.startRef || params.startPoint;
        const hasEnd = params.endRef || params.endPoint;
        if (!hasStart || !hasEnd)
          throw new Error('Arrow requires start (startRef or startPoint) and end (endRef or endPoint) parameters.');

        const id = nextId(params.id);
        const color = params.color || 'red';

        let start: { x: number; y: number };
        if (params.startRef) {
          const { locator } = await tab.refLocator({ ref: params.startRef, element: params.startElement });
          const box = await locator.boundingBox();
          if (!box)
            throw new Error(`Start element with ref "${params.startRef}" is not visible on the page.`);
          start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        } else {
          start = params.startPoint!;
        }

        let end: { x: number; y: number };
        if (params.endRef) {
          const { locator } = await tab.refLocator({ ref: params.endRef, element: params.endElement });
          const box = await locator.boundingBox();
          if (!box)
            throw new Error(`End element with ref "${params.endRef}" is not visible on the page.`);
          end = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        } else {
          end = params.endPoint!;
        }

        await tab.page.evaluate(arrowScript(start, end, { color, label: params.label, id }));
        response.addTextResult(`Drew arrow from (${start.x},${start.y}) to (${end.x},${end.y}) [id=${id}]`);
        break;
      }

      case 'blur': {
        if (!params.ref && !params.rect)
          throw new Error('Blur requires either "ref" or "rect" parameter.');

        const id = nextId(params.id);
        const intensity = params.intensity || 8;

        let rect: { x: number; y: number; w: number; h: number };
        if (params.ref) {
          const { locator } = await tab.refLocator({ ref: params.ref, element: params.element });
          const box = await locator.boundingBox();
          if (!box)
            throw new Error(`Element with ref "${params.ref}" is not visible on the page.`);
          rect = { x: box.x, y: box.y, w: box.width, h: box.height };
        } else {
          rect = params.rect!;
        }

        await tab.page.evaluate(blurScript(rect, { intensity, id }));
        response.addTextResult(`Blurred ${params.ref ? `element "${params.element || params.ref}"` : `region (${rect.x},${rect.y},${rect.w},${rect.h})`} with intensity ${intensity}px [id=${id}]`);
        break;
      }

      case 'clear': {
        const removed = await tab.page.evaluate(clearScript(params.id)) as number;
        if (params.id)
          response.addTextResult(`Cleared annotation "${params.id}" (${removed} element${removed !== 1 ? 's' : ''} removed)`);
        else
          response.addTextResult(`Cleared all annotations (${removed} element${removed !== 1 ? 's' : ''} removed)`);
        break;
      }
    }
  },
});

export default [
  annotate,
];
