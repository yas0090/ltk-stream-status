type Attrs = Record<string, string | boolean | undefined>;
type Child = Node | string | null | undefined | false;

// 外部から来た文字列（配信タイトルなど）は必ず textContent で入れる
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    el.setAttribute(name, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return el;
}

export const externalLink = (href: string, attrs: Attrs, ...children: Child[]) =>
  h("a", { href, target: "_blank", rel: "noopener noreferrer", ...attrs }, ...children);
