// Markdown minimo e sicuro per pagine e blog: titoli, paragrafi, liste,
// grassetto, corsivo, link, codice inline. Il testo viene prima neutralizzato
// (niente HTML dell'autore), poi convertito. Zero dipendenze.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, (_m, text, href) => {
      const external = href.startsWith("http");
      return `<a href="${href}"${external ? ' rel="noopener" target="_blank"' : ""}>${text}</a>`;
    });
}

export function renderMarkdown(md: string): string {
  const lines = esc(md.replace(/\r\n/g, "\n")).split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let ordered = false;
  let tabella: string[][] = [];
  const cella = (r: string) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const flushTabella = () => {
    if (tabella.length) {
      const [testa, ...corpo] = tabella;
      out.push(
        `<div class="tabella"><table><thead><tr>${testa.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>` +
          `<tbody>${corpo.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`,
      );
    }
    tabella = [];
  };
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list.length) out.push(`<${ordered ? "ol" : "ul"}>${list.map((x) => `<li>${inline(x)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
    list = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^[-*]\s+(.*)$/.exec(line);
    const oli = /^\d+[.)]\s+(.*)$/.exec(line);
    const rigaTabella = /^\|.*\|$/.test(line.trim());
    const separatore = /^\|[\s:|-]+\|$/.test(line.trim());
    if (rigaTabella) {
      flushPara();
      flushList();
      if (!separatore) tabella.push(cella(line.trim()));
      continue;
    }
    if (tabella.length && !rigaTabella) flushTabella();
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (h) {
      flushPara();
      flushList();
      // # e ## diventano h2 (l'h1 è il titolo della pagina), ### diventa h3.
      const level = h[1].length <= 2 ? 2 : 3;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
    } else if (li || oli) {
      flushPara();
      const isOrdered = Boolean(oli);
      if (list.length && ordered !== isOrdered) flushList();
      ordered = isOrdered;
      list.push((li ?? oli)![1]);
    } else if (/^(&gt;|>)\s?/.test(line)) {
      // Il testo è già passato per esc(): il > della citazione qui è &gt;.
      flushPara();
      flushList();
      out.push(`<blockquote>${inline(line.replace(/^(&gt;|>)\s?/, ""))}</blockquote>`);
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  flushTabella();
  return out.join("\n");
}

/** Estratto testuale per description e card: prime ~N lettere senza marcatori. */
export function excerpt(md: string, max = 160): string {
  const t = md.replace(/[#*`>\[\]]/g, "").replace(/\(https?:[^)]*\)/g, "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
