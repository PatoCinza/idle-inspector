const ELEMENT = 1;

const sameAttributes = (a, b) => a.attributes.length === b.attributes.length
  && [...a.attributes].every((attribute) => b.getAttribute(attribute.name) === attribute.value);

const sameShape = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName;

const patchNode = (current, next) => {
  if (current.isEqualNode(next)) return;
  if (next.nodeType !== ELEMENT || !sameAttributes(current, next)) {
    current.replaceWith(next);
    return;
  }
  patchChildren(current, next);
};

export const patchChildren = (target, source) => {
  const current = [...target.childNodes];
  const next = [...source.childNodes];
  if (current.length !== next.length || next.some((node, i) => !sameShape(node, current[i]))) {
    target.replaceChildren(...next);
    return;
  }
  next.forEach((node, i) => patchNode(current[i], node));
};

export const patchHtml = (target, html) => {
  const template = target.ownerDocument.createElement('template');
  template.innerHTML = html;
  patchChildren(target, template.content);
};
