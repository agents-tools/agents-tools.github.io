import MarkdownIt from "markdown-it";
import GithubSlugger from "github-slugger";

export const markdown = new MarkdownIt({ html: false });
export const escape = markdown.utils.escapeHtml;

export function section(source, title) {
  const tokens = markdown.parse(source, {});
  const start = tokens.findIndex(
    (token, index) =>
      token.type === "heading_open" && token.tag === "h2" && tokens[index + 1].content === title,
  );
  if (start < 0) throw new Error(`Missing README section: ${title}`);
  const end = tokens.findIndex(
    (token, index) => index > start && token.type === "heading_open" && token.tag === "h2",
  );
  return source
    .split("\n")
    .slice(tokens[start].map[0], end < 0 ? undefined : tokens[end].map[0])
    .join("\n");
}

export function rewriteLink(href, { repository, revision, path, anchors }) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return href;
  if (href.startsWith("#") && anchors.has(decodeURIComponent(href.slice(1)))) return href;
  const base = new URL(`https://source.invalid/${path}`);
  const target = new URL(href, base);
  const sourcePath = target.pathname.slice(1);
  if (repository === "agents-tools/cli" && sourcePath === "Documentation/Reference/CLI.md")
    return `/docs/cli/${target.search}${target.hash}`;
  return `https://github.com/${repository}/blob/${revision}/${sourcePath}${target.search}${target.hash}`;
}

export function renderMarkdown(source, identity) {
  const tokens = markdown.parse(source, {});
  const slugger = new GithubSlugger();
  const headings = [];
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].type !== "heading_open") continue;
    const inline = tokens[index + 1];
    const text = inline.children.map((child) => child.content).join("");
    const id = slugger.slug(text);
    tokens[index].attrSet("id", id);
    headings.push({ id, text, level: Number(tokens[index].tag.slice(1)) });
  }
  const anchors = new Set(headings.map(({ id }) => id));
  function visit(token) {
    if (token.type === "link_open") {
      token.attrSet("href", rewriteLink(token.attrGet("href"), { ...identity, anchors }));
    }
    if (token.type === "image") {
      throw new Error(`Markdown image needs an explicit vendored source: ${token.attrGet("src")}`);
    }
    for (const child of token.children ?? []) visit(child);
  }
  tokens.forEach(visit);
  let tableIndex = 0;
  const renderer = new MarkdownIt({ html: false });
  renderer.renderer.rules.table_open = () =>
    `<section class="table-scroll" aria-label="${escape(identity.label)} table ${++tableIndex}" tabindex="0"><table>`;
  renderer.renderer.rules.table_close = () => "</table></section>\n";
  const fence = renderer.renderer.rules.fence;
  renderer.renderer.rules.fence = (...args) =>
    fence(...args).replace("<pre>", '<pre tabindex="0" aria-label="Code block">');
  return { html: renderer.renderer.render(tokens, renderer.options, {}), headings };
}
