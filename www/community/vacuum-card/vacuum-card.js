/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * True if the custom elements polyfill is in use.
 */
const isCEPolyfill = typeof window !== 'undefined' &&
    window.customElements != null &&
    window.customElements.polyfillWrapFlushCallback !==
        undefined;
/**
 * Removes nodes, starting from `start` (inclusive) to `end` (exclusive), from
 * `container`.
 */
const removeNodes = (container, start, end = null) => {
    while (start !== end) {
        const n = start.nextSibling;
        container.removeChild(start);
        start = n;
    }
};

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * An expression marker with embedded unique key to avoid collision with
 * possible text in templates.
 */
const marker = `{{lit-${String(Math.random()).slice(2)}}}`;
/**
 * An expression marker used text-positions, multi-binding attributes, and
 * attributes with markup-like text values.
 */
const nodeMarker = `<!--${marker}-->`;
const markerRegex = new RegExp(`${marker}|${nodeMarker}`);
/**
 * Suffix appended to all bound attribute names.
 */
const boundAttributeSuffix = '$lit$';
/**
 * An updatable Template that tracks the location of dynamic parts.
 */
class Template {
    constructor(result, element) {
        this.parts = [];
        this.element = element;
        const nodesToRemove = [];
        const stack = [];
        // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be null
        const walker = document.createTreeWalker(element.content, 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */, null, false);
        // Keeps track of the last index associated with a part. We try to delete
        // unnecessary nodes, but we never want to associate two different parts
        // to the same index. They must have a constant node between.
        let lastPartIndex = 0;
        let index = -1;
        let partIndex = 0;
        const { strings, values: { length } } = result;
        while (partIndex < length) {
            const node = walker.nextNode();
            if (node === null) {
                // We've exhausted the content inside a nested template element.
                // Because we still have parts (the outer for-loop), we know:
                // - There is a template in the stack
                // - The walker will find a nextNode outside the template
                walker.currentNode = stack.pop();
                continue;
            }
            index++;
            if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
                if (node.hasAttributes()) {
                    const attributes = node.attributes;
                    const { length } = attributes;
                    // Per
                    // https://developer.mozilla.org/en-US/docs/Web/API/NamedNodeMap,
                    // attributes are not guaranteed to be returned in document order.
                    // In particular, Edge/IE can return them out of order, so we cannot
                    // assume a correspondence between part index and attribute index.
                    let count = 0;
                    for (let i = 0; i < length; i++) {
                        if (endsWith(attributes[i].name, boundAttributeSuffix)) {
                            count++;
                        }
                    }
                    while (count-- > 0) {
                        // Get the template literal section leading up to the first
                        // expression in this attribute
                        const stringForPart = strings[partIndex];
                        // Find the attribute name
                        const name = lastAttributeNameRegex.exec(stringForPart)[2];
                        // Find the corresponding attribute
                        // All bound attributes have had a suffix added in
                        // TemplateResult#getHTML to opt out of special attribute
                        // handling. To look up the attribute value we also need to add
                        // the suffix.
                        const attributeLookupName = name.toLowerCase() + boundAttributeSuffix;
                        const attributeValue = node.getAttribute(attributeLookupName);
                        node.removeAttribute(attributeLookupName);
                        const statics = attributeValue.split(markerRegex);
                        this.parts.push({ type: 'attribute', index, name, strings: statics });
                        partIndex += statics.length - 1;
                    }
                }
                if (node.tagName === 'TEMPLATE') {
                    stack.push(node);
                    walker.currentNode = node.content;
                }
            }
            else if (node.nodeType === 3 /* Node.TEXT_NODE */) {
                const data = node.data;
                if (data.indexOf(marker) >= 0) {
                    const parent = node.parentNode;
                    const strings = data.split(markerRegex);
                    const lastIndex = strings.length - 1;
                    // Generate a new text node for each literal section
                    // These nodes are also used as the markers for node parts
                    for (let i = 0; i < lastIndex; i++) {
                        let insert;
                        let s = strings[i];
                        if (s === '') {
                            insert = createMarker();
                        }
                        else {
                            const match = lastAttributeNameRegex.exec(s);
                            if (match !== null && endsWith(match[2], boundAttributeSuffix)) {
                                s = s.slice(0, match.index) + match[1] +
                                    match[2].slice(0, -boundAttributeSuffix.length) + match[3];
                            }
                            insert = document.createTextNode(s);
                        }
                        parent.insertBefore(insert, node);
                        this.parts.push({ type: 'node', index: ++index });
                    }
                    // If there's no text, we must insert a comment to mark our place.
                    // Else, we can trust it will stick around after cloning.
                    if (strings[lastIndex] === '') {
                        parent.insertBefore(createMarker(), node);
                        nodesToRemove.push(node);
                    }
                    else {
                        node.data = strings[lastIndex];
                    }
                    // We have a part for each match found
                    partIndex += lastIndex;
                }
            }
            else if (node.nodeType === 8 /* Node.COMMENT_NODE */) {
                if (node.data === marker) {
                    const parent = node.parentNode;
                    // Add a new marker node to be the startNode of the Part if any of
                    // the following are true:
                    //  * We don't have a previousSibling
                    //  * The previousSibling is already the start of a previous part
                    if (node.previousSibling === null || index === lastPartIndex) {
                        index++;
                        parent.insertBefore(createMarker(), node);
                    }
                    lastPartIndex = index;
                    this.parts.push({ type: 'node', index });
                    // If we don't have a nextSibling, keep this node so we have an end.
                    // Else, we can remove it to save future costs.
                    if (node.nextSibling === null) {
                        node.data = '';
                    }
                    else {
                        nodesToRemove.push(node);
                        index--;
                    }
                    partIndex++;
                }
                else {
                    let i = -1;
                    while ((i = node.data.indexOf(marker, i + 1)) !== -1) {
                        // Comment node has a binding marker inside, make an inactive part
                        // The binding won't work, but subsequent bindings will
                        // TODO (justinfagnani): consider whether it's even worth it to
                        // make bindings in comments work
                        this.parts.push({ type: 'node', index: -1 });
                        partIndex++;
                    }
                }
            }
        }
        // Remove text binding nodes after the walk to not disturb the TreeWalker
        for (const n of nodesToRemove) {
            n.parentNode.removeChild(n);
        }
    }
}
const endsWith = (str, suffix) => {
    const index = str.length - suffix.length;
    return index >= 0 && str.slice(index) === suffix;
};
const isTemplatePartActive = (part) => part.index !== -1;
// Allows `document.createComment('')` to be renamed for a
// small manual size-savings.
const createMarker = () => document.createComment('');
/**
 * This regex extracts the attribute name preceding an attribute-position
 * expression. It does this by matching the syntax allowed for attributes
 * against the string literal directly preceding the expression, assuming that
 * the expression is in an attribute-value position.
 *
 * See attributes in the HTML spec:
 * https://www.w3.org/TR/html5/syntax.html#elements-attributes
 *
 * " \x09\x0a\x0c\x0d" are HTML space characters:
 * https://www.w3.org/TR/html5/infrastructure.html#space-characters
 *
 * "\0-\x1F\x7F-\x9F" are Unicode control characters, which includes every
 * space character except " ".
 *
 * So an attribute is:
 *  * The name: any character except a control character, space character, ('),
 *    ("), ">", "=", or "/"
 *  * Followed by zero or more space characters
 *  * Followed by "="
 *  * Followed by zero or more space characters
 *  * Followed by:
 *    * Any character except space, ('), ("), "<", ">", "=", (`), or
 *    * (") then any non-("), or
 *    * (') then any non-(')
 */
const lastAttributeNameRegex = 
// eslint-disable-next-line no-control-regex
/([ \x09\x0a\x0c\x0d])([^\0-\x1F\x7F-\x9F "'>=/]+)([ \x09\x0a\x0c\x0d]*=[ \x09\x0a\x0c\x0d]*(?:[^ \x09\x0a\x0c\x0d"'`<>=]*|"[^"]*|'[^']*))$/;

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const walkerNodeFilter = 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */;
/**
 * Removes the list of nodes from a Template safely. In addition to removing
 * nodes from the Template, the Template part indices are updated to match
 * the mutated Template DOM.
 *
 * As the template is walked the removal state is tracked and
 * part indices are adjusted as needed.
 *
 * div
 *   div#1 (remove) <-- start removing (removing node is div#1)
 *     div
 *       div#2 (remove)  <-- continue removing (removing node is still div#1)
 *         div
 * div <-- stop removing since previous sibling is the removing node (div#1,
 * removed 4 nodes)
 */
function removeNodesFromTemplate(template, nodesToRemove) {
    const { element: { content }, parts } = template;
    const walker = document.createTreeWalker(content, walkerNodeFilter, null, false);
    let partIndex = nextActiveIndexInTemplateParts(parts);
    let part = parts[partIndex];
    let nodeIndex = -1;
    let removeCount = 0;
    const nodesToRemoveInTemplate = [];
    let currentRemovingNode = null;
    while (walker.nextNode()) {
        nodeIndex++;
        const node = walker.currentNode;
        // End removal if stepped past the removing node
        if (node.previousSibling === currentRemovingNode) {
            currentRemovingNode = null;
        }
        // A node to remove was found in the template
        if (nodesToRemove.has(node)) {
            nodesToRemoveInTemplate.push(node);
            // Track node we're removing
            if (currentRemovingNode === null) {
                currentRemovingNode = node;
            }
        }
        // When removing, increment count by which to adjust subsequent part indices
        if (currentRemovingNode !== null) {
            removeCount++;
        }
        while (part !== undefined && part.index === nodeIndex) {
            // If part is in a removed node deactivate it by setting index to -1 or
            // adjust the index as needed.
            part.index = currentRemovingNode !== null ? -1 : part.index - removeCount;
            // go to the next active part.
            partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
            part = parts[partIndex];
        }
    }
    nodesToRemoveInTemplate.forEach((n) => n.parentNode.removeChild(n));
}
const countNodes = (node) => {
    let count = (node.nodeType === 11 /* Node.DOCUMENT_FRAGMENT_NODE */) ? 0 : 1;
    const walker = document.createTreeWalker(node, walkerNodeFilter, null, false);
    while (walker.nextNode()) {
        count++;
    }
    return count;
};
const nextActiveIndexInTemplateParts = (parts, startIndex = -1) => {
    for (let i = startIndex + 1; i < parts.length; i++) {
        const part = parts[i];
        if (isTemplatePartActive(part)) {
            return i;
        }
    }
    return -1;
};
/**
 * Inserts the given node into the Template, optionally before the given
 * refNode. In addition to inserting the node into the Template, the Template
 * part indices are updated to match the mutated Template DOM.
 */
function insertNodeIntoTemplate(template, node, refNode = null) {
    const { element: { content }, parts } = template;
    // If there's no refNode, then put node at end of template.
    // No part indices need to be shifted in this case.
    if (refNode === null || refNode === undefined) {
        content.appendChild(node);
        return;
    }
    const walker = document.createTreeWalker(content, walkerNodeFilter, null, false);
    let partIndex = nextActiveIndexInTemplateParts(parts);
    let insertCount = 0;
    let walkerIndex = -1;
    while (walker.nextNode()) {
        walkerIndex++;
        const walkerNode = walker.currentNode;
        if (walkerNode === refNode) {
            insertCount = countNodes(node);
            refNode.parentNode.insertBefore(node, refNode);
        }
        while (partIndex !== -1 && parts[partIndex].index === walkerIndex) {
            // If we've inserted the node, simply adjust all subsequent parts
            if (insertCount > 0) {
                while (partIndex !== -1) {
                    parts[partIndex].index += insertCount;
                    partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
                }
                return;
            }
            partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
        }
    }
}

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const directives = new WeakMap();
const isDirective = (o) => {
    return typeof o === 'function' && directives.has(o);
};

/**
 * @license
 * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * A sentinel value that signals that a value was handled by a directive and
 * should not be written to the DOM.
 */
const noChange = {};
/**
 * A sentinel value that signals a NodePart to fully clear its content.
 */
const nothing = {};

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * An instance of a `Template` that can be attached to the DOM and updated
 * with new values.
 */
class TemplateInstance {
    constructor(template, processor, options) {
        this.__parts = [];
        this.template = template;
        this.processor = processor;
        this.options = options;
    }
    update(values) {
        let i = 0;
        for (const part of this.__parts) {
            if (part !== undefined) {
                part.setValue(values[i]);
            }
            i++;
        }
        for (const part of this.__parts) {
            if (part !== undefined) {
                part.commit();
            }
        }
    }
    _clone() {
        // There are a number of steps in the lifecycle of a template instance's
        // DOM fragment:
        //  1. Clone - create the instance fragment
        //  2. Adopt - adopt into the main document
        //  3. Process - find part markers and create parts
        //  4. Upgrade - upgrade custom elements
        //  5. Update - set node, attribute, property, etc., values
        //  6. Connect - connect to the document. Optional and outside of this
        //     method.
        //
        // We have a few constraints on the ordering of these steps:
        //  * We need to upgrade before updating, so that property values will pass
        //    through any property setters.
        //  * We would like to process before upgrading so that we're sure that the
        //    cloned fragment is inert and not disturbed by self-modifying DOM.
        //  * We want custom elements to upgrade even in disconnected fragments.
        //
        // Given these constraints, with full custom elements support we would
        // prefer the order: Clone, Process, Adopt, Upgrade, Update, Connect
        //
        // But Safari does not implement CustomElementRegistry#upgrade, so we
        // can not implement that order and still have upgrade-before-update and
        // upgrade disconnected fragments. So we instead sacrifice the
        // process-before-upgrade constraint, since in Custom Elements v1 elements
        // must not modify their light DOM in the constructor. We still have issues
        // when co-existing with CEv0 elements like Polymer 1, and with polyfills
        // that don't strictly adhere to the no-modification rule because shadow
        // DOM, which may be created in the constructor, is emulated by being placed
        // in the light DOM.
        //
        // The resulting order is on native is: Clone, Adopt, Upgrade, Process,
        // Update, Connect. document.importNode() performs Clone, Adopt, and Upgrade
        // in one step.
        //
        // The Custom Elements v1 polyfill supports upgrade(), so the order when
        // polyfilled is the more ideal: Clone, Process, Adopt, Upgrade, Update,
        // Connect.
        const fragment = isCEPolyfill ?
            this.template.element.content.cloneNode(true) :
            document.importNode(this.template.element.content, true);
        const stack = [];
        const parts = this.template.parts;
        // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be null
        const walker = document.createTreeWalker(fragment, 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */, null, false);
        let partIndex = 0;
        let nodeIndex = 0;
        let part;
        let node = walker.nextNode();
        // Loop through all the nodes and parts of a template
        while (partIndex < parts.length) {
            part = parts[partIndex];
            if (!isTemplatePartActive(part)) {
                this.__parts.push(undefined);
                partIndex++;
                continue;
            }
            // Progress the tree walker until we find our next part's node.
            // Note that multiple parts may share the same node (attribute parts
            // on a single element), so this loop may not run at all.
            while (nodeIndex < part.index) {
                nodeIndex++;
                if (node.nodeName === 'TEMPLATE') {
                    stack.push(node);
                    walker.currentNode = node.content;
                }
                if ((node = walker.nextNode()) === null) {
                    // We've exhausted the content inside a nested template element.
                    // Because we still have parts (the outer for-loop), we know:
                    // - There is a template in the stack
                    // - The walker will find a nextNode outside the template
                    walker.currentNode = stack.pop();
                    node = walker.nextNode();
                }
            }
            // We've arrived at our part's node.
            if (part.type === 'node') {
                const part = this.processor.handleTextExpression(this.options);
                part.insertAfterNode(node.previousSibling);
                this.__parts.push(part);
            }
            else {
                this.__parts.push(...this.processor.handleAttributeExpressions(node, part.name, part.strings, this.options));
            }
            partIndex++;
        }
        if (isCEPolyfill) {
            document.adoptNode(fragment);
            customElements.upgrade(fragment);
        }
        return fragment;
    }
}

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const commentMarker = ` ${marker} `;
/**
 * The return type of `html`, which holds a Template and the values from
 * interpolated expressions.
 */
class TemplateResult {
    constructor(strings, values, type, processor) {
        this.strings = strings;
        this.values = values;
        this.type = type;
        this.processor = processor;
    }
    /**
     * Returns a string of HTML used to create a `<template>` element.
     */
    getHTML() {
        const l = this.strings.length - 1;
        let html = '';
        let isCommentBinding = false;
        for (let i = 0; i < l; i++) {
            const s = this.strings[i];
            // For each binding we want to determine the kind of marker to insert
            // into the template source before it's parsed by the browser's HTML
            // parser. The marker type is based on whether the expression is in an
            // attribute, text, or comment position.
            //   * For node-position bindings we insert a comment with the marker
            //     sentinel as its text content, like <!--{{lit-guid}}-->.
            //   * For attribute bindings we insert just the marker sentinel for the
            //     first binding, so that we support unquoted attribute bindings.
            //     Subsequent bindings can use a comment marker because multi-binding
            //     attributes must be quoted.
            //   * For comment bindings we insert just the marker sentinel so we don't
            //     close the comment.
            //
            // The following code scans the template source, but is *not* an HTML
            // parser. We don't need to track the tree structure of the HTML, only
            // whether a binding is inside a comment, and if not, if it appears to be
            // the first binding in an attribute.
            const commentOpen = s.lastIndexOf('<!--');
            // We're in comment position if we have a comment open with no following
            // comment close. Because <-- can appear in an attribute value there can
            // be false positives.
            isCommentBinding = (commentOpen > -1 || isCommentBinding) &&
                s.indexOf('-->', commentOpen + 1) === -1;
            // Check to see if we have an attribute-like sequence preceding the
            // expression. This can match "name=value" like structures in text,
            // comments, and attribute values, so there can be false-positives.
            const attributeMatch = lastAttributeNameRegex.exec(s);
            if (attributeMatch === null) {
                // We're only in this branch if we don't have a attribute-like
                // preceding sequence. For comments, this guards against unusual
                // attribute values like <div foo="<!--${'bar'}">. Cases like
                // <!-- foo=${'bar'}--> are handled correctly in the attribute branch
                // below.
                html += s + (isCommentBinding ? commentMarker : nodeMarker);
            }
            else {
                // For attributes we use just a marker sentinel, and also append a
                // $lit$ suffix to the name to opt-out of attribute-specific parsing
                // that IE and Edge do for style and certain SVG attributes.
                html += s.substr(0, attributeMatch.index) + attributeMatch[1] +
                    attributeMatch[2] + boundAttributeSuffix + attributeMatch[3] +
                    marker;
            }
        }
        html += this.strings[l];
        return html;
    }
    getTemplateElement() {
        const template = document.createElement('template');
        template.innerHTML = this.getHTML();
        return template;
    }
}

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const isPrimitive = (value) => {
    return (value === null ||
        !(typeof value === 'object' || typeof value === 'function'));
};
const isIterable = (value) => {
    return Array.isArray(value) ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        !!(value && value[Symbol.iterator]);
};
/**
 * Writes attribute values to the DOM for a group of AttributeParts bound to a
 * single attribute. The value is only set once even if there are multiple parts
 * for an attribute.
 */
class AttributeCommitter {
    constructor(element, name, strings) {
        this.dirty = true;
        this.element = element;
        this.name = name;
        this.strings = strings;
        this.parts = [];
        for (let i = 0; i < strings.length - 1; i++) {
            this.parts[i] = this._createPart();
        }
    }
    /**
     * Creates a single part. Override this to create a differnt type of part.
     */
    _createPart() {
        return new AttributePart(this);
    }
    _getValue() {
        const strings = this.strings;
        const l = strings.length - 1;
        let text = '';
        for (let i = 0; i < l; i++) {
            text += strings[i];
            const part = this.parts[i];
            if (part !== undefined) {
                const v = part.value;
                if (isPrimitive(v) || !isIterable(v)) {
                    text += typeof v === 'string' ? v : String(v);
                }
                else {
                    for (const t of v) {
                        text += typeof t === 'string' ? t : String(t);
                    }
                }
            }
        }
        text += strings[l];
        return text;
    }
    commit() {
        if (this.dirty) {
            this.dirty = false;
            this.element.setAttribute(this.name, this._getValue());
        }
    }
}
/**
 * A Part that controls all or part of an attribute value.
 */
class AttributePart {
    constructor(committer) {
        this.value = undefined;
        this.committer = committer;
    }
    setValue(value) {
        if (value !== noChange && (!isPrimitive(value) || value !== this.value)) {
            this.value = value;
            // If the value is a not a directive, dirty the committer so that it'll
            // call setAttribute. If the value is a directive, it'll dirty the
            // committer if it calls setValue().
            if (!isDirective(value)) {
                this.committer.dirty = true;
            }
        }
    }
    commit() {
        while (isDirective(this.value)) {
            const directive = this.value;
            this.value = noChange;
            directive(this);
        }
        if (this.value === noChange) {
            return;
        }
        this.committer.commit();
    }
}
/**
 * A Part that controls a location within a Node tree. Like a Range, NodePart
 * has start and end locations and can set and update the Nodes between those
 * locations.
 *
 * NodeParts support several value types: primitives, Nodes, TemplateResults,
 * as well as arrays and iterables of those types.
 */
class NodePart {
    constructor(options) {
        this.value = undefined;
        this.__pendingValue = undefined;
        this.options = options;
    }
    /**
     * Appends this part into a container.
     *
     * This part must be empty, as its contents are not automatically moved.
     */
    appendInto(container) {
        this.startNode = container.appendChild(createMarker());
        this.endNode = container.appendChild(createMarker());
    }
    /**
     * Inserts this part after the `ref` node (between `ref` and `ref`'s next
     * sibling). Both `ref` and its next sibling must be static, unchanging nodes
     * such as those that appear in a literal section of a template.
     *
     * This part must be empty, as its contents are not automatically moved.
     */
    insertAfterNode(ref) {
        this.startNode = ref;
        this.endNode = ref.nextSibling;
    }
    /**
     * Appends this part into a parent part.
     *
     * This part must be empty, as its contents are not automatically moved.
     */
    appendIntoPart(part) {
        part.__insert(this.startNode = createMarker());
        part.__insert(this.endNode = createMarker());
    }
    /**
     * Inserts this part after the `ref` part.
     *
     * This part must be empty, as its contents are not automatically moved.
     */
    insertAfterPart(ref) {
        ref.__insert(this.startNode = createMarker());
        this.endNode = ref.endNode;
        ref.endNode = this.startNode;
    }
    setValue(value) {
        this.__pendingValue = value;
    }
    commit() {
        if (this.startNode.parentNode === null) {
            return;
        }
        while (isDirective(this.__pendingValue)) {
            const directive = this.__pendingValue;
            this.__pendingValue = noChange;
            directive(this);
        }
        const value = this.__pendingValue;
        if (value === noChange) {
            return;
        }
        if (isPrimitive(value)) {
            if (value !== this.value) {
                this.__commitText(value);
            }
        }
        else if (value instanceof TemplateResult) {
            this.__commitTemplateResult(value);
        }
        else if (value instanceof Node) {
            this.__commitNode(value);
        }
        else if (isIterable(value)) {
            this.__commitIterable(value);
        }
        else if (value === nothing) {
            this.value = nothing;
            this.clear();
        }
        else {
            // Fallback, will render the string representation
            this.__commitText(value);
        }
    }
    __insert(node) {
        this.endNode.parentNode.insertBefore(node, this.endNode);
    }
    __commitNode(value) {
        if (this.value === value) {
            return;
        }
        this.clear();
        this.__insert(value);
        this.value = value;
    }
    __commitText(value) {
        const node = this.startNode.nextSibling;
        value = value == null ? '' : value;
        // If `value` isn't already a string, we explicitly convert it here in case
        // it can't be implicitly converted - i.e. it's a symbol.
        const valueAsString = typeof value === 'string' ? value : String(value);
        if (node === this.endNode.previousSibling &&
            node.nodeType === 3 /* Node.TEXT_NODE */) {
            // If we only have a single text node between the markers, we can just
            // set its value, rather than replacing it.
            // TODO(justinfagnani): Can we just check if this.value is primitive?
            node.data = valueAsString;
        }
        else {
            this.__commitNode(document.createTextNode(valueAsString));
        }
        this.value = value;
    }
    __commitTemplateResult(value) {
        const template = this.options.templateFactory(value);
        if (this.value instanceof TemplateInstance &&
            this.value.template === template) {
            this.value.update(value.values);
        }
        else {
            // Make sure we propagate the template processor from the TemplateResult
            // so that we use its syntax extension, etc. The template factory comes
            // from the render function options so that it can control template
            // caching and preprocessing.
            const instance = new TemplateInstance(template, value.processor, this.options);
            const fragment = instance._clone();
            instance.update(value.values);
            this.__commitNode(fragment);
            this.value = instance;
        }
    }
    __commitIterable(value) {
        // For an Iterable, we create a new InstancePart per item, then set its
        // value to the item. This is a little bit of overhead for every item in
        // an Iterable, but it lets us recurse easily and efficiently update Arrays
        // of TemplateResults that will be commonly returned from expressions like:
        // array.map((i) => html`${i}`), by reusing existing TemplateInstances.
        // If _value is an array, then the previous render was of an
        // iterable and _value will contain the NodeParts from the previous
        // render. If _value is not an array, clear this part and make a new
        // array for NodeParts.
        if (!Array.isArray(this.value)) {
            this.value = [];
            this.clear();
        }
        // Lets us keep track of how many items we stamped so we can clear leftover
        // items from a previous render
        const itemParts = this.value;
        let partIndex = 0;
        let itemPart;
        for (const item of value) {
            // Try to reuse an existing part
            itemPart = itemParts[partIndex];
            // If no existing part, create a new one
            if (itemPart === undefined) {
                itemPart = new NodePart(this.options);
                itemParts.push(itemPart);
                if (partIndex === 0) {
                    itemPart.appendIntoPart(this);
                }
                else {
                    itemPart.insertAfterPart(itemParts[partIndex - 1]);
                }
            }
            itemPart.setValue(item);
            itemPart.commit();
            partIndex++;
        }
        if (partIndex < itemParts.length) {
            // Truncate the parts array so _value reflects the current state
            itemParts.length = partIndex;
            this.clear(itemPart && itemPart.endNode);
        }
    }
    clear(startNode = this.startNode) {
        removeNodes(this.startNode.parentNode, startNode.nextSibling, this.endNode);
    }
}
/**
 * Implements a boolean attribute, roughly as defined in the HTML
 * specification.
 *
 * If the value is truthy, then the attribute is present with a value of
 * ''. If the value is falsey, the attribute is removed.
 */
class BooleanAttributePart {
    constructor(element, name, strings) {
        this.value = undefined;
        this.__pendingValue = undefined;
        if (strings.length !== 2 || strings[0] !== '' || strings[1] !== '') {
            throw new Error('Boolean attributes can only contain a single expression');
        }
        this.element = element;
        this.name = name;
        this.strings = strings;
    }
    setValue(value) {
        this.__pendingValue = value;
    }
    commit() {
        while (isDirective(this.__pendingValue)) {
            const directive = this.__pendingValue;
            this.__pendingValue = noChange;
            directive(this);
        }
        if (this.__pendingValue === noChange) {
            return;
        }
        const value = !!this.__pendingValue;
        if (this.value !== value) {
            if (value) {
                this.element.setAttribute(this.name, '');
            }
            else {
                this.element.removeAttribute(this.name);
            }
            this.value = value;
        }
        this.__pendingValue = noChange;
    }
}
/**
 * Sets attribute values for PropertyParts, so that the value is only set once
 * even if there are multiple parts for a property.
 *
 * If an expression controls the whole property value, then the value is simply
 * assigned to the property under control. If there are string literals or
 * multiple expressions, then the strings are expressions are interpolated into
 * a string first.
 */
class PropertyCommitter extends AttributeCommitter {
    constructor(element, name, strings) {
        super(element, name, strings);
        this.single =
            (strings.length === 2 && strings[0] === '' && strings[1] === '');
    }
    _createPart() {
        return new PropertyPart(this);
    }
    _getValue() {
        if (this.single) {
            return this.parts[0].value;
        }
        return super._getValue();
    }
    commit() {
        if (this.dirty) {
            this.dirty = false;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.element[this.name] = this._getValue();
        }
    }
}
class PropertyPart extends AttributePart {
}
// Detect event listener options support. If the `capture` property is read
// from the options object, then options are supported. If not, then the third
// argument to add/removeEventListener is interpreted as the boolean capture
// value so we should only pass the `capture` property.
let eventOptionsSupported = false;
// Wrap into an IIFE because MS Edge <= v41 does not support having try/catch
// blocks right into the body of a module
(() => {
    try {
        const options = {
            get capture() {
                eventOptionsSupported = true;
                return false;
            }
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.addEventListener('test', options, options);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.removeEventListener('test', options, options);
    }
    catch (_e) {
        // event options not supported
    }
})();
class EventPart {
    constructor(element, eventName, eventContext) {
        this.value = undefined;
        this.__pendingValue = undefined;
        this.element = element;
        this.eventName = eventName;
        this.eventContext = eventContext;
        this.__boundHandleEvent = (e) => this.handleEvent(e);
    }
    setValue(value) {
        this.__pendingValue = value;
    }
    commit() {
        while (isDirective(this.__pendingValue)) {
            const directive = this.__pendingValue;
            this.__pendingValue = noChange;
            directive(this);
        }
        if (this.__pendingValue === noChange) {
            return;
        }
        const newListener = this.__pendingValue;
        const oldListener = this.value;
        const shouldRemoveListener = newListener == null ||
            oldListener != null &&
                (newListener.capture !== oldListener.capture ||
                    newListener.once !== oldListener.once ||
                    newListener.passive !== oldListener.passive);
        const shouldAddListener = newListener != null && (oldListener == null || shouldRemoveListener);
        if (shouldRemoveListener) {
            this.element.removeEventListener(this.eventName, this.__boundHandleEvent, this.__options);
        }
        if (shouldAddListener) {
            this.__options = getOptions(newListener);
            this.element.addEventListener(this.eventName, this.__boundHandleEvent, this.__options);
        }
        this.value = newListener;
        this.__pendingValue = noChange;
    }
    handleEvent(event) {
        if (typeof this.value === 'function') {
            this.value.call(this.eventContext || this.element, event);
        }
        else {
            this.value.handleEvent(event);
        }
    }
}
// We copy options because of the inconsistent behavior of browsers when reading
// the third argument of add/removeEventListener. IE11 doesn't support options
// at all. Chrome 41 only reads `capture` if the argument is an object.
const getOptions = (o) => o &&
    (eventOptionsSupported ?
        { capture: o.capture, passive: o.passive, once: o.once } :
        o.capture);

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * The default TemplateFactory which caches Templates keyed on
 * result.type and result.strings.
 */
function templateFactory(result) {
    let templateCache = templateCaches.get(result.type);
    if (templateCache === undefined) {
        templateCache = {
            stringsArray: new WeakMap(),
            keyString: new Map()
        };
        templateCaches.set(result.type, templateCache);
    }
    let template = templateCache.stringsArray.get(result.strings);
    if (template !== undefined) {
        return template;
    }
    // If the TemplateStringsArray is new, generate a key from the strings
    // This key is shared between all templates with identical content
    const key = result.strings.join(marker);
    // Check if we already have a Template for this key
    template = templateCache.keyString.get(key);
    if (template === undefined) {
        // If we have not seen this key before, create a new Template
        template = new Template(result, result.getTemplateElement());
        // Cache the Template for this key
        templateCache.keyString.set(key, template);
    }
    // Cache all future queries for this TemplateStringsArray
    templateCache.stringsArray.set(result.strings, template);
    return template;
}
const templateCaches = new Map();

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const parts = new WeakMap();
/**
 * Renders a template result or other value to a container.
 *
 * To update a container with new values, reevaluate the template literal and
 * call `render` with the new result.
 *
 * @param result Any value renderable by NodePart - typically a TemplateResult
 *     created by evaluating a template tag like `html` or `svg`.
 * @param container A DOM parent to render to. The entire contents are either
 *     replaced, or efficiently updated if the same result type was previous
 *     rendered there.
 * @param options RenderOptions for the entire render tree rendered to this
 *     container. Render options must *not* change between renders to the same
 *     container, as those changes will not effect previously rendered DOM.
 */
const render = (result, container, options) => {
    let part = parts.get(container);
    if (part === undefined) {
        removeNodes(container, container.firstChild);
        parts.set(container, part = new NodePart(Object.assign({ templateFactory }, options)));
        part.appendInto(container);
    }
    part.setValue(result);
    part.commit();
};

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * Creates Parts when a template is instantiated.
 */
class DefaultTemplateProcessor {
    /**
     * Create parts for an attribute-position binding, given the event, attribute
     * name, and string literals.
     *
     * @param element The element containing the binding
     * @param name  The attribute name
     * @param strings The string literals. There are always at least two strings,
     *   event for fully-controlled bindings with a single expression.
     */
    handleAttributeExpressions(element, name, strings, options) {
        const prefix = name[0];
        if (prefix === '.') {
            const committer = new PropertyCommitter(element, name.slice(1), strings);
            return committer.parts;
        }
        if (prefix === '@') {
            return [new EventPart(element, name.slice(1), options.eventContext)];
        }
        if (prefix === '?') {
            return [new BooleanAttributePart(element, name.slice(1), strings)];
        }
        const committer = new AttributeCommitter(element, name, strings);
        return committer.parts;
    }
    /**
     * Create parts for a text-position binding.
     * @param templateFactory
     */
    handleTextExpression(options) {
        return new NodePart(options);
    }
}
const defaultTemplateProcessor = new DefaultTemplateProcessor();

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
// IMPORTANT: do not change the property name or the assignment expression.
// This line will be used in regexes to search for lit-html usage.
// TODO(justinfagnani): inject version number at build time
if (typeof window !== 'undefined') {
    (window['litHtmlVersions'] || (window['litHtmlVersions'] = [])).push('1.2.1');
}
/**
 * Interprets a template literal as an HTML template that can efficiently
 * render to and update a container.
 */
const html = (strings, ...values) => new TemplateResult(strings, values, 'html', defaultTemplateProcessor);

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
// Get a key to lookup in `templateCaches`.
const getTemplateCacheKey = (type, scopeName) => `${type}--${scopeName}`;
let compatibleShadyCSSVersion = true;
if (typeof window.ShadyCSS === 'undefined') {
    compatibleShadyCSSVersion = false;
}
else if (typeof window.ShadyCSS.prepareTemplateDom === 'undefined') {
    console.warn(`Incompatible ShadyCSS version detected. ` +
        `Please update to at least @webcomponents/webcomponentsjs@2.0.2 and ` +
        `@webcomponents/shadycss@1.3.1.`);
    compatibleShadyCSSVersion = false;
}
/**
 * Template factory which scopes template DOM using ShadyCSS.
 * @param scopeName {string}
 */
const shadyTemplateFactory = (scopeName) => (result) => {
    const cacheKey = getTemplateCacheKey(result.type, scopeName);
    let templateCache = templateCaches.get(cacheKey);
    if (templateCache === undefined) {
        templateCache = {
            stringsArray: new WeakMap(),
            keyString: new Map()
        };
        templateCaches.set(cacheKey, templateCache);
    }
    let template = templateCache.stringsArray.get(result.strings);
    if (template !== undefined) {
        return template;
    }
    const key = result.strings.join(marker);
    template = templateCache.keyString.get(key);
    if (template === undefined) {
        const element = result.getTemplateElement();
        if (compatibleShadyCSSVersion) {
            window.ShadyCSS.prepareTemplateDom(element, scopeName);
        }
        template = new Template(result, element);
        templateCache.keyString.set(key, template);
    }
    templateCache.stringsArray.set(result.strings, template);
    return template;
};
const TEMPLATE_TYPES = ['html', 'svg'];
/**
 * Removes all style elements from Templates for the given scopeName.
 */
const removeStylesFromLitTemplates = (scopeName) => {
    TEMPLATE_TYPES.forEach((type) => {
        const templates = templateCaches.get(getTemplateCacheKey(type, scopeName));
        if (templates !== undefined) {
            templates.keyString.forEach((template) => {
                const { element: { content } } = template;
                // IE 11 doesn't support the iterable param Set constructor
                const styles = new Set();
                Array.from(content.querySelectorAll('style')).forEach((s) => {
                    styles.add(s);
                });
                removeNodesFromTemplate(template, styles);
            });
        }
    });
};
const shadyRenderSet = new Set();
/**
 * For the given scope name, ensures that ShadyCSS style scoping is performed.
 * This is done just once per scope name so the fragment and template cannot
 * be modified.
 * (1) extracts styles from the rendered fragment and hands them to ShadyCSS
 * to be scoped and appended to the document
 * (2) removes style elements from all lit-html Templates for this scope name.
 *
 * Note, <style> elements can only be placed into templates for the
 * initial rendering of the scope. If <style> elements are included in templates
 * dynamically rendered to the scope (after the first scope render), they will
 * not be scoped and the <style> will be left in the template and rendered
 * output.
 */
const prepareTemplateStyles = (scopeName, renderedDOM, template) => {
    shadyRenderSet.add(scopeName);
    // If `renderedDOM` is stamped from a Template, then we need to edit that
    // Template's underlying template element. Otherwise, we create one here
    // to give to ShadyCSS, which still requires one while scoping.
    const templateElement = !!template ? template.element : document.createElement('template');
    // Move styles out of rendered DOM and store.
    const styles = renderedDOM.querySelectorAll('style');
    const { length } = styles;
    // If there are no styles, skip unnecessary work
    if (length === 0) {
        // Ensure prepareTemplateStyles is called to support adding
        // styles via `prepareAdoptedCssText` since that requires that
        // `prepareTemplateStyles` is called.
        //
        // ShadyCSS will only update styles containing @apply in the template
        // given to `prepareTemplateStyles`. If no lit Template was given,
        // ShadyCSS will not be able to update uses of @apply in any relevant
        // template. However, this is not a problem because we only create the
        // template for the purpose of supporting `prepareAdoptedCssText`,
        // which doesn't support @apply at all.
        window.ShadyCSS.prepareTemplateStyles(templateElement, scopeName);
        return;
    }
    const condensedStyle = document.createElement('style');
    // Collect styles into a single style. This helps us make sure ShadyCSS
    // manipulations will not prevent us from being able to fix up template
    // part indices.
    // NOTE: collecting styles is inefficient for browsers but ShadyCSS
    // currently does this anyway. When it does not, this should be changed.
    for (let i = 0; i < length; i++) {
        const style = styles[i];
        style.parentNode.removeChild(style);
        condensedStyle.textContent += style.textContent;
    }
    // Remove styles from nested templates in this scope.
    removeStylesFromLitTemplates(scopeName);
    // And then put the condensed style into the "root" template passed in as
    // `template`.
    const content = templateElement.content;
    if (!!template) {
        insertNodeIntoTemplate(template, condensedStyle, content.firstChild);
    }
    else {
        content.insertBefore(condensedStyle, content.firstChild);
    }
    // Note, it's important that ShadyCSS gets the template that `lit-html`
    // will actually render so that it can update the style inside when
    // needed (e.g. @apply native Shadow DOM case).
    window.ShadyCSS.prepareTemplateStyles(templateElement, scopeName);
    const style = content.querySelector('style');
    if (window.ShadyCSS.nativeShadow && style !== null) {
        // When in native Shadow DOM, ensure the style created by ShadyCSS is
        // included in initially rendered output (`renderedDOM`).
        renderedDOM.insertBefore(style.cloneNode(true), renderedDOM.firstChild);
    }
    else if (!!template) {
        // When no style is left in the template, parts will be broken as a
        // result. To fix this, we put back the style node ShadyCSS removed
        // and then tell lit to remove that node from the template.
        // There can be no style in the template in 2 cases (1) when Shady DOM
        // is in use, ShadyCSS removes all styles, (2) when native Shadow DOM
        // is in use ShadyCSS removes the style if it contains no content.
        // NOTE, ShadyCSS creates its own style so we can safely add/remove
        // `condensedStyle` here.
        content.insertBefore(condensedStyle, content.firstChild);
        const removes = new Set();
        removes.add(condensedStyle);
        removeNodesFromTemplate(template, removes);
    }
};
/**
 * Extension to the standard `render` method which supports rendering
 * to ShadowRoots when the ShadyDOM (https://github.com/webcomponents/shadydom)
 * and ShadyCSS (https://github.com/webcomponents/shadycss) polyfills are used
 * or when the webcomponentsjs
 * (https://github.com/webcomponents/webcomponentsjs) polyfill is used.
 *
 * Adds a `scopeName` option which is used to scope element DOM and stylesheets
 * when native ShadowDOM is unavailable. The `scopeName` will be added to
 * the class attribute of all rendered DOM. In addition, any style elements will
 * be automatically re-written with this `scopeName` selector and moved out
 * of the rendered DOM and into the document `<head>`.
 *
 * It is common to use this render method in conjunction with a custom element
 * which renders a shadowRoot. When this is done, typically the element's
 * `localName` should be used as the `scopeName`.
 *
 * In addition to DOM scoping, ShadyCSS also supports a basic shim for css
 * custom properties (needed only on older browsers like IE11) and a shim for
 * a deprecated feature called `@apply` that supports applying a set of css
 * custom properties to a given location.
 *
 * Usage considerations:
 *
 * * Part values in `<style>` elements are only applied the first time a given
 * `scopeName` renders. Subsequent changes to parts in style elements will have
 * no effect. Because of this, parts in style elements should only be used for
 * values that will never change, for example parts that set scope-wide theme
 * values or parts which render shared style elements.
 *
 * * Note, due to a limitation of the ShadyDOM polyfill, rendering in a
 * custom element's `constructor` is not supported. Instead rendering should
 * either done asynchronously, for example at microtask timing (for example
 * `Promise.resolve()`), or be deferred until the first time the element's
 * `connectedCallback` runs.
 *
 * Usage considerations when using shimmed custom properties or `@apply`:
 *
 * * Whenever any dynamic changes are made which affect
 * css custom properties, `ShadyCSS.styleElement(element)` must be called
 * to update the element. There are two cases when this is needed:
 * (1) the element is connected to a new parent, (2) a class is added to the
 * element that causes it to match different custom properties.
 * To address the first case when rendering a custom element, `styleElement`
 * should be called in the element's `connectedCallback`.
 *
 * * Shimmed custom properties may only be defined either for an entire
 * shadowRoot (for example, in a `:host` rule) or via a rule that directly
 * matches an element with a shadowRoot. In other words, instead of flowing from
 * parent to child as do native css custom properties, shimmed custom properties
 * flow only from shadowRoots to nested shadowRoots.
 *
 * * When using `@apply` mixing css shorthand property names with
 * non-shorthand names (for example `border` and `border-width`) is not
 * supported.
 */
const render$1 = (result, container, options) => {
    if (!options || typeof options !== 'object' || !options.scopeName) {
        throw new Error('The `scopeName` option is required.');
    }
    const scopeName = options.scopeName;
    const hasRendered = parts.has(container);
    const needsScoping = compatibleShadyCSSVersion &&
        container.nodeType === 11 /* Node.DOCUMENT_FRAGMENT_NODE */ &&
        !!container.host;
    // Handle first render to a scope specially...
    const firstScopeRender = needsScoping && !shadyRenderSet.has(scopeName);
    // On first scope render, render into a fragment; this cannot be a single
    // fragment that is reused since nested renders can occur synchronously.
    const renderContainer = firstScopeRender ? document.createDocumentFragment() : container;
    render(result, renderContainer, Object.assign({ templateFactory: shadyTemplateFactory(scopeName) }, options));
    // When performing first scope render,
    // (1) We've rendered into a fragment so that there's a chance to
    // `prepareTemplateStyles` before sub-elements hit the DOM
    // (which might cause them to render based on a common pattern of
    // rendering in a custom element's `connectedCallback`);
    // (2) Scope the template with ShadyCSS one time only for this scope.
    // (3) Render the fragment into the container and make sure the
    // container knows its `part` is the one we just rendered. This ensures
    // DOM will be re-used on subsequent renders.
    if (firstScopeRender) {
        const part = parts.get(renderContainer);
        parts.delete(renderContainer);
        // ShadyCSS might have style sheets (e.g. from `prepareAdoptedCssText`)
        // that should apply to `renderContainer` even if the rendered value is
        // not a TemplateInstance. However, it will only insert scoped styles
        // into the document if `prepareTemplateStyles` has already been called
        // for the given scope name.
        const template = part.value instanceof TemplateInstance ?
            part.value.template :
            undefined;
        prepareTemplateStyles(scopeName, renderContainer, template);
        removeNodes(container, container.firstChild);
        container.appendChild(renderContainer);
        parts.set(container, part);
    }
    // After elements have hit the DOM, update styling if this is the
    // initial render to this container.
    // This is needed whenever dynamic changes are made so it would be
    // safest to do every render; however, this would regress performance
    // so we leave it up to the user to call `ShadyCSS.styleElement`
    // for dynamic changes.
    if (!hasRendered && needsScoping) {
        window.ShadyCSS.styleElement(container.host);
    }
};

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
var _a;
/**
 * When using Closure Compiler, JSCompiler_renameProperty(property, object) is
 * replaced at compile time by the munged name for object[property]. We cannot
 * alias this function, so we have to use a small shim that has the same
 * behavior when not compiling.
 */
window.JSCompiler_renameProperty =
    (prop, _obj) => prop;
const defaultConverter = {
    toAttribute(value, type) {
        switch (type) {
            case Boolean:
                return value ? '' : null;
            case Object:
            case Array:
                // if the value is `null` or `undefined` pass this through
                // to allow removing/no change behavior.
                return value == null ? value : JSON.stringify(value);
        }
        return value;
    },
    fromAttribute(value, type) {
        switch (type) {
            case Boolean:
                return value !== null;
            case Number:
                return value === null ? null : Number(value);
            case Object:
            case Array:
                return JSON.parse(value);
        }
        return value;
    }
};
/**
 * Change function that returns true if `value` is different from `oldValue`.
 * This method is used as the default for a property's `hasChanged` function.
 */
const notEqual = (value, old) => {
    // This ensures (old==NaN, value==NaN) always returns false
    return old !== value && (old === old || value === value);
};
const defaultPropertyDeclaration = {
    attribute: true,
    type: String,
    converter: defaultConverter,
    reflect: false,
    hasChanged: notEqual
};
const STATE_HAS_UPDATED = 1;
const STATE_UPDATE_REQUESTED = 1 << 2;
const STATE_IS_REFLECTING_TO_ATTRIBUTE = 1 << 3;
const STATE_IS_REFLECTING_TO_PROPERTY = 1 << 4;
/**
 * The Closure JS Compiler doesn't currently have good support for static
 * property semantics where "this" is dynamic (e.g.
 * https://github.com/google/closure-compiler/issues/3177 and others) so we use
 * this hack to bypass any rewriting by the compiler.
 */
const finalized = 'finalized';
/**
 * Base element class which manages element properties and attributes. When
 * properties change, the `update` method is asynchronously called. This method
 * should be supplied by subclassers to render updates as desired.
 */
class UpdatingElement extends HTMLElement {
    constructor() {
        super();
        this._updateState = 0;
        this._instanceProperties = undefined;
        // Initialize to an unresolved Promise so we can make sure the element has
        // connected before first update.
        this._updatePromise = new Promise((res) => this._enableUpdatingResolver = res);
        /**
         * Map with keys for any properties that have changed since the last
         * update cycle with previous values.
         */
        this._changedProperties = new Map();
        /**
         * Map with keys of properties that should be reflected when updated.
         */
        this._reflectingProperties = undefined;
        this.initialize();
    }
    /**
     * Returns a list of attributes corresponding to the registered properties.
     * @nocollapse
     */
    static get observedAttributes() {
        // note: piggy backing on this to ensure we're finalized.
        this.finalize();
        const attributes = [];
        // Use forEach so this works even if for/of loops are compiled to for loops
        // expecting arrays
        this._classProperties.forEach((v, p) => {
            const attr = this._attributeNameForProperty(p, v);
            if (attr !== undefined) {
                this._attributeToPropertyMap.set(attr, p);
                attributes.push(attr);
            }
        });
        return attributes;
    }
    /**
     * Ensures the private `_classProperties` property metadata is created.
     * In addition to `finalize` this is also called in `createProperty` to
     * ensure the `@property` decorator can add property metadata.
     */
    /** @nocollapse */
    static _ensureClassProperties() {
        // ensure private storage for property declarations.
        if (!this.hasOwnProperty(JSCompiler_renameProperty('_classProperties', this))) {
            this._classProperties = new Map();
            // NOTE: Workaround IE11 not supporting Map constructor argument.
            const superProperties = Object.getPrototypeOf(this)._classProperties;
            if (superProperties !== undefined) {
                superProperties.forEach((v, k) => this._classProperties.set(k, v));
            }
        }
    }
    /**
     * Creates a property accessor on the element prototype if one does not exist
     * and stores a PropertyDeclaration for the property with the given options.
     * The property setter calls the property's `hasChanged` property option
     * or uses a strict identity check to determine whether or not to request
     * an update.
     *
     * This method may be overridden to customize properties; however,
     * when doing so, it's important to call `super.createProperty` to ensure
     * the property is setup correctly. This method calls
     * `getPropertyDescriptor` internally to get a descriptor to install.
     * To customize what properties do when they are get or set, override
     * `getPropertyDescriptor`. To customize the options for a property,
     * implement `createProperty` like this:
     *
     * static createProperty(name, options) {
     *   options = Object.assign(options, {myOption: true});
     *   super.createProperty(name, options);
     * }
     *
     * @nocollapse
     */
    static createProperty(name, options = defaultPropertyDeclaration) {
        // Note, since this can be called by the `@property` decorator which
        // is called before `finalize`, we ensure storage exists for property
        // metadata.
        this._ensureClassProperties();
        this._classProperties.set(name, options);
        // Do not generate an accessor if the prototype already has one, since
        // it would be lost otherwise and that would never be the user's intention;
        // Instead, we expect users to call `requestUpdate` themselves from
        // user-defined accessors. Note that if the super has an accessor we will
        // still overwrite it
        if (options.noAccessor || this.prototype.hasOwnProperty(name)) {
            return;
        }
        const key = typeof name === 'symbol' ? Symbol() : `__${name}`;
        const descriptor = this.getPropertyDescriptor(name, key, options);
        if (descriptor !== undefined) {
            Object.defineProperty(this.prototype, name, descriptor);
        }
    }
    /**
     * Returns a property descriptor to be defined on the given named property.
     * If no descriptor is returned, the property will not become an accessor.
     * For example,
     *
     *   class MyElement extends LitElement {
     *     static getPropertyDescriptor(name, key, options) {
     *       const defaultDescriptor =
     *           super.getPropertyDescriptor(name, key, options);
     *       const setter = defaultDescriptor.set;
     *       return {
     *         get: defaultDescriptor.get,
     *         set(value) {
     *           setter.call(this, value);
     *           // custom action.
     *         },
     *         configurable: true,
     *         enumerable: true
     *       }
     *     }
     *   }
     *
     * @nocollapse
     */
    static getPropertyDescriptor(name, key, _options) {
        return {
            // tslint:disable-next-line:no-any no symbol in index
            get() {
                return this[key];
            },
            set(value) {
                const oldValue = this[name];
                this[key] = value;
                this._requestUpdate(name, oldValue);
            },
            configurable: true,
            enumerable: true
        };
    }
    /**
     * Returns the property options associated with the given property.
     * These options are defined with a PropertyDeclaration via the `properties`
     * object or the `@property` decorator and are registered in
     * `createProperty(...)`.
     *
     * Note, this method should be considered "final" and not overridden. To
     * customize the options for a given property, override `createProperty`.
     *
     * @nocollapse
     * @final
     */
    static getPropertyOptions(name) {
        return this._classProperties && this._classProperties.get(name) ||
            defaultPropertyDeclaration;
    }
    /**
     * Creates property accessors for registered properties and ensures
     * any superclasses are also finalized.
     * @nocollapse
     */
    static finalize() {
        // finalize any superclasses
        const superCtor = Object.getPrototypeOf(this);
        if (!superCtor.hasOwnProperty(finalized)) {
            superCtor.finalize();
        }
        this[finalized] = true;
        this._ensureClassProperties();
        // initialize Map populated in observedAttributes
        this._attributeToPropertyMap = new Map();
        // make any properties
        // Note, only process "own" properties since this element will inherit
        // any properties defined on the superClass, and finalization ensures
        // the entire prototype chain is finalized.
        if (this.hasOwnProperty(JSCompiler_renameProperty('properties', this))) {
            const props = this.properties;
            // support symbols in properties (IE11 does not support this)
            const propKeys = [
                ...Object.getOwnPropertyNames(props),
                ...(typeof Object.getOwnPropertySymbols === 'function') ?
                    Object.getOwnPropertySymbols(props) :
                    []
            ];
            // This for/of is ok because propKeys is an array
            for (const p of propKeys) {
                // note, use of `any` is due to TypeSript lack of support for symbol in
                // index types
                // tslint:disable-next-line:no-any no symbol in index
                this.createProperty(p, props[p]);
            }
        }
    }
    /**
     * Returns the property name for the given attribute `name`.
     * @nocollapse
     */
    static _attributeNameForProperty(name, options) {
        const attribute = options.attribute;
        return attribute === false ?
            undefined :
            (typeof attribute === 'string' ?
                attribute :
                (typeof name === 'string' ? name.toLowerCase() : undefined));
    }
    /**
     * Returns true if a property should request an update.
     * Called when a property value is set and uses the `hasChanged`
     * option for the property if present or a strict identity check.
     * @nocollapse
     */
    static _valueHasChanged(value, old, hasChanged = notEqual) {
        return hasChanged(value, old);
    }
    /**
     * Returns the property value for the given attribute value.
     * Called via the `attributeChangedCallback` and uses the property's
     * `converter` or `converter.fromAttribute` property option.
     * @nocollapse
     */
    static _propertyValueFromAttribute(value, options) {
        const type = options.type;
        const converter = options.converter || defaultConverter;
        const fromAttribute = (typeof converter === 'function' ? converter : converter.fromAttribute);
        return fromAttribute ? fromAttribute(value, type) : value;
    }
    /**
     * Returns the attribute value for the given property value. If this
     * returns undefined, the property will *not* be reflected to an attribute.
     * If this returns null, the attribute will be removed, otherwise the
     * attribute will be set to the value.
     * This uses the property's `reflect` and `type.toAttribute` property options.
     * @nocollapse
     */
    static _propertyValueToAttribute(value, options) {
        if (options.reflect === undefined) {
            return;
        }
        const type = options.type;
        const converter = options.converter;
        const toAttribute = converter && converter.toAttribute ||
            defaultConverter.toAttribute;
        return toAttribute(value, type);
    }
    /**
     * Performs element initialization. By default captures any pre-set values for
     * registered properties.
     */
    initialize() {
        this._saveInstanceProperties();
        // ensures first update will be caught by an early access of
        // `updateComplete`
        this._requestUpdate();
    }
    /**
     * Fixes any properties set on the instance before upgrade time.
     * Otherwise these would shadow the accessor and break these properties.
     * The properties are stored in a Map which is played back after the
     * constructor runs. Note, on very old versions of Safari (<=9) or Chrome
     * (<=41), properties created for native platform properties like (`id` or
     * `name`) may not have default values set in the element constructor. On
     * these browsers native properties appear on instances and therefore their
     * default value will overwrite any element default (e.g. if the element sets
     * this.id = 'id' in the constructor, the 'id' will become '' since this is
     * the native platform default).
     */
    _saveInstanceProperties() {
        // Use forEach so this works even if for/of loops are compiled to for loops
        // expecting arrays
        this.constructor
            ._classProperties.forEach((_v, p) => {
            if (this.hasOwnProperty(p)) {
                const value = this[p];
                delete this[p];
                if (!this._instanceProperties) {
                    this._instanceProperties = new Map();
                }
                this._instanceProperties.set(p, value);
            }
        });
    }
    /**
     * Applies previously saved instance properties.
     */
    _applyInstanceProperties() {
        // Use forEach so this works even if for/of loops are compiled to for loops
        // expecting arrays
        // tslint:disable-next-line:no-any
        this._instanceProperties.forEach((v, p) => this[p] = v);
        this._instanceProperties = undefined;
    }
    connectedCallback() {
        // Ensure first connection completes an update. Updates cannot complete
        // before connection.
        this.enableUpdating();
    }
    enableUpdating() {
        if (this._enableUpdatingResolver !== undefined) {
            this._enableUpdatingResolver();
            this._enableUpdatingResolver = undefined;
        }
    }
    /**
     * Allows for `super.disconnectedCallback()` in extensions while
     * reserving the possibility of making non-breaking feature additions
     * when disconnecting at some point in the future.
     */
    disconnectedCallback() {
    }
    /**
     * Synchronizes property values when attributes change.
     */
    attributeChangedCallback(name, old, value) {
        if (old !== value) {
            this._attributeToProperty(name, value);
        }
    }
    _propertyToAttribute(name, value, options = defaultPropertyDeclaration) {
        const ctor = this.constructor;
        const attr = ctor._attributeNameForProperty(name, options);
        if (attr !== undefined) {
            const attrValue = ctor._propertyValueToAttribute(value, options);
            // an undefined value does not change the attribute.
            if (attrValue === undefined) {
                return;
            }
            // Track if the property is being reflected to avoid
            // setting the property again via `attributeChangedCallback`. Note:
            // 1. this takes advantage of the fact that the callback is synchronous.
            // 2. will behave incorrectly if multiple attributes are in the reaction
            // stack at time of calling. However, since we process attributes
            // in `update` this should not be possible (or an extreme corner case
            // that we'd like to discover).
            // mark state reflecting
            this._updateState = this._updateState | STATE_IS_REFLECTING_TO_ATTRIBUTE;
            if (attrValue == null) {
                this.removeAttribute(attr);
            }
            else {
                this.setAttribute(attr, attrValue);
            }
            // mark state not reflecting
            this._updateState = this._updateState & ~STATE_IS_REFLECTING_TO_ATTRIBUTE;
        }
    }
    _attributeToProperty(name, value) {
        // Use tracking info to avoid deserializing attribute value if it was
        // just set from a property setter.
        if (this._updateState & STATE_IS_REFLECTING_TO_ATTRIBUTE) {
            return;
        }
        const ctor = this.constructor;
        // Note, hint this as an `AttributeMap` so closure clearly understands
        // the type; it has issues with tracking types through statics
        // tslint:disable-next-line:no-unnecessary-type-assertion
        const propName = ctor._attributeToPropertyMap.get(name);
        if (propName !== undefined) {
            const options = ctor.getPropertyOptions(propName);
            // mark state reflecting
            this._updateState = this._updateState | STATE_IS_REFLECTING_TO_PROPERTY;
            this[propName] =
                // tslint:disable-next-line:no-any
                ctor._propertyValueFromAttribute(value, options);
            // mark state not reflecting
            this._updateState = this._updateState & ~STATE_IS_REFLECTING_TO_PROPERTY;
        }
    }
    /**
     * This private version of `requestUpdate` does not access or return the
     * `updateComplete` promise. This promise can be overridden and is therefore
     * not free to access.
     */
    _requestUpdate(name, oldValue) {
        let shouldRequestUpdate = true;
        // If we have a property key, perform property update steps.
        if (name !== undefined) {
            const ctor = this.constructor;
            const options = ctor.getPropertyOptions(name);
            if (ctor._valueHasChanged(this[name], oldValue, options.hasChanged)) {
                if (!this._changedProperties.has(name)) {
                    this._changedProperties.set(name, oldValue);
                }
                // Add to reflecting properties set.
                // Note, it's important that every change has a chance to add the
                // property to `_reflectingProperties`. This ensures setting
                // attribute + property reflects correctly.
                if (options.reflect === true &&
                    !(this._updateState & STATE_IS_REFLECTING_TO_PROPERTY)) {
                    if (this._reflectingProperties === undefined) {
                        this._reflectingProperties = new Map();
                    }
                    this._reflectingProperties.set(name, options);
                }
            }
            else {
                // Abort the request if the property should not be considered changed.
                shouldRequestUpdate = false;
            }
        }
        if (!this._hasRequestedUpdate && shouldRequestUpdate) {
            this._updatePromise = this._enqueueUpdate();
        }
    }
    /**
     * Requests an update which is processed asynchronously. This should
     * be called when an element should update based on some state not triggered
     * by setting a property. In this case, pass no arguments. It should also be
     * called when manually implementing a property setter. In this case, pass the
     * property `name` and `oldValue` to ensure that any configured property
     * options are honored. Returns the `updateComplete` Promise which is resolved
     * when the update completes.
     *
     * @param name {PropertyKey} (optional) name of requesting property
     * @param oldValue {any} (optional) old value of requesting property
     * @returns {Promise} A Promise that is resolved when the update completes.
     */
    requestUpdate(name, oldValue) {
        this._requestUpdate(name, oldValue);
        return this.updateComplete;
    }
    /**
     * Sets up the element to asynchronously update.
     */
    async _enqueueUpdate() {
        this._updateState = this._updateState | STATE_UPDATE_REQUESTED;
        try {
            // Ensure any previous update has resolved before updating.
            // This `await` also ensures that property changes are batched.
            await this._updatePromise;
        }
        catch (e) {
            // Ignore any previous errors. We only care that the previous cycle is
            // done. Any error should have been handled in the previous update.
        }
        const result = this.performUpdate();
        // If `performUpdate` returns a Promise, we await it. This is done to
        // enable coordinating updates with a scheduler. Note, the result is
        // checked to avoid delaying an additional microtask unless we need to.
        if (result != null) {
            await result;
        }
        return !this._hasRequestedUpdate;
    }
    get _hasRequestedUpdate() {
        return (this._updateState & STATE_UPDATE_REQUESTED);
    }
    get hasUpdated() {
        return (this._updateState & STATE_HAS_UPDATED);
    }
    /**
     * Performs an element update. Note, if an exception is thrown during the
     * update, `firstUpdated` and `updated` will not be called.
     *
     * You can override this method to change the timing of updates. If this
     * method is overridden, `super.performUpdate()` must be called.
     *
     * For instance, to schedule updates to occur just before the next frame:
     *
     * ```
     * protected async performUpdate(): Promise<unknown> {
     *   await new Promise((resolve) => requestAnimationFrame(() => resolve()));
     *   super.performUpdate();
     * }
     * ```
     */
    performUpdate() {
        // Mixin instance properties once, if they exist.
        if (this._instanceProperties) {
            this._applyInstanceProperties();
        }
        let shouldUpdate = false;
        const changedProperties = this._changedProperties;
        try {
            shouldUpdate = this.shouldUpdate(changedProperties);
            if (shouldUpdate) {
                this.update(changedProperties);
            }
            else {
                this._markUpdated();
            }
        }
        catch (e) {
            // Prevent `firstUpdated` and `updated` from running when there's an
            // update exception.
            shouldUpdate = false;
            // Ensure element can accept additional updates after an exception.
            this._markUpdated();
            throw e;
        }
        if (shouldUpdate) {
            if (!(this._updateState & STATE_HAS_UPDATED)) {
                this._updateState = this._updateState | STATE_HAS_UPDATED;
                this.firstUpdated(changedProperties);
            }
            this.updated(changedProperties);
        }
    }
    _markUpdated() {
        this._changedProperties = new Map();
        this._updateState = this._updateState & ~STATE_UPDATE_REQUESTED;
    }
    /**
     * Returns a Promise that resolves when the element has completed updating.
     * The Promise value is a boolean that is `true` if the element completed the
     * update without triggering another update. The Promise result is `false` if
     * a property was set inside `updated()`. If the Promise is rejected, an
     * exception was thrown during the update.
     *
     * To await additional asynchronous work, override the `_getUpdateComplete`
     * method. For example, it is sometimes useful to await a rendered element
     * before fulfilling this Promise. To do this, first await
     * `super._getUpdateComplete()`, then any subsequent state.
     *
     * @returns {Promise} The Promise returns a boolean that indicates if the
     * update resolved without triggering another update.
     */
    get updateComplete() {
        return this._getUpdateComplete();
    }
    /**
     * Override point for the `updateComplete` promise.
     *
     * It is not safe to override the `updateComplete` getter directly due to a
     * limitation in TypeScript which means it is not possible to call a
     * superclass getter (e.g. `super.updateComplete.then(...)`) when the target
     * language is ES5 (https://github.com/microsoft/TypeScript/issues/338).
     * This method should be overridden instead. For example:
     *
     *   class MyElement extends LitElement {
     *     async _getUpdateComplete() {
     *       await super._getUpdateComplete();
     *       await this._myChild.updateComplete;
     *     }
     *   }
     */
    _getUpdateComplete() {
        return this._updatePromise;
    }
    /**
     * Controls whether or not `update` should be called when the element requests
     * an update. By default, this method always returns `true`, but this can be
     * customized to control when to update.
     *
     * @param _changedProperties Map of changed properties with old values
     */
    shouldUpdate(_changedProperties) {
        return true;
    }
    /**
     * Updates the element. This method reflects property values to attributes.
     * It can be overridden to render and keep updated element DOM.
     * Setting properties inside this method will *not* trigger
     * another update.
     *
     * @param _changedProperties Map of changed properties with old values
     */
    update(_changedProperties) {
        if (this._reflectingProperties !== undefined &&
            this._reflectingProperties.size > 0) {
            // Use forEach so this works even if for/of loops are compiled to for
            // loops expecting arrays
            this._reflectingProperties.forEach((v, k) => this._propertyToAttribute(k, this[k], v));
            this._reflectingProperties = undefined;
        }
        this._markUpdated();
    }
    /**
     * Invoked whenever the element is updated. Implement to perform
     * post-updating tasks via DOM APIs, for example, focusing an element.
     *
     * Setting properties inside this method will trigger the element to update
     * again after this update cycle completes.
     *
     * @param _changedProperties Map of changed properties with old values
     */
    updated(_changedProperties) {
    }
    /**
     * Invoked when the element is first updated. Implement to perform one time
     * work on the element after update.
     *
     * Setting properties inside this method will trigger the element to update
     * again after this update cycle completes.
     *
     * @param _changedProperties Map of changed properties with old values
     */
    firstUpdated(_changedProperties) {
    }
}
_a = finalized;
/**
 * Marks class as having finished creating properties.
 */
UpdatingElement[_a] = true;

/**
@license
Copyright (c) 2019 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at
http://polymer.github.io/LICENSE.txt The complete set of authors may be found at
http://polymer.github.io/AUTHORS.txt The complete set of contributors may be
found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by Google as
part of the polymer project is also subject to an additional IP rights grant
found at http://polymer.github.io/PATENTS.txt
*/
const supportsAdoptingStyleSheets = ('adoptedStyleSheets' in Document.prototype) &&
    ('replace' in CSSStyleSheet.prototype);
const constructionToken = Symbol();
class CSSResult {
    constructor(cssText, safeToken) {
        if (safeToken !== constructionToken) {
            throw new Error('CSSResult is not constructable. Use `unsafeCSS` or `css` instead.');
        }
        this.cssText = cssText;
    }
    // Note, this is a getter so that it's lazy. In practice, this means
    // stylesheets are not created until the first element instance is made.
    get styleSheet() {
        if (this._styleSheet === undefined) {
            // Note, if `adoptedStyleSheets` is supported then we assume CSSStyleSheet
            // is constructable.
            if (supportsAdoptingStyleSheets) {
                this._styleSheet = new CSSStyleSheet();
                this._styleSheet.replaceSync(this.cssText);
            }
            else {
                this._styleSheet = null;
            }
        }
        return this._styleSheet;
    }
    toString() {
        return this.cssText;
    }
}
const textFromCSSResult = (value) => {
    if (value instanceof CSSResult) {
        return value.cssText;
    }
    else if (typeof value === 'number') {
        return value;
    }
    else {
        throw new Error(`Value passed to 'css' function must be a 'css' function result: ${value}. Use 'unsafeCSS' to pass non-literal values, but
            take care to ensure page security.`);
    }
};
/**
 * Template tag which which can be used with LitElement's `style` property to
 * set element styles. For security reasons, only literal string values may be
 * used. To incorporate non-literal values `unsafeCSS` may be used inside a
 * template string part.
 */
const css = (strings, ...values) => {
    const cssText = values.reduce((acc, v, idx) => acc + textFromCSSResult(v) + strings[idx + 1], strings[0]);
    return new CSSResult(cssText, constructionToken);
};

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
// IMPORTANT: do not change the property name or the assignment expression.
// This line will be used in regexes to search for LitElement usage.
// TODO(justinfagnani): inject version number at build time
(window['litElementVersions'] || (window['litElementVersions'] = []))
    .push('2.3.1');
/**
 * Sentinal value used to avoid calling lit-html's render function when
 * subclasses do not implement `render`
 */
const renderNotImplemented = {};
class LitElement extends UpdatingElement {
    /**
     * Return the array of styles to apply to the element.
     * Override this method to integrate into a style management system.
     *
     * @nocollapse
     */
    static getStyles() {
        return this.styles;
    }
    /** @nocollapse */
    static _getUniqueStyles() {
        // Only gather styles once per class
        if (this.hasOwnProperty(JSCompiler_renameProperty('_styles', this))) {
            return;
        }
        // Take care not to call `this.getStyles()` multiple times since this
        // generates new CSSResults each time.
        // TODO(sorvell): Since we do not cache CSSResults by input, any
        // shared styles will generate new stylesheet objects, which is wasteful.
        // This should be addressed when a browser ships constructable
        // stylesheets.
        const userStyles = this.getStyles();
        if (userStyles === undefined) {
            this._styles = [];
        }
        else if (Array.isArray(userStyles)) {
            // De-duplicate styles preserving the _last_ instance in the set.
            // This is a performance optimization to avoid duplicated styles that can
            // occur especially when composing via subclassing.
            // The last item is kept to try to preserve the cascade order with the
            // assumption that it's most important that last added styles override
            // previous styles.
            const addStyles = (styles, set) => styles.reduceRight((set, s) => 
            // Note: On IE set.add() does not return the set
            Array.isArray(s) ? addStyles(s, set) : (set.add(s), set), set);
            // Array.from does not work on Set in IE, otherwise return
            // Array.from(addStyles(userStyles, new Set<CSSResult>())).reverse()
            const set = addStyles(userStyles, new Set());
            const styles = [];
            set.forEach((v) => styles.unshift(v));
            this._styles = styles;
        }
        else {
            this._styles = [userStyles];
        }
    }
    /**
     * Performs element initialization. By default this calls `createRenderRoot`
     * to create the element `renderRoot` node and captures any pre-set values for
     * registered properties.
     */
    initialize() {
        super.initialize();
        this.constructor._getUniqueStyles();
        this.renderRoot =
            this.createRenderRoot();
        // Note, if renderRoot is not a shadowRoot, styles would/could apply to the
        // element's getRootNode(). While this could be done, we're choosing not to
        // support this now since it would require different logic around de-duping.
        if (window.ShadowRoot && this.renderRoot instanceof window.ShadowRoot) {
            this.adoptStyles();
        }
    }
    /**
     * Returns the node into which the element should render and by default
     * creates and returns an open shadowRoot. Implement to customize where the
     * element's DOM is rendered. For example, to render into the element's
     * childNodes, return `this`.
     * @returns {Element|DocumentFragment} Returns a node into which to render.
     */
    createRenderRoot() {
        return this.attachShadow({ mode: 'open' });
    }
    /**
     * Applies styling to the element shadowRoot using the `static get styles`
     * property. Styling will apply using `shadowRoot.adoptedStyleSheets` where
     * available and will fallback otherwise. When Shadow DOM is polyfilled,
     * ShadyCSS scopes styles and adds them to the document. When Shadow DOM
     * is available but `adoptedStyleSheets` is not, styles are appended to the
     * end of the `shadowRoot` to [mimic spec
     * behavior](https://wicg.github.io/construct-stylesheets/#using-constructed-stylesheets).
     */
    adoptStyles() {
        const styles = this.constructor._styles;
        if (styles.length === 0) {
            return;
        }
        // There are three separate cases here based on Shadow DOM support.
        // (1) shadowRoot polyfilled: use ShadyCSS
        // (2) shadowRoot.adoptedStyleSheets available: use it.
        // (3) shadowRoot.adoptedStyleSheets polyfilled: append styles after
        // rendering
        if (window.ShadyCSS !== undefined && !window.ShadyCSS.nativeShadow) {
            window.ShadyCSS.ScopingShim.prepareAdoptedCssText(styles.map((s) => s.cssText), this.localName);
        }
        else if (supportsAdoptingStyleSheets) {
            this.renderRoot.adoptedStyleSheets =
                styles.map((s) => s.styleSheet);
        }
        else {
            // This must be done after rendering so the actual style insertion is done
            // in `update`.
            this._needsShimAdoptedStyleSheets = true;
        }
    }
    connectedCallback() {
        super.connectedCallback();
        // Note, first update/render handles styleElement so we only call this if
        // connected after first update.
        if (this.hasUpdated && window.ShadyCSS !== undefined) {
            window.ShadyCSS.styleElement(this);
        }
    }
    /**
     * Updates the element. This method reflects property values to attributes
     * and calls `render` to render DOM via lit-html. Setting properties inside
     * this method will *not* trigger another update.
     * @param _changedProperties Map of changed properties with old values
     */
    update(changedProperties) {
        // Setting properties in `render` should not trigger an update. Since
        // updates are allowed after super.update, it's important to call `render`
        // before that.
        const templateResult = this.render();
        super.update(changedProperties);
        // If render is not implemented by the component, don't call lit-html render
        if (templateResult !== renderNotImplemented) {
            this.constructor
                .render(templateResult, this.renderRoot, { scopeName: this.localName, eventContext: this });
        }
        // When native Shadow DOM is used but adoptedStyles are not supported,
        // insert styling after rendering to ensure adoptedStyles have highest
        // priority.
        if (this._needsShimAdoptedStyleSheets) {
            this._needsShimAdoptedStyleSheets = false;
            this.constructor._styles.forEach((s) => {
                const style = document.createElement('style');
                style.textContent = s.cssText;
                this.renderRoot.appendChild(style);
            });
        }
    }
    /**
     * Invoked on each update to perform rendering tasks. This method may return
     * any value renderable by lit-html's NodePart - typically a TemplateResult.
     * Setting properties inside this method will *not* trigger the element to
     * update.
     */
    render() {
        return renderNotImplemented;
    }
}
/**
 * Ensure this class is marked as `finalized` as an optimization ensuring
 * it will not needlessly try to `finalize`.
 *
 * Note this property name is a string to prevent breaking Closure JS Compiler
 * optimizations. See updating-element.ts for more information.
 */
LitElement['finalized'] = true;
/**
 * Render method used to render the value to the element's DOM.
 * @param result The value to render.
 * @param container Node into which to render.
 * @param options Element name.
 * @nocollapse
 */
LitElement.render = render$1;

var token = /d{1,4}|M{1,4}|YY(?:YY)?|S{1,3}|Do|ZZ|Z|([HhMsDm])\1?|[aA]|"[^"]*"|'[^']*'/g;
var twoDigitsOptional = "[1-9]\\d?";
var twoDigits = "\\d\\d";
var threeDigits = "\\d{3}";
var fourDigits = "\\d{4}";
var word = "[^\\s]+";
var literal = /\[([^]*?)\]/gm;
function shorten(arr, sLen) {
    var newArr = [];
    for (var i = 0, len = arr.length; i < len; i++) {
        newArr.push(arr[i].substr(0, sLen));
    }
    return newArr;
}
var monthUpdate = function (arrName) { return function (v, i18n) {
    var lowerCaseArr = i18n[arrName].map(function (v) { return v.toLowerCase(); });
    var index = lowerCaseArr.indexOf(v.toLowerCase());
    if (index > -1) {
        return index;
    }
    return null;
}; };
function assign(origObj) {
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args[_i - 1] = arguments[_i];
    }
    for (var _a = 0, args_1 = args; _a < args_1.length; _a++) {
        var obj = args_1[_a];
        for (var key in obj) {
            // @ts-ignore ex
            origObj[key] = obj[key];
        }
    }
    return origObj;
}
var dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
];
var monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
];
var monthNamesShort = shorten(monthNames, 3);
var dayNamesShort = shorten(dayNames, 3);
var defaultI18n = {
    dayNamesShort: dayNamesShort,
    dayNames: dayNames,
    monthNamesShort: monthNamesShort,
    monthNames: monthNames,
    amPm: ["am", "pm"],
    DoFn: function (dayOfMonth) {
        return (dayOfMonth +
            ["th", "st", "nd", "rd"][dayOfMonth % 10 > 3
                ? 0
                : ((dayOfMonth - (dayOfMonth % 10) !== 10 ? 1 : 0) * dayOfMonth) % 10]);
    }
};
var globalI18n = assign({}, defaultI18n);
var setGlobalDateI18n = function (i18n) {
    return (globalI18n = assign(globalI18n, i18n));
};
var regexEscape = function (str) {
    return str.replace(/[|\\{()[^$+*?.-]/g, "\\$&");
};
var pad = function (val, len) {
    if (len === void 0) { len = 2; }
    val = String(val);
    while (val.length < len) {
        val = "0" + val;
    }
    return val;
};
var formatFlags = {
    D: function (dateObj) { return String(dateObj.getDate()); },
    DD: function (dateObj) { return pad(dateObj.getDate()); },
    Do: function (dateObj, i18n) {
        return i18n.DoFn(dateObj.getDate());
    },
    d: function (dateObj) { return String(dateObj.getDay()); },
    dd: function (dateObj) { return pad(dateObj.getDay()); },
    ddd: function (dateObj, i18n) {
        return i18n.dayNamesShort[dateObj.getDay()];
    },
    dddd: function (dateObj, i18n) {
        return i18n.dayNames[dateObj.getDay()];
    },
    M: function (dateObj) { return String(dateObj.getMonth() + 1); },
    MM: function (dateObj) { return pad(dateObj.getMonth() + 1); },
    MMM: function (dateObj, i18n) {
        return i18n.monthNamesShort[dateObj.getMonth()];
    },
    MMMM: function (dateObj, i18n) {
        return i18n.monthNames[dateObj.getMonth()];
    },
    YY: function (dateObj) {
        return pad(String(dateObj.getFullYear()), 4).substr(2);
    },
    YYYY: function (dateObj) { return pad(dateObj.getFullYear(), 4); },
    h: function (dateObj) { return String(dateObj.getHours() % 12 || 12); },
    hh: function (dateObj) { return pad(dateObj.getHours() % 12 || 12); },
    H: function (dateObj) { return String(dateObj.getHours()); },
    HH: function (dateObj) { return pad(dateObj.getHours()); },
    m: function (dateObj) { return String(dateObj.getMinutes()); },
    mm: function (dateObj) { return pad(dateObj.getMinutes()); },
    s: function (dateObj) { return String(dateObj.getSeconds()); },
    ss: function (dateObj) { return pad(dateObj.getSeconds()); },
    S: function (dateObj) {
        return String(Math.round(dateObj.getMilliseconds() / 100));
    },
    SS: function (dateObj) {
        return pad(Math.round(dateObj.getMilliseconds() / 10), 2);
    },
    SSS: function (dateObj) { return pad(dateObj.getMilliseconds(), 3); },
    a: function (dateObj, i18n) {
        return dateObj.getHours() < 12 ? i18n.amPm[0] : i18n.amPm[1];
    },
    A: function (dateObj, i18n) {
        return dateObj.getHours() < 12
            ? i18n.amPm[0].toUpperCase()
            : i18n.amPm[1].toUpperCase();
    },
    ZZ: function (dateObj) {
        var offset = dateObj.getTimezoneOffset();
        return ((offset > 0 ? "-" : "+") +
            pad(Math.floor(Math.abs(offset) / 60) * 100 + (Math.abs(offset) % 60), 4));
    },
    Z: function (dateObj) {
        var offset = dateObj.getTimezoneOffset();
        return ((offset > 0 ? "-" : "+") +
            pad(Math.floor(Math.abs(offset) / 60), 2) +
            ":" +
            pad(Math.abs(offset) % 60, 2));
    }
};
var monthParse = function (v) { return +v - 1; };
var emptyDigits = [null, twoDigitsOptional];
var emptyWord = [null, word];
var amPm = [
    "isPm",
    word,
    function (v, i18n) {
        var val = v.toLowerCase();
        if (val === i18n.amPm[0]) {
            return 0;
        }
        else if (val === i18n.amPm[1]) {
            return 1;
        }
        return null;
    }
];
var timezoneOffset = [
    "timezoneOffset",
    "[^\\s]*?[\\+\\-]\\d\\d:?\\d\\d|[^\\s]*?Z?",
    function (v) {
        var parts = (v + "").match(/([+-]|\d\d)/gi);
        if (parts) {
            var minutes = +parts[1] * 60 + parseInt(parts[2], 10);
            return parts[0] === "+" ? minutes : -minutes;
        }
        return 0;
    }
];
var parseFlags = {
    D: ["day", twoDigitsOptional],
    DD: ["day", twoDigits],
    Do: ["day", twoDigitsOptional + word, function (v) { return parseInt(v, 10); }],
    M: ["month", twoDigitsOptional, monthParse],
    MM: ["month", twoDigits, monthParse],
    YY: [
        "year",
        twoDigits,
        function (v) {
            var now = new Date();
            var cent = +("" + now.getFullYear()).substr(0, 2);
            return +("" + (+v > 68 ? cent - 1 : cent) + v);
        }
    ],
    h: ["hour", twoDigitsOptional, undefined, "isPm"],
    hh: ["hour", twoDigits, undefined, "isPm"],
    H: ["hour", twoDigitsOptional],
    HH: ["hour", twoDigits],
    m: ["minute", twoDigitsOptional],
    mm: ["minute", twoDigits],
    s: ["second", twoDigitsOptional],
    ss: ["second", twoDigits],
    YYYY: ["year", fourDigits],
    S: ["millisecond", "\\d", function (v) { return +v * 100; }],
    SS: ["millisecond", twoDigits, function (v) { return +v * 10; }],
    SSS: ["millisecond", threeDigits],
    d: emptyDigits,
    dd: emptyDigits,
    ddd: emptyWord,
    dddd: emptyWord,
    MMM: ["month", word, monthUpdate("monthNamesShort")],
    MMMM: ["month", word, monthUpdate("monthNames")],
    a: amPm,
    A: amPm,
    ZZ: timezoneOffset,
    Z: timezoneOffset
};
// Some common format strings
var globalMasks = {
    default: "ddd MMM DD YYYY HH:mm:ss",
    shortDate: "M/D/YY",
    mediumDate: "MMM D, YYYY",
    longDate: "MMMM D, YYYY",
    fullDate: "dddd, MMMM D, YYYY",
    isoDate: "YYYY-MM-DD",
    isoDateTime: "YYYY-MM-DDTHH:mm:ssZ",
    shortTime: "HH:mm",
    mediumTime: "HH:mm:ss",
    longTime: "HH:mm:ss.SSS"
};
var setGlobalDateMasks = function (masks) { return assign(globalMasks, masks); };
/***
 * Format a date
 * @method format
 * @param {Date|number} dateObj
 * @param {string} mask Format of the date, i.e. 'mm-dd-yy' or 'shortDate'
 * @returns {string} Formatted date string
 */
var format = function (dateObj, mask, i18n) {
    if (mask === void 0) { mask = globalMasks["default"]; }
    if (i18n === void 0) { i18n = {}; }
    if (typeof dateObj === "number") {
        dateObj = new Date(dateObj);
    }
    if (Object.prototype.toString.call(dateObj) !== "[object Date]" ||
        isNaN(dateObj.getTime())) {
        throw new Error("Invalid Date pass to format");
    }
    mask = globalMasks[mask] || mask;
    var literals = [];
    // Make literals inactive by replacing them with @@@
    mask = mask.replace(literal, function ($0, $1) {
        literals.push($1);
        return "@@@";
    });
    var combinedI18nSettings = assign(assign({}, globalI18n), i18n);
    // Apply formatting rules
    mask = mask.replace(token, function ($0) {
        return formatFlags[$0](dateObj, combinedI18nSettings);
    });
    // Inline literal values back into the formatted value
    return mask.replace(/@@@/g, function () { return literals.shift(); });
};
/**
 * Parse a date string into a Javascript Date object /
 * @method parse
 * @param {string} dateStr Date string
 * @param {string} format Date parse format
 * @param {i18n} I18nSettingsOptional Full or subset of I18N settings
 * @returns {Date|null} Returns Date object. Returns null what date string is invalid or doesn't match format
 */
function parse(dateStr, format, i18n) {
    if (i18n === void 0) { i18n = {}; }
    if (typeof format !== "string") {
        throw new Error("Invalid format in fecha parse");
    }
    // Check to see if the format is actually a mask
    format = globalMasks[format] || format;
    // Avoid regular expression denial of service, fail early for really long strings
    // https://www.owasp.org/index.php/Regular_expression_Denial_of_Service_-_ReDoS
    if (dateStr.length > 1000) {
        return null;
    }
    // Default to the beginning of the year.
    var today = new Date();
    var dateInfo = {
        year: today.getFullYear(),
        month: 0,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
        isPm: null,
        timezoneOffset: null
    };
    var parseInfo = [];
    var literals = [];
    // Replace all the literals with @@@. Hopefully a string that won't exist in the format
    var newFormat = format.replace(literal, function ($0, $1) {
        literals.push(regexEscape($1));
        return "@@@";
    });
    var specifiedFields = {};
    var requiredFields = {};
    // Change every token that we find into the correct regex
    newFormat = regexEscape(newFormat).replace(token, function ($0) {
        var info = parseFlags[$0];
        var field = info[0], regex = info[1], requiredField = info[3];
        // Check if the person has specified the same field twice. This will lead to confusing results.
        if (specifiedFields[field]) {
            throw new Error("Invalid format. " + field + " specified twice in format");
        }
        specifiedFields[field] = true;
        // Check if there are any required fields. For instance, 12 hour time requires AM/PM specified
        if (requiredField) {
            requiredFields[requiredField] = true;
        }
        parseInfo.push(info);
        return "(" + regex + ")";
    });
    // Check all the required fields are present
    Object.keys(requiredFields).forEach(function (field) {
        if (!specifiedFields[field]) {
            throw new Error("Invalid format. " + field + " is required in specified format");
        }
    });
    // Add back all the literals after
    newFormat = newFormat.replace(/@@@/g, function () { return literals.shift(); });
    // Check if the date string matches the format. If it doesn't return null
    var matches = dateStr.match(new RegExp(newFormat, "i"));
    if (!matches) {
        return null;
    }
    var combinedI18nSettings = assign(assign({}, globalI18n), i18n);
    // For each match, call the parser function for that date part
    for (var i = 1; i < matches.length; i++) {
        var _a = parseInfo[i - 1], field = _a[0], parser = _a[2];
        var value = parser
            ? parser(matches[i], combinedI18nSettings)
            : +matches[i];
        // If the parser can't make sense of the value, return null
        if (value == null) {
            return null;
        }
        dateInfo[field] = value;
    }
    if (dateInfo.isPm === 1 && dateInfo.hour != null && +dateInfo.hour !== 12) {
        dateInfo.hour = +dateInfo.hour + 12;
    }
    else if (dateInfo.isPm === 0 && +dateInfo.hour === 12) {
        dateInfo.hour = 0;
    }
    var dateWithoutTZ = new Date(dateInfo.year, dateInfo.month, dateInfo.day, dateInfo.hour, dateInfo.minute, dateInfo.second, dateInfo.millisecond);
    var validateFields = [
        ["month", "getMonth"],
        ["day", "getDate"],
        ["hour", "getHours"],
        ["minute", "getMinutes"],
        ["second", "getSeconds"]
    ];
    for (var i = 0, len = validateFields.length; i < len; i++) {
        // Check to make sure the date field is within the allowed range. Javascript dates allows values
        // outside the allowed range. If the values don't match the value was invalid
        if (specifiedFields[validateFields[i][0]] &&
            dateInfo[validateFields[i][0]] !== dateWithoutTZ[validateFields[i][1]]()) {
            return null;
        }
    }
    if (dateInfo.timezoneOffset == null) {
        return dateWithoutTZ;
    }
    return new Date(Date.UTC(dateInfo.year, dateInfo.month, dateInfo.day, dateInfo.hour, dateInfo.minute - dateInfo.timezoneOffset, dateInfo.second, dateInfo.millisecond));
}
var fecha = {
    format: format,
    parse: parse,
    defaultI18n: defaultI18n,
    setGlobalDateI18n: setGlobalDateI18n,
    setGlobalDateMasks: setGlobalDateMasks
};

var a=function(){try{(new Date).toLocaleDateString("i");}catch(e){return "RangeError"===e.name}return !1}()?function(e,t){return e.toLocaleDateString(t,{year:"numeric",month:"long",day:"numeric"})}:function(t){return fecha.format(t,"mediumDate")},r=function(){try{(new Date).toLocaleString("i");}catch(e){return "RangeError"===e.name}return !1}()?function(e,t){return e.toLocaleString(t,{year:"numeric",month:"long",day:"numeric",hour:"numeric",minute:"2-digit"})}:function(t){return fecha.format(t,"haDateTime")},n=function(){try{(new Date).toLocaleTimeString("i");}catch(e){return "RangeError"===e.name}return !1}()?function(e,t){return e.toLocaleTimeString(t,{hour:"numeric",minute:"2-digit"})}:function(t){return fecha.format(t,"shortTime")};var C=function(e,t,a,r){r=r||{},a=null==a?{}:a;var n=new Event(t,{bubbles:void 0===r.bubbles||r.bubbles,cancelable:Boolean(r.cancelable),composed:void 0===r.composed||r.composed});return n.detail=a,e.dispatchEvent(n),n};function Y(e,t,a){if(t.has("config")||a)return !0;if(e.config.entity){var r=t.get("hass");return !r||r.states[e.config.entity]!==e.hass.states[e.config.entity]}return !1}

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED = '__lodash_hash_undefined__';

/** Used as references for various `Number` constants. */
var INFINITY = 1 / 0;

/** `Object#toString` result references. */
var funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]',
    symbolTag = '[object Symbol]';

/** Used to match property names within property paths. */
var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,
    reIsPlainProp = /^\w*$/,
    reLeadingDot = /^\./,
    rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;

/**
 * Used to match `RegExp`
 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
 */
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

/** Used to match backslashes in property paths. */
var reEscapeChar = /\\(\\)?/g;

/** Used to detect host constructors (Safari). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof commonjsGlobal == 'object' && commonjsGlobal && commonjsGlobal.Object === Object && commonjsGlobal;

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

/**
 * Gets the value at `key` of `object`.
 *
 * @private
 * @param {Object} [object] The object to query.
 * @param {string} key The key of the property to get.
 * @returns {*} Returns the property value.
 */
function getValue(object, key) {
  return object == null ? undefined : object[key];
}

/**
 * Checks if `value` is a host object in IE < 9.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a host object, else `false`.
 */
function isHostObject(value) {
  // Many host objects are `Object` objects that can coerce to strings
  // despite having improperly defined `toString` methods.
  var result = false;
  if (value != null && typeof value.toString != 'function') {
    try {
      result = !!(value + '');
    } catch (e) {}
  }
  return result;
}

/** Used for built-in method references. */
var arrayProto = Array.prototype,
    funcProto = Function.prototype,
    objectProto = Object.prototype;

/** Used to detect overreaching core-js shims. */
var coreJsData = root['__core-js_shared__'];

/** Used to detect methods masquerading as native. */
var maskSrcKey = (function() {
  var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || '');
  return uid ? ('Symbol(src)_1.' + uid) : '';
}());

/** Used to resolve the decompiled source of functions. */
var funcToString = funcProto.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  funcToString.call(hasOwnProperty).replace(reRegExpChar, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/** Built-in value references. */
var Symbol$1 = root.Symbol,
    splice = arrayProto.splice;

/* Built-in method references that are verified to be native. */
var Map$1 = getNative(root, 'Map'),
    nativeCreate = getNative(Object, 'create');

/** Used to convert symbols to primitives and strings. */
var symbolProto = Symbol$1 ? Symbol$1.prototype : undefined,
    symbolToString = symbolProto ? symbolProto.toString : undefined;

/**
 * Creates a hash object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function Hash(entries) {
  var index = -1,
      length = entries ? entries.length : 0;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the hash.
 *
 * @private
 * @name clear
 * @memberOf Hash
 */
function hashClear() {
  this.__data__ = nativeCreate ? nativeCreate(null) : {};
}

/**
 * Removes `key` and its value from the hash.
 *
 * @private
 * @name delete
 * @memberOf Hash
 * @param {Object} hash The hash to modify.
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function hashDelete(key) {
  return this.has(key) && delete this.__data__[key];
}

/**
 * Gets the hash value for `key`.
 *
 * @private
 * @name get
 * @memberOf Hash
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function hashGet(key) {
  var data = this.__data__;
  if (nativeCreate) {
    var result = data[key];
    return result === HASH_UNDEFINED ? undefined : result;
  }
  return hasOwnProperty.call(data, key) ? data[key] : undefined;
}

/**
 * Checks if a hash value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf Hash
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function hashHas(key) {
  var data = this.__data__;
  return nativeCreate ? data[key] !== undefined : hasOwnProperty.call(data, key);
}

/**
 * Sets the hash `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf Hash
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the hash instance.
 */
function hashSet(key, value) {
  var data = this.__data__;
  data[key] = (nativeCreate && value === undefined) ? HASH_UNDEFINED : value;
  return this;
}

// Add methods to `Hash`.
Hash.prototype.clear = hashClear;
Hash.prototype['delete'] = hashDelete;
Hash.prototype.get = hashGet;
Hash.prototype.has = hashHas;
Hash.prototype.set = hashSet;

/**
 * Creates an list cache object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function ListCache(entries) {
  var index = -1,
      length = entries ? entries.length : 0;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the list cache.
 *
 * @private
 * @name clear
 * @memberOf ListCache
 */
function listCacheClear() {
  this.__data__ = [];
}

/**
 * Removes `key` and its value from the list cache.
 *
 * @private
 * @name delete
 * @memberOf ListCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function listCacheDelete(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    return false;
  }
  var lastIndex = data.length - 1;
  if (index == lastIndex) {
    data.pop();
  } else {
    splice.call(data, index, 1);
  }
  return true;
}

/**
 * Gets the list cache value for `key`.
 *
 * @private
 * @name get
 * @memberOf ListCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function listCacheGet(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  return index < 0 ? undefined : data[index][1];
}

/**
 * Checks if a list cache value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf ListCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function listCacheHas(key) {
  return assocIndexOf(this.__data__, key) > -1;
}

/**
 * Sets the list cache `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf ListCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the list cache instance.
 */
function listCacheSet(key, value) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    data.push([key, value]);
  } else {
    data[index][1] = value;
  }
  return this;
}

// Add methods to `ListCache`.
ListCache.prototype.clear = listCacheClear;
ListCache.prototype['delete'] = listCacheDelete;
ListCache.prototype.get = listCacheGet;
ListCache.prototype.has = listCacheHas;
ListCache.prototype.set = listCacheSet;

/**
 * Creates a map cache object to store key-value pairs.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function MapCache(entries) {
  var index = -1,
      length = entries ? entries.length : 0;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the map.
 *
 * @private
 * @name clear
 * @memberOf MapCache
 */
function mapCacheClear() {
  this.__data__ = {
    'hash': new Hash,
    'map': new (Map$1 || ListCache),
    'string': new Hash
  };
}

/**
 * Removes `key` and its value from the map.
 *
 * @private
 * @name delete
 * @memberOf MapCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function mapCacheDelete(key) {
  return getMapData(this, key)['delete'](key);
}

/**
 * Gets the map value for `key`.
 *
 * @private
 * @name get
 * @memberOf MapCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function mapCacheGet(key) {
  return getMapData(this, key).get(key);
}

/**
 * Checks if a map value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf MapCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function mapCacheHas(key) {
  return getMapData(this, key).has(key);
}

/**
 * Sets the map `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf MapCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the map cache instance.
 */
function mapCacheSet(key, value) {
  getMapData(this, key).set(key, value);
  return this;
}

// Add methods to `MapCache`.
MapCache.prototype.clear = mapCacheClear;
MapCache.prototype['delete'] = mapCacheDelete;
MapCache.prototype.get = mapCacheGet;
MapCache.prototype.has = mapCacheHas;
MapCache.prototype.set = mapCacheSet;

/**
 * Gets the index at which the `key` is found in `array` of key-value pairs.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {*} key The key to search for.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function assocIndexOf(array, key) {
  var length = array.length;
  while (length--) {
    if (eq(array[length][0], key)) {
      return length;
    }
  }
  return -1;
}

/**
 * The base implementation of `_.get` without support for default values.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Array|string} path The path of the property to get.
 * @returns {*} Returns the resolved value.
 */
function baseGet(object, path) {
  path = isKey(path, object) ? [path] : castPath(path);

  var index = 0,
      length = path.length;

  while (object != null && index < length) {
    object = object[toKey(path[index++])];
  }
  return (index && index == length) ? object : undefined;
}

/**
 * The base implementation of `_.isNative` without bad shim checks.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function,
 *  else `false`.
 */
function baseIsNative(value) {
  if (!isObject(value) || isMasked(value)) {
    return false;
  }
  var pattern = (isFunction(value) || isHostObject(value)) ? reIsNative : reIsHostCtor;
  return pattern.test(toSource(value));
}

/**
 * The base implementation of `_.toString` which doesn't convert nullish
 * values to empty strings.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 */
function baseToString(value) {
  // Exit early for strings to avoid a performance hit in some environments.
  if (typeof value == 'string') {
    return value;
  }
  if (isSymbol(value)) {
    return symbolToString ? symbolToString.call(value) : '';
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
}

/**
 * Casts `value` to a path array if it's not one.
 *
 * @private
 * @param {*} value The value to inspect.
 * @returns {Array} Returns the cast property path array.
 */
function castPath(value) {
  return isArray(value) ? value : stringToPath(value);
}

/**
 * Gets the data for `map`.
 *
 * @private
 * @param {Object} map The map to query.
 * @param {string} key The reference key.
 * @returns {*} Returns the map data.
 */
function getMapData(map, key) {
  var data = map.__data__;
  return isKeyable(key)
    ? data[typeof key == 'string' ? 'string' : 'hash']
    : data.map;
}

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = getValue(object, key);
  return baseIsNative(value) ? value : undefined;
}

/**
 * Checks if `value` is a property name and not a property path.
 *
 * @private
 * @param {*} value The value to check.
 * @param {Object} [object] The object to query keys on.
 * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
 */
function isKey(value, object) {
  if (isArray(value)) {
    return false;
  }
  var type = typeof value;
  if (type == 'number' || type == 'symbol' || type == 'boolean' ||
      value == null || isSymbol(value)) {
    return true;
  }
  return reIsPlainProp.test(value) || !reIsDeepProp.test(value) ||
    (object != null && value in Object(object));
}

/**
 * Checks if `value` is suitable for use as unique object key.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
 */
function isKeyable(value) {
  var type = typeof value;
  return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
    ? (value !== '__proto__')
    : (value === null);
}

/**
 * Checks if `func` has its source masked.
 *
 * @private
 * @param {Function} func The function to check.
 * @returns {boolean} Returns `true` if `func` is masked, else `false`.
 */
function isMasked(func) {
  return !!maskSrcKey && (maskSrcKey in func);
}

/**
 * Converts `string` to a property path array.
 *
 * @private
 * @param {string} string The string to convert.
 * @returns {Array} Returns the property path array.
 */
var stringToPath = memoize(function(string) {
  string = toString(string);

  var result = [];
  if (reLeadingDot.test(string)) {
    result.push('');
  }
  string.replace(rePropName, function(match, number, quote, string) {
    result.push(quote ? string.replace(reEscapeChar, '$1') : (number || match));
  });
  return result;
});

/**
 * Converts `value` to a string key if it's not a string or symbol.
 *
 * @private
 * @param {*} value The value to inspect.
 * @returns {string|symbol} Returns the key.
 */
function toKey(value) {
  if (typeof value == 'string' || isSymbol(value)) {
    return value;
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
}

/**
 * Converts `func` to its source code.
 *
 * @private
 * @param {Function} func The function to process.
 * @returns {string} Returns the source code.
 */
function toSource(func) {
  if (func != null) {
    try {
      return funcToString.call(func);
    } catch (e) {}
    try {
      return (func + '');
    } catch (e) {}
  }
  return '';
}

/**
 * Creates a function that memoizes the result of `func`. If `resolver` is
 * provided, it determines the cache key for storing the result based on the
 * arguments provided to the memoized function. By default, the first argument
 * provided to the memoized function is used as the map cache key. The `func`
 * is invoked with the `this` binding of the memoized function.
 *
 * **Note:** The cache is exposed as the `cache` property on the memoized
 * function. Its creation may be customized by replacing the `_.memoize.Cache`
 * constructor with one whose instances implement the
 * [`Map`](http://ecma-international.org/ecma-262/7.0/#sec-properties-of-the-map-prototype-object)
 * method interface of `delete`, `get`, `has`, and `set`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Function
 * @param {Function} func The function to have its output memoized.
 * @param {Function} [resolver] The function to resolve the cache key.
 * @returns {Function} Returns the new memoized function.
 * @example
 *
 * var object = { 'a': 1, 'b': 2 };
 * var other = { 'c': 3, 'd': 4 };
 *
 * var values = _.memoize(_.values);
 * values(object);
 * // => [1, 2]
 *
 * values(other);
 * // => [3, 4]
 *
 * object.a = 2;
 * values(object);
 * // => [1, 2]
 *
 * // Modify the result cache.
 * values.cache.set(object, ['a', 'b']);
 * values(object);
 * // => ['a', 'b']
 *
 * // Replace `_.memoize.Cache`.
 * _.memoize.Cache = WeakMap;
 */
function memoize(func, resolver) {
  if (typeof func != 'function' || (resolver && typeof resolver != 'function')) {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  var memoized = function() {
    var args = arguments,
        key = resolver ? resolver.apply(this, args) : args[0],
        cache = memoized.cache;

    if (cache.has(key)) {
      return cache.get(key);
    }
    var result = func.apply(this, args);
    memoized.cache = cache.set(key, result);
    return result;
  };
  memoized.cache = new (memoize.Cache || MapCache);
  return memoized;
}

// Assign cache to `_.memoize`.
memoize.Cache = MapCache;

/**
 * Performs a
 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * comparison between two values to determine if they are equivalent.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 * @example
 *
 * var object = { 'a': 1 };
 * var other = { 'a': 1 };
 *
 * _.eq(object, object);
 * // => true
 *
 * _.eq(object, other);
 * // => false
 *
 * _.eq('a', 'a');
 * // => true
 *
 * _.eq('a', Object('a'));
 * // => false
 *
 * _.eq(NaN, NaN);
 * // => true
 */
function eq(value, other) {
  return value === other || (value !== value && other !== other);
}

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(document.body.children);
 * // => false
 *
 * _.isArray('abc');
 * // => false
 *
 * _.isArray(_.noop);
 * // => false
 */
var isArray = Array.isArray;

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 8-9 which returns 'object' for typed array and other constructors.
  var tag = isObject(value) ? objectToString.call(value) : '';
  return tag == funcTag || tag == genTag;
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && objectToString.call(value) == symbolTag);
}

/**
 * Converts `value` to a string. An empty string is returned for `null`
 * and `undefined` values. The sign of `-0` is preserved.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 * @example
 *
 * _.toString(null);
 * // => ''
 *
 * _.toString(-0);
 * // => '-0'
 *
 * _.toString([1, 2, 3]);
 * // => '1,2,3'
 */
function toString(value) {
  return value == null ? '' : baseToString(value);
}

/**
 * Gets the value at `path` of `object`. If the resolved value is
 * `undefined`, the `defaultValue` is returned in its place.
 *
 * @static
 * @memberOf _
 * @since 3.7.0
 * @category Object
 * @param {Object} object The object to query.
 * @param {Array|string} path The path of the property to get.
 * @param {*} [defaultValue] The value returned for `undefined` resolved values.
 * @returns {*} Returns the resolved value.
 * @example
 *
 * var object = { 'a': [{ 'b': { 'c': 3 } }] };
 *
 * _.get(object, 'a[0].b.c');
 * // => 3
 *
 * _.get(object, ['a', '0', 'b', 'c']);
 * // => 3
 *
 * _.get(object, 'a.b.c', 'default');
 * // => 'default'
 */
function get(object, path, defaultValue) {
  var result = object == null ? undefined : baseGet(object, path);
  return result === undefined ? defaultValue : result;
}

var lodash_get = get;

var status = {
	cleaning: "Cleaning",
	auto: "Automatic Cleaning",
	spot: "Spot Cleaning",
	edge: "Edge Cleaning",
	single_room: "Single Room Cleaning",
	paused: "Paused",
	idle: "Idle",
	stop: "Stopped",
	charging: "Charging",
	"returning home": "Returning Home",
	returning: "Returning Home",
	docked: "Docked",
	unknown: "Unknown",
	offline: "Offline",
	error: "Error"
};
var source = {
	gentle: "Gentle",
	silent: "Silent",
	standard: "Standard",
	medium: "Medium",
	turbo: "Turbo",
	normal: "Normal",
	high: "High"
};
var common = {
	name: "Vacuum Card",
	description: "Vacuum card allows you to control your robot vacuum.",
	start: "Clean",
	"continue": "Continue",
	pause: "Pause",
	stop: "Stop",
	return_to_base: "Dock",
	locate: "Locate Vacuum",
	not_available: "Vacuum is not available"
};
var error = {
	missing_entity: "Specifying entity is required!"
};
var editor = {
	entity: "Entity (Required)",
	map: "Map Camera (Optional)",
	image: "Image (Optional)",
	compact_view: "Compact View",
	compact_view_aria_label_on: "Toggle compact view on",
	compact_view_aria_label_off: "Toggle compact view off",
	show_name: "Show Name",
	show_name_aria_label_on: "Toggle display name on",
	show_name_aria_label_off: "Toggle display name off",
	show_status: "Show Status",
	show_status_aria_label_on: "Toggle display status on",
	show_status_aria_label_off: "Toggle display status off",
	show_toolbar: "Show Toolbar",
	show_toolbar_aria_label_on: "Toggle display toolbar on",
	show_toolbar_aria_label_off: "Toggle display toolbar off",
	code_only_note: "Note: Setting actions and stats options are available exclusively using Code Editor."
};
var en = {
	status: status,
	source: source,
	common: common,
	error: error,
	editor: editor
};

var en$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status,
    source: source,
    common: common,
    error: error,
    editor: editor,
    'default': en
});

var status$1 = {
	cleaning: "Прибирає",
	auto: "Автоматичне прибирання",
	spot: "Прибирання зони",
	edge: "Прибирання по периметру",
	single_room: "Прибирання кімнати",
	paused: "Пауза",
	idle: "Очікування",
	stop: "Зупинений",
	charging: "Заряджається",
	"returning home": "Повертається",
	returning: "Повертається",
	docked: "На док-станції",
	unknown: "Невідомо",
	offline: "Оффлайн",
	error: "Помилка"
};
var source$1 = {
	gentle: "Делікатний",
	silent: "Тихий",
	standard: "Стандартний",
	medium: "Середній",
	turbo: "Турбо",
	normal: "Нормальний",
	high: "Високий"
};
var common$1 = {
	name: "Пилосос",
	description: "Картка \"пилосос\" дозволяє керувати роботом-пилососом.",
	start: "Старт",
	"continue": "Продовжити",
	pause: "Пауза",
	stop: "Стоп",
	return_to_base: "На базу",
	locate: "Знайти",
	not_available: "Пилосос недоступний"
};
var error$1 = {
	missing_entity: "Необхідно вказати сутність!"
};
var editor$1 = {
	entity: "Сутність (обов'язково)",
	map: "Камера для карти (Додатково)",
	image: "Зображення (Додатково)",
	compact_view: "Компактний вигляд",
	compact_view_aria_label_on: "Увімкнути компактний вигляд",
	compact_view_aria_label_off: "Вимкнути компактний вигляд",
	show_name: "Показувати ім’я?",
	show_name_aria_label_on: "Показати ім’я",
	show_name_aria_label_off: "Приховати ім’я",
	show_status: "Показувати статус?",
	show_status_aria_label_on: "Показати статус",
	show_status_aria_label_off: "Приховати статус",
	show_toolbar: "Показувати панель дій?",
	show_toolbar_aria_label_on: "Показати панель дій",
	show_toolbar_aria_label_off: "Приховати панель дій",
	code_only_note: "Увага: Опції actions та stats доступні виключно через редактор коду."
};
var uk = {
	status: status$1,
	source: source$1,
	common: common$1,
	error: error$1,
	editor: editor$1
};

var uk$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$1,
    source: source$1,
    common: common$1,
    error: error$1,
    editor: editor$1,
    'default': uk
});

var status$2 = {
	cleaning: "Aan het schoonmaken",
	paused: "Gepauzeerd",
	idle: "Inactief",
	charging: "Aan het opladen",
	"returning home": "Keert terug naar dock"
};
var common$2 = {
	name: "Stofzuiger kaart",
	description: "Stofzuiger kaart maakt het makkelijk om je robotstofzuiger te bedienen.",
	start: "Start",
	"continue": "Doorgaan",
	pause: "Pauze",
	stop: "Stop",
	return_to_base: "Terugkeren",
	locate: "Zoek stofzuiger"
};
var error$2 = {
	missing_entity: "Het specificeren van een entiteit is verplicht!"
};
var editor$2 = {
	entity: "Entiteit (Verplicht)",
	map: "Kaart Camera (Optioneel)",
	image: "Afbeelding (Optioneel)",
	compact_view: "Compacte weergave",
	compact_view_aria_label_on: "Zet compacte weergave aan",
	compact_view_aria_label_off: "Zet compacte weergave uit",
	show_name: "Naam laten zien?",
	show_name_aria_label_on: "Zet weergavenaam aan",
	show_name_aria_label_off: "Zet weergavenaam uit",
	show_toolbar: "Werkbalk laten zien?",
	show_toolbar_aria_label_on: "Zet werkbalk aan",
	show_toolbar_aria_label_off: "Zet werkbalk uit",
	code_only_note: "Notitie: Instel acties en status opties zijn alleen beschikbaar in de Code Editor"
};
var nl = {
	status: status$2,
	common: common$2,
	error: error$2,
	editor: editor$2
};

var nl$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$2,
    common: common$2,
    error: error$2,
    editor: editor$2,
    'default': nl
});

var status$3 = {
	cleaning: "Reinigen",
	paused: "Pausiert",
	idle: "Untätig",
	charging: "Aufladen",
	"returning home": "Rückkehr zu Dockingstation",
	returning: "Rückkehr zu Dockingstation",
	"segment cleaning": "Zimmerreinigung",
	docked: "Angedockt",
	error: "Fehler"
};
var source$2 = {
	silent: "Leise",
	standard: "Normal",
	medium: "Turbo",
	turbo: "Max."
};
var common$3 = {
	name: "Vacuum Card",
	description: "Vacuum card ermöglicht es Ihnen, Ihr Staubsaugerroboter zu steuern.",
	start: "Reinigen",
	"continue": "Weiter",
	pause: "Pause",
	stop: "Stop",
	return_to_base: "Dock",
	locate: "Staubsauger lokalisieren"
};
var error$3 = {
	missing_entity: "Angabe der Entität ist erforderlich!"
};
var editor$3 = {
	entity: "Entität (Erforderlich)",
	map: "Map Camera (Optional)",
	image: "Bild (Optional)",
	compact_view: "kompakte Ansicht",
	compact_view_aria_label_on: "Schalte kompakte Ansicht ein",
	compact_view_aria_label_off: "Schalte kompakte Ansicht aus",
	show_name: "Zeige Namen",
	show_name_aria_label_on: "Schalte 'Zeige Namen' ein",
	show_name_aria_label_off: "Schalte 'Zeige Namen' aus",
	show_toolbar: "Zeige Toolbar",
	show_toolbar_aria_label_on: "Schalte 'Zeige Toolbar' ein",
	show_toolbar_aria_label_off: "Schalte 'Zeige Toolbar' aus",
	code_only_note: "Hinweis: Das Festlegen von Aktionen und Statistikoptionen ist ausschließlich mit dem Code-Editor möglich."
};
var de = {
	status: status$3,
	source: source$2,
	common: common$3,
	error: error$3,
	editor: editor$3
};

var de$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$3,
    source: source$2,
    common: common$3,
    error: error$3,
    editor: editor$3,
    'default': de
});

var status$4 = {
	cleaning: "Nettoyage",
	auto: "Nettoyage Automatique",
	spot: "Nettoyage Localisé",
	edge: "Nettoyage Contours",
	single_room: "Nettoyage Pièce Unique",
	paused: "En pause",
	idle: "Inactif",
	stop: "Arrêté",
	charging: "En charge",
	"returning home": "Retour à la base",
	returning: "Retour à la base",
	docked: "A la base",
	unknown: "Inconnu",
	offline: "Déconnecté"
};
var source$3 = {
	gentle: "Doux",
	silent: "Silencieux",
	standard: "Standard",
	medium: "Moyen",
	turbo: "Turbo",
	normal: "Normal",
	high: "Intense"
};
var common$4 = {
	name: "Vacuum Carte",
	description: "Vacuum carte vous permet de contrôler votre robot aspirateur.",
	start: "Nettoyer",
	"continue": "Continuer",
	pause: "Pause",
	stop: "Stop",
	return_to_base: "Retour base",
	locate: "Localiser aspirateur",
	not_available: "L'aspirateur n'est pas disponible"
};
var error$4 = {
	missing_entity: "La spécification de l'entité est requise !"
};
var editor$4 = {
	entity: "Entité (obligatoire)",
	map: "Caméra de carte (facultatif)",
	image: "Image (facultatif)",
	compact_view: "Vue compacte",
	compact_view_aria_label_on: "Activer la vue compacte",
	compact_view_aria_label_off: "Désactiver la vue compacte",
	show_name: "Afficher le nom",
	show_name_aria_label_on: "Activer affichage du nom",
	show_name_aria_label_off: "Désactiver affichage du nom",
	show_status: "Afficher l'état",
	show_status_aria_label_on: "Activer l'affichage de l'état",
	show_status_aria_label_off: "Désactiver l'affichage de l'état",
	show_toolbar: "Afficher la barre d'outils",
	show_toolbar_aria_label_on: "Activer l'affichage de la barre d'outils",
	show_toolbar_aria_label_off: "Désactiver l'affichage de la barre d'outils",
	code_only_note: "Remarque: Les options de réglage des actions et statistiques sont disponibles exclusivement en utilisant l'éditeur de code."
};
var fr = {
	status: status$4,
	source: source$3,
	common: common$4,
	error: error$4,
	editor: editor$4
};

var fr$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$4,
    source: source$3,
    common: common$4,
    error: error$4,
    editor: editor$4,
    'default': fr
});

var status$5 = {
	cleaning: "Sprzątanie",
	paused: "Wstrzymany",
	idle: "Bezczynny",
	charging: "Ładowanie",
	"returning home": "Powrót do bazy"
};
var common$5 = {
	name: "Vacuum Card",
	description: "Vacuum card pozwala zdalnie kontrolować odkurzacz.",
	start: "Sprzątaj",
	"continue": "Kontynuuj",
	pause: "Wstrzymaj",
	stop: "Zatrzymaj",
	return_to_base: "Powrót",
	locate: "Zlokalizuj odkurzacz"
};
var error$5 = {
	missing_entity: "Ustawienie encji jest wymagane!"
};
var editor$5 = {
	entity: "Encja (wymagane)",
	map: "Kamera (opcjonalne)",
	image: "Obrazek (opcjonalne)",
	compact_view: "Widok kompaktowy",
	compact_view_aria_label_on: "Włącz widok kompaktowy",
	compact_view_aria_label_off: "Wyłącz widok kompaktowy",
	show_name: "Pokaż nazwę",
	show_name_aria_label_on: "Włącz widok nazwy",
	show_name_aria_label_off: "Wyłącz widok nazwy",
	show_toolbar: "Pasek narzędzi",
	show_toolbar_aria_label_on: "Włącz pasek narzędzi",
	show_toolbar_aria_label_off: "Wyłącz pasek narzędzi",
	code_only_note: "Uwaga: Ustawianie opcji i informacji statystyk jest dostępne tylko poprzez edytor kodu YAML."
};
var pl = {
	status: status$5,
	common: common$5,
	error: error$5,
	editor: editor$5
};

var pl$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$5,
    common: common$5,
    error: error$5,
    editor: editor$5,
    'default': pl
});

var status$6 = {
	cleaning: "In pulizia",
	paused: "In pausa",
	idle: "Inattivo",
	charging: "In carica",
	"returning home": "In rientro alla base"
};
var common$6 = {
	name: "Vacuum Card",
	description: "Vacuum card consente di controllare il tuo aspirapolvere.",
	start: "Pulisci",
	"continue": "Continua",
	pause: "Pausa",
	stop: "Stop",
	return_to_base: "Base",
	locate: "Trova aspirapolvere"
};
var error$6 = {
	missing_entity: "È necessario specificare l'entità!"
};
var editor$6 = {
	entity: "Entità (Richiesto)",
	map: "Mappa (Opzionale)",
	image: "Immagine (Opzionale)",
	compact_view: "Vista compatta",
	compact_view_aria_label_on: "Attiva vista compatta",
	compact_view_aria_label_off: "Disattiva vista compatta",
	show_name: "Mostra Nome",
	show_name_aria_label_on: "Attiva nome",
	show_name_aria_label_off: "Disattiva nome",
	show_toolbar: "Mostra barra degli strumenti",
	show_toolbar_aria_label_on: "Attiva barra degli strumenti",
	show_toolbar_aria_label_off: "Disattiva barra degli strumenti",
	code_only_note: "NB: La configurazione di azioni e statistiche sono disponibili soltanto nell'editor di codice."
};
var it = {
	status: status$6,
	common: common$6,
	error: error$6,
	editor: editor$6
};

var it$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$6,
    common: common$6,
    error: error$6,
    editor: editor$6,
    'default': it
});

var status$7 = {
	cleaning: "Убирает",
	paused: "Пауза",
	idle: "Ожидает",
	charging: "Заряжается",
	"returning home": "Возвращается",
	returning: "Возвращается",
	docked: "На базе",
	"segment cleaning": "Уборка зоны/комнаты"
};
var source$4 = {
	gentle: "Деликатный",
	silent: "Тихий",
	standard: "Стандартный",
	medium: "Средний",
	turbo: "Турбо"
};
var common$7 = {
	name: "Пылесос",
	description: "Карта \"пылесос\" позволяет управлять роботом-пылесосом.",
	start: "Запуск",
	"continue": "Продолжить",
	pause: "Пауза",
	stop: "Остановить",
	return_to_base: "На базу",
	locate: "Найти",
	not_available: "Пылесос недоступен"
};
var error$7 = {
	missing_entity: "Объект является обязательным полем!"
};
var editor$7 = {
	entity: "Объект (Обязательное)",
	map: "Камера для карты (Опциональное)",
	image: "Изображение (Опциональное)",
	compact_view: "Компактный просмотр",
	compact_view_aria_label_on: "Включить компактный просмотр",
	compact_view_aria_label_off: "Выключить компактный просмотр",
	show_name: "Показать название?",
	show_name_aria_label_on: "Показать название",
	show_name_aria_label_off: "Скрыть название",
	show_status: "Показать статус?",
	show_status_aria_label_on: "Показать статус",
	show_status_aria_label_off: "Скрыть статус",
	show_toolbar: "Показать панель действий?",
	show_toolbar_aria_label_on: "Показать панель действий",
	show_toolbar_aria_label_off: "Скрыть панель действий",
	code_only_note: "Внимание: Опции actions и stats доступны исключительно через редактор кода."
};
var ru = {
	status: status$7,
	source: source$4,
	common: common$7,
	error: error$7,
	editor: editor$7
};

var ru$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$7,
    source: source$4,
    common: common$7,
    error: error$7,
    editor: editor$7,
    'default': ru
});

var status$8 = {
	cleaning: "Limpiando",
	paused: "En pausa",
	idle: "Inactivo",
	charging: "Cargando",
	"returning home": "Volviendo a la base",
	docked: "En la base",
	"segment cleaning": "Limpiando zona"
};
var source$5 = {
	gentle: "Delicado",
	silent: "Silencioso",
	standard: "Estándar",
	medium: "Medio",
	turbo: "Turbo"
};
var common$8 = {
	name: "Vacuum Card",
	description: "Vacuum card te permite controlar tu robot aspirador.",
	start: "Comenzar",
	"continue": "Continuar",
	pause: "Pausar",
	stop: "Detener",
	return_to_base: "Volver a la base",
	locate: "Localizar",
	not_available: "Vacuum no está disponible"
};
var error$8 = {
	missing_entity: "¡Se requiere especificar una entidad!"
};
var editor$8 = {
	entity: "Entidad (Requerido)",
	map: "Map Camera (Opcional)",
	image: "Imagen (Opcional)",
	compact_view: "Vista compacta",
	compact_view_aria_label_on: "Activar vista compacta",
	compact_view_aria_label_off: "Desactivar vista compacta",
	show_name: "Nombre a mostrar",
	show_name_aria_label_on: "Mostrar nombre",
	show_name_aria_label_off: "Ocultar nombre",
	show_status: "Mostrar estado",
	show_status_aria_label_on: "Activar estado de la pantalla",
	show_status_aria_label_off: "Desactivar estado de la pantalla",
	show_toolbar: "Mostrar barra de herramientas",
	show_toolbar_aria_label_on: "Activar la barra de herramientas",
	show_toolbar_aria_label_off: "Desactivar la barra de herramientas",
	code_only_note: "Nota: La configuración de las acciones y estadísticas está únicamente disponible a través del Editor de Código."
};
var es = {
	status: status$8,
	source: source$5,
	common: common$8,
	error: error$8,
	editor: editor$8
};

var es$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$8,
    source: source$5,
    common: common$8,
    error: error$8,
    editor: editor$8,
    'default': es
});

var status$9 = {
	cleaning: "Vysává se",
	paused: "Pozastaveno",
	idle: "Nečinný",
	charging: "Nabíjí se",
	"returning home": "Vrací se domů"
};
var source$6 = {
	gentle: "Mírný",
	silent: "Tichý",
	standard: "Standardní",
	medium: "Střední",
	turbo: "Turbo"
};
var common$9 = {
	name: "Karta vysavače",
	description: "Karta vysavače vám dovolí ovládat svůj vysavač.",
	start: "Začni vysávat",
	"continue": "Pokračuj",
	pause: "Pozastav",
	stop: "Zastav",
	return_to_base: "Vrať se domů",
	locate: "Lokalizuj",
	not_available: "Vysavač není dostupný"
};
var error$9 = {
	missing_entity: "Je vyžadováno specifikování entity!"
};
var editor$9 = {
	entity: "Entita (Povinný)",
	map: "Mapa (Nepovinný)",
	image: "Fotka (Nepovinný)",
	compact_view: "Kompaktní zobrazení",
	compact_view_aria_label_on: "Zapni kompaktní zobrazení",
	compact_view_aria_label_off: "Vypni kompaktní zobrazení",
	show_name: "Zobraz název",
	show_name_aria_label_on: "Zapni zobrazení názvu",
	show_name_aria_label_off: "Vypni zobrazení názvu",
	show_status: "Zobraz status",
	show_status_aria_label_on: "Zapni zobrazení statusu",
	show_status_aria_label_off: "Vypni zobrazení statusu",
	show_toolbar: "Zobraz lištu",
	show_toolbar_aria_label_on: "Zapni zobrazení lišty",
	show_toolbar_aria_label_off: "Vypni zobrazení lišty",
	code_only_note: "Poznámka: Nastavení akcí a infa je dostupné pouze v editoru kódu."
};
var cs = {
	status: status$9,
	source: source$6,
	common: common$9,
	error: error$9,
	editor: editor$9
};

var cs$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$9,
    source: source$6,
    common: common$9,
    error: error$9,
    editor: editor$9,
    'default': cs
});

var status$a = {
	cleaning: "Tisztítás",
	paused: "Szünet",
	idle: "Tétlen",
	charging: "Töltés",
	"returning home": "Hazatérés"
};
var source$7 = {
	gentle: "Gyengéd",
	silent: "Csendes",
	standard: "Alap",
	medium: "Közepes",
	turbo: "Turbo"
};
var common$a = {
	name: "Porszívó Kártya",
	description: "Ez a kártya lehetővé teszi, hogy robot porszívódat irányítsd.",
	start: "Tisztítás",
	"continue": "Folytatás",
	pause: "Szünet",
	stop: "Megszakítás",
	return_to_base: "Hazatérés",
	locate: "Porszívó megkeresése",
	not_available: "A porszívó nem elérhető"
};
var error$a = {
	missing_entity: "Entitás megadása kötelező!"
};
var editor$a = {
	entity: "Entitás (Kötelező)",
	map: "Térkép kamera (Opcionális)",
	image: "Kép (Opcionális)",
	compact_view: "Kompakt nézet",
	compact_view_aria_label_on: "Kompakt nézet bekapcsolása",
	compact_view_aria_label_off: "Kompakt nézet kikapcsolása",
	show_name: "Név megjelenítése",
	show_name_aria_label_on: "Név megjelenítése",
	show_name_aria_label_off: "Név elrejtése",
	show_status: "Állapot megjelenítése",
	show_status_aria_label_on: "Állapot megjelenítése",
	show_status_aria_label_off: "Állapot elrejtése",
	show_toolbar: "Eszköztár megjelenítése",
	show_toolbar_aria_label_on: "Eszköztár megjelenítése",
	show_toolbar_aria_label_off: "Eszköztár elrejtése",
	code_only_note: "Megjegyzés: Parancsok és statisztikák beállítása csak a kódszerkesztőben elérhetőek."
};
var hu = {
	status: status$a,
	source: source$7,
	common: common$a,
	error: error$a,
	editor: editor$a
};

var hu$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$a,
    source: source$7,
    common: common$a,
    error: error$a,
    editor: editor$a,
    'default': hu
});

var status$b = {
	cleaning: "מנקה",
	"Segment cleaning": "ניקוי חדרים",
	auto: "ניקוי אוטומטי",
	spot: "ניקוי אזור",
	edge: "ניקוי פינה",
	single_room: "ניקוי חדר יחיד",
	paused: "מושהה",
	idle: "ממתין",
	stop: "נעצר",
	charging: "בטעינה",
	"returning home": "בחזרה הביתה",
	returning: "חוזר",
	docked: "לתחנה",
	unknown: "לא ידוע",
	offline: "מנותק",
	error: "שגיאה"
};
var source$8 = {
	gentle: "עדין",
	silent: "שקט",
	standard: "רגיל",
	medium: "בינוני",
	turbo: "טורבו",
	normal: "נורמלי",
	high: "גבוה"
};
var common$b = {
	name: "כרטיס שואב",
	description: "כרטיס שואב מאפשר לך שליטה על שואב האבק שלך.",
	start: "נקה",
	"continue": "המשך",
	pause: "השהה",
	stop: "עצור",
	return_to_base: "עגינה",
	locate: "אתר שואב",
	not_available: "השואב אינו זמין"
};
var error$b = {
	missing_entity: "יש צורך לציין ישות!"
};
var editor$b = {
	entity: "ישות (נדרש)",
	map: "מצלמת מפה (אפשרי)",
	image: "תמונה (אפשרי)",
	compact_view: "תצוגה קומפקטית",
	compact_view_aria_label_on: "החלף תצוגה קומפקטית",
	compact_view_aria_label_off: "כבה את התצוגה הקומפקטית",
	show_name: "שם תצוגה",
	show_name_aria_label_on: "הפעל את שם התצוגה למצב מופעל",
	show_name_aria_label_off: "כבה את שם התצוגה",
	show_status: "הצג סטטוס",
	show_status_aria_label_on: "הפעל את מצב התצוגה למצב פעיל",
	show_status_aria_label_off: "כבה את מצב התצוגה",
	show_toolbar: "הצג סרגל כלים",
	show_toolbar_aria_label_on: "הפעל את סרגל הכלים לתצוגה",
	show_toolbar_aria_label_off: "כבה את סרגל הכלים לתצוגה",
	code_only_note: "הערה: הגדרת פעולות ואפשרויות סטטיסטיקה זמינות אך ורק באמצעות עורך הקוד."
};
var he = {
	status: status$b,
	source: source$8,
	common: common$b,
	error: error$b,
	editor: editor$b
};

var he$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$b,
    source: source$8,
    common: common$b,
    error: error$b,
    editor: editor$b,
    'default': he
});

var status$c = {
	cleaning: "Städar",
	paused: "Pausad",
	idle: "Inaktiv",
	charging: "Laddar",
	"returning home": "Återvänder hem"
};
var source$9 = {
	gentle: "Extra försiktig",
	silent: "Eco - tyst",
	standard: "Standard",
	medium: "Medium",
	turbo: "Turbo"
};
var common$c = {
	name: "Dammsugarkort",
	description: "Dammsugarkort låter dig att kontrollera din robotdammsugare.",
	start: "Städa",
	"continue": "Fortsätt",
	pause: "Paus",
	stop: "Stopp",
	return_to_base: "Docka",
	locate: "Lokalisera dammsugare",
	not_available: "Dammsugare är inte tillgänglig"
};
var error$c = {
	missing_entity: "Specificera entitet är obligatoriskt!"
};
var editor$c = {
	entity: "Entitet (Obligatoriskt)",
	map: "Kartkamera (Valfritt)",
	image: "Bild (Valfritt)",
	compact_view: "Kompakt vy",
	compact_view_aria_label_on: "Aktivera kompakt vy",
	compact_view_aria_label_off: "Inaktivera kompakt vy",
	show_name: "Visa namn",
	show_name_aria_label_on: "Aktivera namn",
	show_name_aria_label_off: "Inaktivera namn",
	show_status: "Visa status",
	show_status_aria_label_on: "Aktivera status",
	show_status_aria_label_off: "Inaktivera status",
	show_toolbar: "Visa verktygsvält",
	show_toolbar_aria_label_on: "Aktivera verktygsfält",
	show_toolbar_aria_label_off: "Inaktivera verktygsfält",
	code_only_note: "Obs! Inställningar för händelser och statistikalternativ är enbart tillgängliga med kodredigeraren."
};
var sv = {
	status: status$c,
	source: source$9,
	common: common$c,
	error: error$c,
	editor: editor$c
};

var sv$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$c,
    source: source$9,
    common: common$c,
    error: error$c,
    editor: editor$c,
    'default': sv
});

var status$d = {
	cleaning: "Rengjøring",
	paused: "Pauset",
	idle: "Tomgang",
	charging: "Lader",
	"returning home": "Returnerer hjem"
};
var source$a = {
	gentle: "Skånsom",
	silent: "Stille",
	standard: "Standard",
	medium: "Medium",
	turbo: "Turbo"
};
var common$d = {
	name: "Støvsuger kort",
	description: "Støvsugerkortet lar deg kontrollere robotstøvsugeren din",
	start: "Rengjør",
	"continue": "fortsett",
	pause: "Pause",
	stop: "Stop",
	return_to_base: "Dock",
	locate: "Lokaliser støvsuger",
	not_available: "Støvsugeren er ikke tilgjengelig"
};
var error$d = {
	missing_entity: "Spesifiserende enhet kreves!"
};
var editor$d = {
	entity: "Enhet (påkrevd)",
	map: "Kartkamera (valgfritt)",
	image: "Bilde (Valgfritt)",
	compact_view: "Kompakt visning",
	compact_view_aria_label_on: "Slå på kompakt visning",
	compact_view_aria_label_off: "Slå av kompakt visningf",
	show_name: "Vis navn",
	show_name_aria_label_on: "Slå visningsnavnet på",
	show_name_aria_label_off: "Slå visningsnavnet av",
	show_status: "Vis Status",
	show_status_aria_label_on: "Slå skjermstatus på",
	show_status_aria_label_off: "Slå skjermstatus av",
	show_toolbar: "Vis verktøylinjen",
	show_toolbar_aria_label_on: "Slå skjermverktøylinjen på",
	show_toolbar_aria_label_off: "Slå skjermverktøylinjen av",
	code_only_note: "Merk: Innstillingshandlinger og statistikkalternativer er eksklusivt tilgjengelige ved hjelp av Code Editor."
};
var nb = {
	status: status$d,
	source: source$a,
	common: common$d,
	error: error$d,
	editor: editor$d
};

var nb$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$d,
    source: source$a,
    common: common$d,
    error: error$d,
    editor: editor$d,
    'default': nb
});

var status$e = {
	cleaning: "Rengjer",
	paused: "Pausa",
	idle: "Tomgang",
	charging: "Ladar",
	"returning home": "Returnerer heim"
};
var source$b = {
	gentle: "Skånsam",
	silent: "Stille",
	standard: "Standard",
	medium: "Medium",
	turbo: "Turbo"
};
var common$e = {
	name: "Støvsugarkort",
	description: "Støvsugarkortet let deg kontrollere robotstøvsugaren din",
	start: "Reingjer",
	"continue": "Fortsett",
	pause: "Sett på pause",
	stop: "Stopp",
	return_to_base: "Dokk",
	locate: "Lokaliser støvsugar",
	not_available: "Støvsugaren er ikkje tilgjengeleg"
};
var error$e = {
	missing_entity: "Spesifiserande oppføring kravd!"
};
var editor$e = {
	entity: "Oppføring (påkravd)",
	map: "Kartkamera (valfritt)",
	image: "Bilde (valfritt)",
	compact_view: "Kompakt vising",
	compact_view_aria_label_on: "Slå på kompakt vising",
	compact_view_aria_label_off: "Slå av kompakt vising",
	show_name: "Vis namn",
	show_name_aria_label_on: "Slå visingsnanet på",
	show_name_aria_label_off: "Slå visingsnamnet av",
	show_status: "Vis status",
	show_status_aria_label_on: "Slå skjermstatus på",
	show_status_aria_label_off: "Slå skjermstatus av",
	show_toolbar: "Vis verktøylinja",
	show_toolbar_aria_label_on: "Slå skjermverktøylinja på",
	show_toolbar_aria_label_off: "Slå skjermverktøylinja av",
	code_only_note: "Merk: Innstillingshandlingar og statistikkalternativ er berre tilgjengeleg ved hjelp av Code Editor."
};
var nn = {
	status: status$e,
	source: source$b,
	common: common$e,
	error: error$e,
	editor: editor$e
};

var nn$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$e,
    source: source$b,
    common: common$e,
    error: error$e,
    editor: editor$e,
    'default': nn
});

var status$f = {
	cleaning: "Støvsuger",
	paused: "Pauset",
	idle: "Inaktiv",
	charging: "Lader",
	"returning home": "Returnerer til dock"
};
var source$c = {
	gentle: "Mild",
	silent: "Stille",
	standard: "Standard",
	medium: "Medium",
	turbo: "Turbo"
};
var common$f = {
	name: "Vacuum Card",
	description: "Vacuum card lader dig kontrollere din robotstøvsuger.",
	start: "Start",
	"continue": "Fortsæt",
	pause: "Pause",
	stop: "Stop",
	return_to_base: "Gå til dock",
	locate: "Find støvsuger",
	not_available: "Støvsuger er ikke tilgængelig"
};
var error$f = {
	missing_entity: "En enhed skal specificeres!"
};
var editor$f = {
	entity: "Enhed (Påkrævet)",
	map: "Map Camera (Valgfrit)",
	image: "Billede (Valgfrit)",
	compact_view: "Kompakt visning",
	compact_view_aria_label_on: "Slå kompakt visning til",
	compact_view_aria_label_off: "Slå kompakt visning fra",
	show_name: "Vis navn",
	show_name_aria_label_on: "Slå visning af navn til",
	show_name_aria_label_off: "Slå visning af navn fra",
	show_status: "Vis Status",
	show_status_aria_label_on: "Slå visning af status til",
	show_status_aria_label_off: "Slå visning af status fra",
	show_toolbar: "Vis værktøjslinje",
	show_toolbar_aria_label_on: "Slå visning af værktøjslinje til",
	show_toolbar_aria_label_off: "Slå visning af værktøjslinje fra",
	code_only_note: "Bemærk: Indstilling af actions og statistik er udelukkende muligt via Code Editor."
};
var da = {
	status: status$f,
	source: source$c,
	common: common$f,
	error: error$f,
	editor: editor$f
};

var da$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$f,
    source: source$c,
    common: common$f,
    error: error$f,
    editor: editor$f,
    'default': da
});

var status$g = {
	cleaning: "청소중",
	paused: "일시정지",
	idle: "대기중",
	charging: "충전중",
	"returning home": "복귀중"
};
var source$d = {
	gentle: "물걸레",
	silent: "저소음",
	standard: "밸런스",
	medium: "터보",
	turbo: "최강"
};
var common$g = {
	name: "청소기 카드",
	description: "청소기 카드는 로봇 청소기를 제어합니다.",
	start: "청소 시작",
	"continue": "청소 재개",
	pause: "일시정지",
	stop: "정지",
	return_to_base: "복귀",
	locate: "청소기 위치",
	not_available: "청소기 사용 불가"
};
var error$g = {
	missing_entity: "구성요소를 선택해주세요."
};
var editor$g = {
	entity: "구성요소 (필수 요소)",
	map: "지도 (선택 사항)",
	image: "이미지 (선택 사항)",
	compact_view: "간단히 보기",
	compact_view_aria_label_on: "간단히 보기 켜기",
	compact_view_aria_label_off: "간단히 보기 끄기",
	show_name: "이름 표시",
	show_name_aria_label_on: "이름 표시 켜기",
	show_name_aria_label_off: "이름 표시 끄기",
	show_status: "상태 표시",
	show_status_aria_label_on: "상태 표시 켜기",
	show_status_aria_label_off: "상태 표시 끄기",
	show_toolbar: "툴바 표시",
	show_toolbar_aria_label_on: "툴바 표시 켜기",
	show_toolbar_aria_label_off: "툴바 표시 끄기",
	code_only_note: "동작과 상태 설정은 코드 에디터에서 수정할 수 있습니다."
};
var ko = {
	status: status$g,
	source: source$d,
	common: common$g,
	error: error$g,
	editor: editor$g
};

var ko$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$g,
    source: source$d,
    common: common$g,
    error: error$g,
    editor: editor$g,
    'default': ko
});

var status$h = {
	Cleaning: "Siivoaa",
	Paused: "Pysäytetty",
	Idle: "Toimeton",
	Charging: "Latauksessa",
	"Returning home": "Palaa kotiin"
};
var source$e = {
	Gentle: "Hellävarainen",
	Silent: "Hiljainen",
	Standard: "Normaali",
	Medium: "Keskitaso",
	Turbo: "Turbo"
};
var common$h = {
	name: "Pölynimurikortti",
	description: "Pölynimurikortti sallii robotti imurin ohjauksen.",
	start: "Siivoa",
	"continue": "Jatka",
	pause: "Tauko",
	stop: "Pysähdy",
	return_to_base: "Latausasemaan",
	locate: "Paikanna imuri",
	not_available: "Imuri ei saatavilla"
};
var error$h = {
	missing_entity: "Entiteetti puuttuu!"
};
var editor$h = {
	entity: "Entiteetti (Vaaditaan)",
	map: "Kartan kamera (Valinnainen)",
	image: "Kuva (Valinnainen)",
	compact_view: "Kompakti näkymä",
	compact_view_aria_label_on: "Kompakti näkymä päälle",
	compact_view_aria_label_off: "Kompakti näkymä pois",
	show_name: "Näytä Nimi",
	show_name_aria_label_on: "Näyttönimi päälle",
	show_name_aria_label_off: "Näyttönimi pois",
	show_status: "Näytä Tila",
	show_status_aria_label_on: "Tilanäyttö päälle",
	show_status_aria_label_off: "Tilanäyttö pois",
	show_toolbar: "Näytä työkalurivi",
	show_toolbar_aria_label_on: "Työkalurivi päälle",
	show_toolbar_aria_label_off: "Työkalurivi pois",
	code_only_note: "Huom: Toimintojen ja tilastojen optiot ovat saatavilla ainoastaan koodieditorissa"
};
var fi = {
	status: status$h,
	source: source$e,
	common: common$h,
	error: error$h,
	editor: editor$h
};

var fi$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$h,
    source: source$e,
    common: common$h,
    error: error$h,
    editor: editor$h,
    'default': fi
});

var status$i = {
	cleaning: "Netejant",
	paused: "En pausa",
	idle: "Inactiu",
	charging: "Carregant",
	"returning home": "Tornant a la base",
	docked: "A la base"
};
var source$f = {
	gentle: "Delicat",
	silent: "Silenciós",
	standard: "Estàndard",
	medium: "Mitjà",
	turbo: "Turbo"
};
var common$i = {
	name: "Vacuum Card",
	description: "Vacuum card us permet controlar el robot aspirador.",
	start: "Neteja",
	"continue": "Continua",
	pause: "Pausa",
	stop: "Atura",
	return_to_base: "Torna a la base",
	locate: "Localitza",
	not_available: "No disponible"
};
var error$i = {
	missing_entity: "Cal especificar una entitat."
};
var editor$i = {
	entity: "Entitat (Requerit)",
	map: "Càmera de mapa (Opcional)",
	image: "Imatge (Opcional)",
	compact_view: "Visualització compacta",
	compact_view_aria_label_on: "Activar visualització compacta",
	compact_view_aria_label_off: "Desactivar visualització compacta",
	show_name: "Mostrar nom",
	show_name_aria_label_on: "Mostra nom",
	show_name_aria_label_off: "Amaga nom",
	show_status: "Mostrar estat",
	show_status_aria_label_on: "Mostra estat",
	show_status_aria_label_off: "Amaga estat",
	show_toolbar: "Mostrar barra d'eines",
	show_toolbar_aria_label_on: "Mostra barra d'eines",
	show_toolbar_aria_label_off: "Amaga barra d'eines",
	code_only_note: "Nota: Configuració de les accions i estadístiques només disponible des de l'Editor de Codi."
};
var ca = {
	status: status$i,
	source: source$f,
	common: common$i,
	error: error$i,
	editor: editor$i
};

var ca$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$i,
    source: source$f,
    common: common$i,
    error: error$i,
    editor: editor$i,
    'default': ca
});

var status$j = {
	Cleaning: "清掃中",
	Paused: "暫停中",
	Idle: "閒置中",
	Charging: "充電中",
	"Returning home": "正在返回充電座",
	docked: "返回充電座",
	"segment cleaning": "區域清掃"
};
var source$g = {
	Gentle: "拖地",
	Silent: "安靜",
	Standard: "標準",
	Medium: "強力",
	Turbo: "MAX"
};
var common$j = {
	name: "Vacuum Card",
	description: "Vacuum Card 可以讓您控制掃地機器人",
	start: "開始清掃",
	"continue": "繼續清掃",
	pause: "暫停清掃",
	stop: "停止清掃",
	return_to_base: "返回充電座",
	locate: "定位掃地機器人",
	not_available: "掃地機器人並不支援"
};
var error$j = {
	missing_entity: "必須指定一個實體!"
};
var editor$j = {
	entity: "實體 (必填)",
	map: "地圖 (選填)",
	image: "圖片 (選填)",
	compact_view: "精簡檢視",
	compact_view_aria_label_on: "開啟精簡檢視",
	compact_view_aria_label_off: "關閉精簡檢視",
	show_name: "顯示名字",
	show_name_aria_label_on: "開啟名字顯示",
	show_name_aria_label_off: "關閉名字顯示",
	show_status: "顯示狀態",
	show_status_aria_label_on: "開啟狀態顯示",
	show_status_aria_label_off: "關閉狀態顯示",
	show_toolbar: "顯示工具欄",
	show_toolbar_aria_label_on: "開啟工具欄顯示",
	show_toolbar_aria_label_off: "關閉工具欄顯示",
	code_only_note: "提醒: 如果要使用 actions 和 stats 選項，請使用編碼編輯器編輯"
};
var tw = {
	status: status$j,
	source: source$g,
	common: common$j,
	error: error$j,
	editor: editor$j
};

var tw$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$j,
    source: source$g,
    common: common$j,
    error: error$j,
    editor: editor$j,
    'default': tw
});

var status$k = {
	cleaning: "Đang dọn dẹp",
	paused: "Dừng",
	idle: "Nghỉ",
	charging: "Đang sạc",
	"returning home": "Đang về Dock",
	docked: "Đang ở Dock"
};
var source$h = {
	gentle: "Nhẹ",
	silent: "Yên tĩnh",
	standard: "Tiêu chuẩn",
	medium: "Vừa phải",
	turbo: "Tối đa"
};
var common$k = {
	name: "Robot hút bụi Card",
	description: "Robot hút bụi Card cho phép bạn điều khiển robot hút bụi một cách dễ dàng",
	start: "Dọn dẹp",
	"continue": "Tiếp tục",
	pause: "Tạm dừng",
	stop: "Dừng",
	return_to_base: "Về Dock",
	locate: "Định vị",
	not_available: "Thiết bị không khả dụng"
};
var error$k = {
	missing_entity: "Khai báo thiếu Entity"
};
var editor$k = {
	entity: "Entity (Yêu cầu)",
	map: "Hiển thị sơ đồ   (Tuỳ chọn)",
	image: "Image (Tuỳ chọn)",
	compact_view: "Thu gọn",
	compact_view_aria_label_on: "Xem thu gọn",
	compact_view_aria_label_off: "Xem mở rộng",
	show_name: "Hiện tên",
	show_name_aria_label_on: "Hiện tên",
	show_name_aria_label_off: "Ẩn tên",
	show_status: "Hiện trạng thái",
	show_status_aria_label_on: "Hiện trạng thái",
	show_status_aria_label_off: "Ẩn trạng thái",
	show_toolbar: "Hiện thanh công cụ",
	show_toolbar_aria_label_on: "Hiện thanh công cụ",
	show_toolbar_aria_label_off: "Ẩn thanh công cụ",
	code_only_note: "Lưu ý: Cài đặt thao tác và tùy chọn thống kê chỉ có sẵn bằng trình chỉnh sửa mã"
};
var vi = {
	status: status$k,
	source: source$h,
	common: common$k,
	error: error$k,
	editor: editor$k
};

var vi$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$k,
    source: source$h,
    common: common$k,
    error: error$k,
    editor: editor$k,
    'default': vi
});

var status$l = {
	cleaning: "Valo",
	paused: "Pristabdytas",
	idle: "Neturi darbo",
	charging: "Kraunasi",
	"returning home": "Grįžtą namo",
	docked: "Doke"
};
var source$i = {
	gentle: "Švelnus",
	silent: "Tylus",
	standard: "Standartinis",
	medium: "Vidutinis",
	turbo: "Turbo"
};
var common$l = {
	name: "Siurblio kortelė",
	description: "Siurblio kortelė leidžia valdyti jūsų robotą siurblį",
	start: "Valyti",
	"continue": "Tęsti",
	pause: "Pristabdyti",
	stop: "Sustabdyti",
	return_to_base: "Statyti į doką",
	locate: "Ieškoti siurblio",
	not_available: "Siurblys yra nepasiekiamas"
};
var error$l = {
	missing_entity: "Būtina nurodyti entity!"
};
var editor$l = {
	entity: "Entity (Būtina)",
	map: "Žemėlapio kamera (Neprivaloma)",
	image: "Paveikslėlis (Neprivaloma)",
	compact_view: "Glaustas vaizdas",
	compact_view_aria_label_on: "Įjungti glaustą vaizdą",
	compact_view_aria_label_off: "Išjungti glaustą vaizdą",
	show_name: "Rodyti pavadinimą",
	show_name_aria_label_on: "Įjungti pavadinimo rodymą",
	show_name_aria_label_off: "Išjungti pavadinimo rodymą",
	show_status: "Rodyti būseną",
	show_status_aria_label_on: "Įjungti būsenos rodymą",
	show_status_aria_label_off: "Išjungti būsenos rodymą",
	show_toolbar: "Rodyti įrankių juostą",
	show_toolbar_aria_label_on: "Įjungti įrankių juostos rodymą",
	show_toolbar_aria_label_off: "Išjungti įrankių juostos rodymą",
	code_only_note: "Pastaba: Veiksmų ir statistikos nustatymai gali būti redaguojami tik naudojantis kodo redaguotoju."
};
var lt = {
	status: status$l,
	source: source$i,
	common: common$l,
	error: error$l,
	editor: editor$l
};

var lt$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$l,
    source: source$i,
    common: common$l,
    error: error$l,
    editor: editor$l,
    'default': lt
});

var status$m = {
	cleaning: "Curățare",
	auto: "Curățare Automată",
	spot: "Curățare Punct",
	edge: "Curățare Margini",
	single_room: "Curățare o singură cameră",
	paused: "Repauz",
	idle: "Inactiv",
	stop: "Oprit",
	charging: "Încărcare",
	"returning home": "Revenire Acasă",
	returning: "Revenire Acasă",
	docked: "Parcat",
	unknown: "Necunoscut",
	offline: "Deconectat",
	error: "Eroare"
};
var source$j = {
	gentle: "Blând",
	silent: "Silențios",
	standard: "Standard",
	medium: "Mediu",
	turbo: "Turbo",
	normal: "Normal",
	high: "Ridicat"
};
var common$m = {
	name: "Card de vid.",
	description: "Un card de vid vă permite să controlați vidul robotului.",
	start: "Curat",
	"continue": "Continuă",
	pause: "Repauz",
	stop: "Stop",
	return_to_base: "Parchează",
	locate: "Găsește Aspirator",
	not_available: "Aspiratorul nu este disponibil"
};
var error$m = {
	missing_entity: "Este necesară specificarea entității!"
};
var editor$m = {
	entity: "Entitate (Necesar)",
	map: "Camera Harta (Optional)",
	image: "Imagine (Optional)",
	compact_view: "Vizualizare compactă",
	compact_view_aria_label_on: "Pornește vizualizare compactă",
	compact_view_aria_label_off: "Oprește vizualizare compactă compact view off",
	show_name: "Arată Nume",
	show_name_aria_label_on: "Pornește arată nume",
	show_name_aria_label_off: "Oprește arată nume",
	show_status: "Arată Status",
	show_status_aria_label_on: "Pornește arată status",
	show_status_aria_label_off: "Oprește arată status",
	show_toolbar: "Arată bara de instrumente",
	show_toolbar_aria_label_on: "Pornește arată bara de instrumente",
	show_toolbar_aria_label_off: "Oprește arată bara de instrumente",
	code_only_note: "Notă: Acțiunile de setare și opțiunile de statistici sunt disponibile exclusiv folosind Editorul de cod."
};
var ro = {
	status: status$m,
	source: source$j,
	common: common$m,
	error: error$m,
	editor: editor$m
};

var ro$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    status: status$m,
    source: source$j,
    common: common$m,
    error: error$m,
    editor: editor$m,
    'default': ro
});

// Borrowed from:
var languages = {
  en: en$1,
  uk: uk$1,
  nl: nl$1,
  de: de$1,
  fr: fr$1,
  pl: pl$1,
  it: it$1,
  ru: ru$1,
  es: es$1,
  cs: cs$1,
  hu: hu$1,
  he: he$1,
  sv: sv$1,
  nb: nb$1,
  nn: nn$1,
  da: da$1,
  ko: ko$1,
  fi: fi$1,
  ca: ca$1,
  tw: tw$1,
  vi: vi$1,
  lt: lt$1,
  ro: ro$1
};
const DEFAULT_LANG = 'en';
function localize(string, search, replace) {
  const [section, key] = string.toLowerCase().split('.');
  let langStored;

  try {
    langStored = JSON.parse(localStorage.getItem('selectedLanguage'));
  } catch (e) {
    langStored = localStorage.getItem('selectedLanguage');
  }

  const lang = (langStored || navigator.language.split('-')[0] || DEFAULT_LANG).replace(/['"]+/g, '').replace('-', '_');
  let tranlated;

  try {
    tranlated = languages[lang][section][key];
  } catch (e) {
    tranlated = languages[DEFAULT_LANG][section][key];
  }

  if (tranlated === undefined) {
    tranlated = languages[DEFAULT_LANG][section][key];
  }

  if (tranlated === undefined) {
    return;
  }

  if (search !== '' && replace !== '') {
    tranlated = tranlated.replace(search, replace);
  }

  return tranlated;
}

class VacuumCardEditor extends LitElement {
  static get properties() {
    return {
      hass: Object,
      _config: Object,
      _toggle: Boolean
    };
  }

  setConfig(config) {
    this._config = config;

    if (!this._config.entity) {
      this._config.entity = this.getEntitiesByType('vacuum')[0] || '';
      C(this, 'config-changed', {
        config: this._config
      });
    }
  }

  get _entity() {
    if (this._config) {
      return this._config.entity || '';
    }

    return '';
  }

  get _map() {
    if (this._config) {
      return this._config.map || '';
    }

    return '';
  }

  get _image() {
    if (this._config) {
      return this._config.image || '';
    }

    return '';
  }

  get _show_name() {
    if (this._config) {
      return this._config.show_name || true;
    }

    return '';
  }

  get _show_status() {
    if (this._config) {
      return this._config.show_status || true;
    }

    return '';
  }

  get _show_toolbar() {
    if (this._config) {
      return this._config.show_toolbar || true;
    }

    return true;
  }

  get _compact_view() {
    if (this._config) {
      return this._config.compact_view || false;
    }

    return false;
  }

  getEntitiesByType(type) {
    return Object.keys(this.hass.states).filter(eid => eid.substr(0, eid.indexOf('.')) === type);
  }

  render() {
    if (!this.hass) {
      return html``;
    }

    const vacuumEntities = this.getEntitiesByType('vacuum');
    const cameraEntities = this.getEntitiesByType('camera');
    return html`
      <div class="card-config">
        <paper-dropdown-menu
          label="${localize('editor.entity')}"
          @value-changed=${this._valueChanged}
          .configValue=${'entity'}
        >
          <paper-listbox
            slot="dropdown-content"
            .selected=${vacuumEntities.indexOf(this._entity)}
          >
            ${vacuumEntities.map(entity => {
      return html` <paper-item>${entity}</paper-item> `;
    })}
          </paper-listbox>
        </paper-dropdown-menu>

        <paper-dropdown-menu
          label="${localize('editor.entity')}"
          @value-changed=${this._valueChanged}
          .configValue=${'map'}
        >
          <paper-listbox
            slot="dropdown-content"
            .selected=${cameraEntities.indexOf(this._map)}
          >
            ${cameraEntities.map(entity => {
      return html` <paper-item>${entity}</paper-item> `;
    })}
          </paper-listbox>
        </paper-dropdown-menu>

        <paper-input
          label="${localize('editor.image')}"
          .value=${this._image}
          .configValue=${'image'}
          @value-changed=${this._valueChanged}
        ></paper-input>

        <p class="option">
          <ha-switch
            aria-label=${localize(this._compact_view ? 'editor.compact_view_aria_label_off' : 'editor.compact_view_aria_label_on')}
            .checked=${this._compact_view !== false}
            .configValue=${'compact_view'}
            @change=${this._valueChanged}
          >
          </ha-switch>
          ${localize('editor.compact_view')}
        </p>

        <p class="option">
          <ha-switch
            aria-label=${localize(this._show_name ? 'editor.show_name_aria_label_off' : 'editor.show_name_aria_label_on')}
            .checked=${this._show_name !== false}
            .configValue=${'show_name'}
            @change=${this._valueChanged}
          >
          </ha-switch>
          ${localize('editor.show_name')}
        </p>

        <p class="option">
          <ha-switch
            aria-label=${localize(this._show_status ? 'editor.show_status_aria_label_off' : 'editor.show_status_aria_label_on')}
            .checked=${this._show_status !== false}
            .configValue=${'show_status'}
            @change=${this._valueChanged}
          >
          </ha-switch>
          ${localize('editor.show_status')}
        </p>

        <p class="option">
          <ha-switch
            aria-label=${localize(this._show_name ? 'editor.show_toolbar_aria_label_off' : 'editor.show_toolbar_aria_label_on')}
            .checked=${this._show_toolbar !== false}
            .configValue=${'show_toolbar'}
            @change=${this._valueChanged}
          >
          </ha-switch>
          ${localize('editor.show_toolbar')}
        </p>

        <strong>
          ${localize('editor.code_only_note')}
        </strong>
      </div>
    `;
  }

  _valueChanged(ev) {
    if (!this._config || !this.hass) {
      return;
    }

    const target = ev.target;

    if (this[`_${target.configValue}`] === target.value) {
      return;
    }

    if (target.configValue) {
      if (target.value === '') {
        delete this._config[target.configValue];
      } else {
        this._config = { ...this._config,
          [target.configValue]: target.checked !== undefined ? target.checked : target.value
        };
      }
    }

    C(this, 'config-changed', {
      config: this._config
    });
  }

  static get styles() {
    return css`
      .card-config paper-dropdown-menu {
        width: 100%;
      }

      .option {
        display: flex;
        align-items: center;
      }

      .option ha-switch {
        margin-right: 10px;
      }
    `;
  }

}
customElements.define('vacuum-card-editor', VacuumCardEditor);

var styles = css`
  :host {
    display: flex;
    flex: 1;
    flex-direction: column;
  }

  ha-card {
    flex-direction: column;
    flex: 1;
    position: relative;
    padding: 0px;
    border-radius: 4px;
    overflow: hidden;
  }

  .preview {
    background: var(--primary-color);
    cursor: pointer;
    overflow: hidden;
    position: relative;
    text-align: center;
  }

  .preview.not-available {
    filter: grayscale(1);
  }

  .map {
    max-width: 95%;
    image-rendering: -webkit-optimize-contrast;
    image-rendering: crisp-edges;
  }

  @keyframes cleaning {
    0% {
      transform: rotate(0) translate(0);
    }
    5% {
      transform: rotate(0) translate(0, -10px);
    }
    10% {
      transform: rotate(0) translate(0, 5px);
    }
    15% {
      transform: rotate(0) translate(0);
    }
    /* Turn left */
    20% {
      transform: rotate(30deg) translate(0);
    }
    25% {
      transform: rotate(30deg) translate(0, -10px);
    }
    30% {
      transform: rotate(30deg) translate(0, 5px);
    }
    35% {
      transform: rotate(30deg) translate(0);
    }
    40% {
      transform: rotate(0) translate(0);
    }
    /* Turn right */
    45% {
      transform: rotate(-30deg) translate(0);
    }
    50% {
      transform: rotate(-30deg) translate(0, -10px);
    }
    55% {
      transform: rotate(-30deg) translate(0, 5px);
    }
    60% {
      transform: rotate(-30deg) translate(0);
    }
    70% {
      transform: rotate(0deg) translate(0);
    }
    /* Staying still */
    100% {
      transform: rotate(0deg);
    }
  }

  @keyframes returning {
    0% {
      transform: rotate(0);
    }
    25% {
      transform: rotate(10deg);
    }
    50% {
      transform: rotate(0);
    }
    75% {
      transform: rotate(-10deg);
    }
    100% {
      transform: rotate(0);
    }
  }

  .vacuum {
    display: block;
    max-width: 90%;
    max-height: 200px;
    image-rendering: crisp-edges;
    margin: 30px auto 20px auto;
  }

  .vacuum.on,
  .vacuum.cleaning,
  .vacuum.auto,
  .vacuum.spot,
  .vacuum.edge,
  .vacuum.single_room {
    animation: cleaning 5s linear infinite;
  }

  .vacuum.returning {
    animation: returning 2s linear infinite;
  }

  .vacuum.paused {
    opacity: 100%;
  }

  .vacuum.docked {
    opacity: 50%;
  }

  .fill-gap {
    flex-grow: 1;
  }

  .header {
    height: 40px;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    color: var(--text-primary-color);
  }

  .battery {
    text-align: right;
    font-weight: bold;
    padding: 8px;
  }

  .source {
    text-align: center;
  }

  .status {
    display: flex;
    align-items: center;
    justify-content: center;
    direction: ltr;
  }

  .status-text {
    color: var(--text-primary-color);
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    margin-left: calc(20px + 9px); /* size + margin of spinner */
  }

  .status ha-circular-progress {
    --mdc-theme-primary: var(
      --card-background-color
    ); /* hack to override the color */
    min-width: 24px;
    width: 24px;
    height: 24px;
    margin-left: 9px;
  }

  .vacuum-name {
    text-align: center;
    font-weight: bold;
    color: var(--text-primary-color);
    font-size: 16px;
  }

  .not-available .offline {
    text-align: center;
    color: var(--text-primary-color);
    font-size: 16px;
  }

  .metadata {
    margin: 10px auto;
  }

  .stats {
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    display: flex;
    flex-direction: row;
    justify-content: space-evenly;
    color: var(--text-primary-color);
  }

  .stats-block {
    margin: 10px 0px;
    text-align: center;
    border-right: 1px solid rgba(255, 255, 255, 0.2);
    flex-grow: 1;
  }

  .stats-block:last-child {
    border: 0px;
  }

  .stats-value {
    font-size: 20px;
    font-weight: bold;
  }

  ha-icon {
    color: #fff;
  }

  .toolbar {
    background: var(--lovelace-background, var(--primary-background-color));
    min-height: 30px;
    display: flex;
    flex-direction: row;
    flex-flow: row wrap;
    flex-wrap: wrap;
    justify-content: space-evenly;
  }

  .toolbar ha-icon-button {
    color: var(--primary-color);
    flex-direction: column;
    width: 44px;
    height: 44px;
    --mdc-icon-button-size: 44px;
    margin: 5px 0;
  }

  .toolbar ha-icon-button:first-child {
    margin-left: 5px;
  }

  .toolbar ha-icon-button:last-child {
    margin-right: 5px;
  }

  .toolbar paper-button {
    color: var(--primary-color);
    flex-direction: column;
    margin-right: 10px;
    padding: 15px 10px;
    cursor: pointer;
  }

  .toolbar ha-icon-button:active,
  .toolbar paper-button:active {
    opacity: 0.4;
    background: rgba(0, 0, 0, 0.1);
  }

  .toolbar paper-button {
    color: var(--primary-color);
    flex-direction: row;
  }

  .toolbar ha-icon {
    color: var(--primary-color);
    padding-right: 15px;
  }
`;

const img = "data:image/png;base64,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";

var version = "1.24.1";

console.info(`%c VACUUM-CARD %c ${version} `, 'color: white; background: blue; font-weight: 700;', 'color: blue; background: white; font-weight: 700;');

if (!customElements.get('ha-icon-button')) {
  customElements.define('ha-icon-button', class extends customElements.get('paper-icon-button') {});
}

class VacuumCard extends LitElement {
  static get properties() {
    return {
      hass: Object,
      config: Object,
      requestInProgress: Boolean
    };
  }

  static get styles() {
    return styles;
  }

  static async getConfigElement() {
    return document.createElement('vacuum-card-editor');
  }

  static getStubConfig(hass, entities) {
    const [vacuumEntity] = entities.filter(eid => eid.substr(0, eid.indexOf('.')) === 'vacuum');
    return {
      entity: vacuumEntity || '',
      image: 'default'
    };
  }

  get entity() {
    return this.hass.states[this.config.entity];
  }

  get map() {
    if (!this.hass) {
      return null;
    }

    return this.hass.states[this.config.map];
  }

  get image() {
    if (this.config.image === 'default') {
      return img;
    }

    return this.config.image || img;
  }

  get showName() {
    if (this.config.show_name === undefined) {
      return true;
    }

    return this.config.show_name;
  }

  get showStatus() {
    if (this.config.show_status === undefined) {
      return true;
    }

    return this.config.show_status;
  }

  get showToolbar() {
    if (this.config.show_toolbar === undefined) {
      return true;
    }

    return this.config.show_toolbar;
  }

  get compactView() {
    if (this.config.compact_view === undefined) {
      return false;
    }

    return this.config.compact_view;
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error(localize('error.missing_entity'));
    }

    this.config = config;
  }

  getCardSize() {
    return this.config.compact_view || false ? 3 : 8;
  }

  shouldUpdate(changedProps) {
    return Y(this, changedProps);
  }

  updated(changedProps) {
    if (changedProps.get('hass') && changedProps.get('hass').states[this.config.entity].state !== this.hass.states[this.config.entity].state) {
      this.requestInProgress = false;
    }
  }

  connectedCallback() {
    super.connectedCallback();

    if (!this.compactView && this.map) {
      this.requestUpdate();
      this.thumbUpdater = setInterval(() => this.requestUpdate(), (this.config.map_refresh || 5) * 1000);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    if (this.map) {
      clearInterval(this.thumbUpdater);
    }
  }

  handleMore() {
    C(this, 'hass-more-info', {
      entityId: this.entity.entity_id
    }, {
      bubbles: true,
      composed: true
    });
  }

  handleSpeed(e) {
    const fan_speed = e.target.getAttribute('value');
    this.callService('set_fan_speed', false, {
      fan_speed
    });
  }

  callService(service, isRequest = true, options = {}) {
    this.hass.callService('vacuum', service, {
      entity_id: this.config.entity,
      ...options
    });

    if (isRequest) {
      this.requestInProgress = true;
      this.requestUpdate();
    }
  }

  getAttributes(entity) {
    const {
      status,
      state,
      fan_speed,
      fan_speed_list,
      battery_level,
      battery_icon,
      friendly_name
    } = entity.attributes;
    return {
      status: status || state || entity.state,
      fan_speed,
      fan_speed_list,
      battery_level,
      battery_icon,
      friendly_name
    };
  }

  renderSource() {
    const {
      fan_speed: source,
      fan_speed_list: sources
    } = this.getAttributes(this.entity);

    if (!sources) {
      return html``;
    }

    const selected = sources.indexOf(source);
    return html`
      <paper-menu-button
        slot="dropdown-trigger"
        .horizontalAlign=${'right'}
        .verticalAlign=${'top'}
        .verticalOffset=${40}
        .noAnimations=${true}
        @click="${e => e.stopPropagation()}"
      >
        <paper-button slot="dropdown-trigger">
          <ha-icon icon="mdi:fan"></ha-icon>
          <span show=${true}>
            ${localize(`source.${source}`) || source}
          </span>
        </paper-button>
        <paper-listbox
          slot="dropdown-content"
          selected=${selected}
          @click="${e => this.handleSpeed(e)}"
        >
          ${sources.map(item => html`<paper-item value=${item}
                >${localize(`source.${item}`) || item}</paper-item
              >`)}
        </paper-listbox>
      </paper-menu-button>
    `;
  }

  renderMapOrImage(state) {
    if (this.compactView) {
      return html``;
    }

    if (this.map) {
      return this.hass.states[this.config.map] && this.hass.states[this.config.map].attributes.entity_picture ? html`<img
            class="map"
            src="${this.hass.states[this.config.map].attributes.entity_picture}&v=${+new Date()}"
          />` : html``;
    }

    if (this.image) {
      return html`<img class="vacuum ${state}" src="${this.image}" />`;
    }

    return html``;
  }

  renderStats(state) {
    const {
      stats = {}
    } = this.config;
    const statsList = stats[state] || stats.default || [];
    return statsList.map(({
      entity_id,
      attribute,
      unit,
      subtitle
    }) => {
      if (!entity_id && !attribute) {
        return html``;
      }

      const value = entity_id ? this.hass.states[entity_id].state : lodash_get(this.entity.attributes, attribute);
      return html`
        <div class="stats-block">
          <span class="stats-value">${value}</span>
          ${unit}
          <div class="stats-subtitle">${subtitle}</div>
        </div>
      `;
    });
  }

  renderName() {
    const {
      friendly_name
    } = this.getAttributes(this.entity);

    if (!this.showName) {
      return html``;
    }

    return html`
      <div class="vacuum-name">
        ${friendly_name}
      </div>
    `;
  }

  renderStatus() {
    const {
      status
    } = this.getAttributes(this.entity);
    const localizedStatus = localize(`status.${status}`) || status;

    if (!this.showStatus) {
      return html``;
    }

    return html`
      <div class="status">
        <span class="status-text" alt=${localizedStatus}>
          ${localizedStatus}
        </span>
        <ha-circular-progress
          .active=${this.requestInProgress}
          size="small"
        ></ha-circular-progress>
      </div>
    `;
  }

  renderToolbar(state) {
    if (!this.showToolbar) {
      return html``;
    }

    switch (state) {
      case 'on':
      case 'auto':
      case 'spot':
      case 'edge':
      case 'single_room':
      case 'cleaning':
        {
          return html`
          <div class="toolbar">
            <paper-button @click="${() => this.callService('pause')}">
              <ha-icon icon="hass:pause"></ha-icon>
              ${localize('common.pause')}
            </paper-button>
            <paper-button @click="${() => this.callService('stop')}">
              <ha-icon icon="hass:stop"></ha-icon>
              ${localize('common.stop')}
            </paper-button>
            <paper-button @click="${() => this.callService('return_to_base')}">
              <ha-icon icon="hass:home-map-marker"></ha-icon>
              ${localize('common.return_to_base')}
            </paper-button>
          </div>
        `;
        }

      case 'paused':
        {
          return html`
          <div class="toolbar">
            <paper-button @click="${() => this.callService('start')}">
              <ha-icon icon="hass:play"></ha-icon>
              ${localize('common.continue')}
            </paper-button>
            <paper-button @click="${() => this.callService('return_to_base')}">
              <ha-icon icon="hass:home-map-marker"></ha-icon>
              ${localize('common.return_to_base')}
            </paper-button>
          </div>
        `;
        }

      case 'returning':
        {
          return html`
          <div class="toolbar">
            <paper-button @click="${() => this.callService('start')}">
              <ha-icon icon="hass:play"></ha-icon>
              ${localize('common.continue')}
            </paper-button>
            <paper-button @click="${() => this.callService('pause')}">
              <ha-icon icon="hass:pause"></ha-icon>
              ${localize('common.pause')}
            </paper-button>
          </div>
        `;
        }

      case 'docked':
      case 'idle':
      default:
        {
          const {
            actions = []
          } = this.config;
          const buttons = actions.map(({
            name,
            service,
            icon,
            service_data
          }) => {
            const execute = () => {
              const [domain, name] = service.split('.');
              this.hass.callService(domain, name, service_data);
            };

            return html`<ha-icon-button
            icon="${icon}"
            title="${name}"
            @click="${execute}"
          ><ha-icon icon="${icon}"></ha-icon></ha-icon-button>`;
          });
          const dockButton = html`
          <ha-icon-button
            icon="hass:home-map-marker"
            title="${localize('common.return_to_base')}"
            @click="${() => this.callService('return_to_base')}"
          ><ha-icon icon="hass:home-map-marker"></ha-icon>
          </ha-icon-button>
        `;
          return html`
          <div class="toolbar">
            <ha-icon-button
              icon="hass:play"
              title="${localize('common.start')}"
              @click="${() => this.callService('start')}"
            ><ha-icon icon="hass:play"></ha-icon>
            </ha-icon-button>

            <ha-icon-button
              icon="mdi:map-marker"
              title="${localize('common.locate')}"
              @click="${() => this.callService('locate', false)}"
            ><ha-icon icon="mdi:map-marker"></ha-icon>
            </ha-icon-button>

            ${state === 'idle' ? dockButton : ''}
            <div class="fill-gap"></div>
            ${buttons}
          </div>
        `;
        }
    }
  }

  render() {
    if (!this.entity) {
      return html`
        <ha-card>
          <div class="preview not-available">
            <div class="metadata">
              <div class="not-available">
                ${localize('common.not_available')}
              </div>
            <div>
          </div>
        </ha-card>
      `;
    }

    const {
      state
    } = this.entity;
    const {
      battery_level,
      battery_icon
    } = this.getAttributes(this.entity);
    return html`
      <ha-card>
        <div
          class="preview"
          @click="${() => this.handleMore()}"
          ?more-info="true"
        >
          <div class="header">
            <div class="source">
              ${this.renderSource()}
            </div>
            <div class="battery">
              ${battery_level}% <ha-icon icon="${battery_icon}"></ha-icon>
            </div>
          </div>

          ${this.renderMapOrImage(state)}

          <div class="metadata">
            ${this.renderName()} ${this.renderStatus()}
          </div>

          <div class="stats">
            ${this.renderStats(state)}
          </div>
        </div>

        ${this.renderToolbar(state)}
      </ha-card>
    `;
  }

}

customElements.define('vacuum-card', VacuumCard);
window.customCards = window.customCards || [];
window.customCards.push({
  preview: true,
  type: 'vacuum-card',
  name: localize('common.name'),
  description: localize('common.description')
});
